import { Router } from 'express';
import { openai } from '../lib/openaiClient.js';
import {
  SYSTEM_PROMPT_INTERVIEW_START,
  SYSTEM_PROMPT_INTERVIEW_EVAL,
  SYSTEM_PROMPT_INTERVIEW_FINAL,
  SYSTEM_PROMPT_INTERVIEW_RESOURCES
} from '../lib/prompts.js';
import multer from 'multer';
import { requireAuth } from '../lib/authMiddleware.js';
import { generateWithFallbackDetailed } from '../lib/AIProviderService.js';
import { closeInterviewSession } from '../lib/closeInterviewSession.js';
import {
  getHasApiKey, resolveTokens, classifyOpenAIError, TRANSCRIBE_ERROR_RESPONSES,
  audioExtensionFromMime, buildProfileSummary, buildPriorEvalSummary, buildQAPairs, MAX_INTERVIEW_CONTEXT_CHARS, averageInterviewScore, sanitizeContentFeedback, buildFinalInterviewPrompt, getSessionTokenBudget, resolveInterviewResponseMode, withInterviewResponseMode, groundInterviewGuideMetrics, isExplicitInterviewNonAnswer
} from '../services/interviewService.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = Router();

// ─── Configuración IA y presupuesto de tokens ──────────────────────────────
const MODEL         = 'gpt-4o-mini';
const AI_PROVIDER   = 'openai';
const MAX_QUESTIONS = 5;

// Repreguntas de profundización: no cuentan para el total de preguntas.
// Máximo por pregunta principal, controlado por backend.
const MAX_FOLLOWUPS_PER_QUESTION = 1;
const MAX_FOLLOWUPS_PER_SESSION = 2;

// Presupuesto por sesión: 12000 tokens totales, 1500 reservados siempre para feedback final.
// Si (budget - usado - reservado) < MIN_PER_CALL antes de una nueva pregunta → finalizar anticipadamente.
// (Subido de 8000 para absorber hasta 1 repregunta por pregunta principal.)
// Presupuesto variable calculado con el contexto, limitado a 120 000 tokens.
const RESERVED_FEEDBACK   = 2000;
const MIN_TOKENS_PER_CALL = 600;

// max_tokens por tipo de llamada (limita output y por tanto el costo)
const MAX_OUT_QUESTION = 250;
const MAX_OUT_EVAL     = 1400;
const MAX_OUT_FINAL    = 1800;

// ─── Helpers ───────────────────────────────────────────────────────────────

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

const handleAudioUpload = (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        errorCode: 'file_too_large',
        error: 'El audio es demasiado grande. Intenta grabar una respuesta más corta o responde por escrito.'
      });
    }
    if (err) return next(err);
    next();
  });
};

// ─── Transcribir audio ─────────────────────────────────────────────────────
router.post('/interview/transcribe', requireAuth, handleAudioUpload, async (req, res) => {
  console.log('[/interview/transcribe] Solicitud recibida.');
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, errorCode: 'server', error: 'Falta el archivo de audio (campo "file").' });
    }
    if (!getHasApiKey()) {
      console.error('[/interview/transcribe] OPENAI_API_KEY no configurada en backend.');
      const r = TRANSCRIBE_ERROR_RESPONSES.invalid_api_key;
      return res.status(r.status).json({ success: false, errorCode: 'invalid_api_key', error: r.error });
    }
    // Audio demasiado pequeño = sin voz; no gastar una llamada a Whisper
    if (req.file.size < 1000) {
      const r = TRANSCRIBE_ERROR_RESPONSES.empty_audio;
      return res.status(r.status).json({ success: false, errorCode: 'empty_audio', error: r.error });
    }

    // Escribir archivo temporal
    const extension = audioExtensionFromMime(req.file.mimetype);
    const tempFileName = `temp_${Date.now()}_${Math.random().toString(36).substring(7)}.${extension}`;
    const tempFilePath = path.join(__dirname, '..', tempFileName);
    
    // Log info del archivo original recibido
    console.log('[/interview/transcribe] OriginalName:', req.file.originalname || 'audio.webm');
    console.log('[/interview/transcribe] Tipo MIME original:', req.file.mimetype);
    console.log('[/interview/transcribe] Tamaño buffer original:', req.file.size, 'bytes');
    console.log('[/interview/transcribe] TempFilePath destino:', tempFilePath);

    fs.writeFileSync(tempFilePath, req.file.buffer);

    // Validar creación y tamaño en disco
    const fileExists = fs.existsSync(tempFilePath);
    console.log('[/interview/transcribe] ¿Archivo temporal existe en disco?:', fileExists);
    if (fileExists) {
      console.log('[/interview/transcribe] Tamaño archivo temporal en disco:', fs.statSync(tempFilePath).size, 'bytes');
    }

    console.log('[/interview/transcribe] Llamando a OpenAI transcriptions...');
    let transcription;
    try {
      transcription = await openai.audio.transcriptions.create({
        file: fs.createReadStream(tempFilePath),
        model: 'whisper-1',
        language: 'es'
      }, { timeout: 45000 });
      console.log('[/interview/transcribe] Transcripción completada.');
    } catch (openaiErr) {
      console.error('[/interview/transcribe] Error completo al llamar a OpenAI:');
      console.error('- Message:', openaiErr.message);
      console.error('- Status/Code:', openaiErr.status || openaiErr.code, '| Name:', openaiErr.name, '| Type:', openaiErr.error?.type);
      if (openaiErr.response) {
        console.error('- Response Data:', openaiErr.response.data);
      }
      const classified = classifyOpenAIError(openaiErr);
      const r = TRANSCRIBE_ERROR_RESPONSES[classified.errorCode] || TRANSCRIBE_ERROR_RESPONSES.server;
      return res.status(r.status).json({
        success: false,
        errorCode: classified.errorCode,
        error: r.error
      });
    } finally {
      // Garantizar eliminación del archivo temporal
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
        console.log('[/interview/transcribe] Archivo temporal eliminado:', tempFileName);
      }
    }

    // Whisper suele "alucinar" frases fijas cuando el audio es silencio o ruido
    // (créditos de subtítulos, "gracias por ver", etc.). Las eliminamos.
    const cleanTranscription = (text) => {
      if (!text) return '';
      const hallucinations = [
        /subt[ií]tulos?[^.]*amara\.org/gi,
        /subt[ií]tulos? realizados por la comunidad de amara\.org/gi,
        /gracias por ver(?: el)?(?: v[ií]deo)?/gi,
        /\bsuscr[ií]bete\b/gi,
        /www\.amara\.org/gi
      ];
      let cleaned = text;
      hallucinations.forEach(re => { cleaned = cleaned.replace(re, ''); });
      return cleaned.replace(/\s{2,}/g, ' ').trim();
    };
    const cleanedText = cleanTranscription(transcription.text);

    return res.json({
      success: true,
      text: cleanedText,
      transcript: cleanedText,
      emptyAudio: cleanedText === ''
    });
  } catch (err) {
    console.error('[/interview/transcribe] Error general no controlado:', err);
    const r = TRANSCRIBE_ERROR_RESPONSES.server;
    return res.status(r.status).json({
      success: false,
      errorCode: 'server',
      error: r.error
    });
  }
});

const generateSessionAnalysis = async (req, interview, pairs) => {
  const prompt = buildFinalInterviewPrompt(interview, pairs);
  const { content, usage, provider, model } = await generateWithFallbackDetailed({
    useCase: 'interview_feedback', messages: [{role:'system',content:SYSTEM_PROMPT_INTERVIEW_FINAL},{role:'user',content:prompt}],
    db:req.db,userId:req.user.id,jsonMode:true,maxTokens:MAX_OUT_FINAL
  });
  const result = sanitizeContentFeedback(JSON.parse(content));
  if (!result || typeof result.general_analysis !== 'string' || !Number.isFinite(result.overall_score) || result.overall_score < 0 || result.overall_score > 100 || !Array.isArray(result.recommendations) || result.recommendations.length < 3) throw new Error('La IA devolvió un análisis final inválido.');
  return { result:{...result,ai_provider:provider || null,ai_model:model || null,prompt_version:'pi2-interview-v3-grounded'}, tokens:resolveTokens(usage,prompt+content) };
};
const persistSessionAnalysis = async (db,pairs,result) => {
  const last = pairs.at(-1);
  if (!last?.msgId) throw new Error('No se identificó la respuesta final guardada.');
  const {error} = await db.from('interview_messages').update({evaluation:{...sanitizeContentFeedback(last.evaluation),session_summary:result}}).eq('id',last.msgId);
  if(error) throw new Error('No se pudo guardar el análisis final.');
};
const toSessionResponses = (pairs) => pairs.map(p=>({question:p.question,response:p.answer,feedback:sanitizeContentFeedback(p.evaluation)}));

// ─── POST /interview/start ─────────────────────────────────────────────────
router.post('/interview/start', requireAuth, async (req, res) => {


  const profileId    = req.body.profileId || req.body.userId || req.body.user_id;
  const interviewType = req.body.interviewType || req.body.interview_type;
  const difficultyLevel = req.body.difficultyLevel || req.body.difficulty_level || 'intermediate';

  if (!profileId || !interviewType) {
    return res.status(400).json({ error: 'Faltan parámetros: profileId e interviewType.' });
  }
  if (!['general', 'technical', 'behavioral'].includes(interviewType)) {
    return res.status(400).json({ error: 'Tipo de entrevista inválido.' });
  }
  if (!['basic', 'intermediate', 'advanced'].includes(difficultyLevel)) {
    return res.status(400).json({ error: 'Nivel de dificultad de entrevista inválido.' });
  }
  // BYOK: no exigimos key del servidor. Si no hay ninguna key (ni del usuario
  // ni del servidor), la llamada a la IA fallará y se clasificará el error abajo.

  const supabaseClient = req.db;

  // 1. Cargar perfil
  const { data: profile, error: profileError } = await supabaseClient
    .from('profiles')
    .select('*')
    .eq('id', profileId)
    .single();

  if (profileError || !profile) {
    console.warn('[/interview/start] Perfil no encontrado:', profileError?.message);
    return res.status(404).json({ error: 'Perfil no encontrado.' });
  }

  // 2. Validar campos mínimos del perfil
  const missing = [];
  if (!profile.first_name?.trim()) missing.push('nombre');
  if (!profile.career?.trim())      missing.push('carrera');
  if (!profile.target_role?.trim()) missing.push('puesto objetivo');
  if (!profile.target_job_description?.trim()) missing.push('descripción del puesto objetivo');
  if (!profile.bio?.trim())         missing.push('resumen profesional');
  if (!(profile.technical_skills?.length)) missing.push('al menos 1 habilidad técnica');
  if (!(profile.soft_skills?.length))      missing.push('al menos 1 habilidad blanda');

  if (missing.length > 0) {
    return res.status(400).json({ error: 'Completa tu perfil antes de iniciar una entrevista personalizada.', missingFields: missing });
  }

  const [workResult, academicResult] = await Promise.all([
    supabaseClient.from('work_experience').select('*').eq('profile_id',profileId),
    supabaseClient.from('academic_background').select('*').eq('profile_id',profileId)
  ]);
  if(workResult.error || academicResult.error) return res.status(500).json({error:'No se pudo cargar tu experiencia y formación. Reintenta antes de iniciar.'});
  const profileSummary = withInterviewResponseMode(buildProfileSummary(profile, workResult.data || [], academicResult.data || []),req.body.responseMode === 'text' ? 'text' : 'voice');
  if(profileSummary.length > MAX_INTERVIEW_CONTEXT_CHARS) return res.status(400).json({error:'El perfil y la descripción exceden el tamaño de contexto admitido. Ajusta la descripción sin omitir requisitos relevantes; no hemos recortado tus datos.'});


  // 3. Obtener preguntas previas del usuario para evitar repeticiones (máx 10)
  let pastQuestions = [];
  try {
    const { data: prevInterviews } = await supabaseClient
      .from('interviews')
      .select('id')
      .eq('profile_id', profileId);

    if (prevInterviews?.length) {
      const ids = prevInterviews.map(i => i.id);
      const { data: pastMsgs } = await supabaseClient
        .from('interview_messages')
        .select('message_content')
        .eq('sender', 'ai')
        .in('interview_id', ids)
        .order('created_at', { ascending: false })
        .limit(10);
      pastQuestions = pastMsgs?.map(m => m.message_content) || [];
    }
  } catch (histErr) {
    console.warn('[/interview/start] No se pudo cargar historial de preguntas:', histErr.message);
  }

  // 3b. Limpieza de entrevistas activas previas de forma segura (evita sesiones duplicadas)
  try {
    const { data: activePrev } = await supabaseClient
      .from('interviews')
      .select('id')
      .eq('profile_id', profileId)
      .eq('status', 'active');

    if (activePrev?.length) {
      for (const act of activePrev) {
        await closeInterviewSession({
          interviewId: act.id,
          userId: profileId,
          action: 'abandon',
          userScopedDb: supabaseClient
        });
      }
    }
  } catch (cleanErr) {
    console.warn('[/interview/start] Advertencia durante limpieza de entrevistas activas previas:', cleanErr.message);
  }

  // 4. Crear registro de entrevista (status=active)
  const { data: interview, error: intError } = await supabaseClient
    .from('interviews')
    .insert({
      profile_id:     profileId,
      interview_type: interviewType,
      status:         'active',
      total_questions: MAX_QUESTIONS,
      ai_provider:    AI_PROVIDER,
      ai_model:       MODEL,
      profile_summary: profileSummary,
      reserved_tokens: RESERVED_FEEDBACK,
      difficulty_level: difficultyLevel
    })
    .select()
    .single();

  if (intError) {
    console.error('[/interview/start] Error creando entrevista en DB:', intError.message);
    return res.status(500).json({ error: 'Error al crear la sesión de entrevista.' });
  }

  console.log('[/interview/start] Entrevista creada ID:', interview.id);

  // 5. Generar primera pregunta con IA
  const startPrompt = `Perfil resumido: ${profileSummary}
Tipo de entrevista: ${interviewType}
Nivel de dificultad: ${difficultyLevel}
Preguntas recientes (NO repetir): ${pastQuestions.length ? pastQuestions.slice(0, 8).map((q, i) => `${i + 1}. ${q}`).join(' | ') : 'Ninguna.'}

Formula la primera pregunta de apertura de la entrevista para el nivel de dificultad seleccionado.`;

  let firstQuestion = '';
  let tokensUsed    = 0;

  console.log('[/interview/start] Modelo:', MODEL, '| Llamando a OpenAI...');


  try {
    const { content, usage, provider, model } = await generateWithFallbackDetailed({
      useCase: 'interview_questions',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT_INTERVIEW_START },
        { role: 'user',   content: startPrompt }
      ],
      db: supabaseClient,
      userId: req.user.id,
      maxTokens: MAX_OUT_QUESTION
    });

    if(typeof content !== 'string' || !content.trim()) throw new Error('La IA no generó una pregunta válida.');
    firstQuestion = content.trim();
    tokensUsed    = resolveTokens(usage, startPrompt + firstQuestion);
    await supabaseClient.from('interviews').update({ai_provider:provider || null,ai_model:model || null}).eq('id',interview.id);

    console.log('[/interview/start] Tokens usados:', tokensUsed);
  } catch (apiErr) {
    const classified = classifyOpenAIError(apiErr);
    console.error('[/interview/start] Error OpenAI:', classified.type, apiErr.message);

    // Marcar entrevista como failed_to_start y eliminarla de la vista activa
    await supabaseClient
      .from('interviews')
      .update({ status: 'failed_to_start', ai_error_type: classified.type })
      .eq('id', interview.id);

    return res.status(502).json({ error: classified.userMsg, aiErrorType: classified.type });
  }

  // 6. Guardar primera pregunta y actualizar tokens en la entrevista
  const startWrites = await Promise.all([
    supabaseClient.from('interview_messages').insert({
      interview_id:    interview.id,
      sender:          'ai',
      message_content: firstQuestion,
      // En mensajes 'ai' la columna evaluation se usa como metadata del mensaje
      evaluation:      { message_kind: 'main', question_index: 1, response_mode: req.body.responseMode === 'text' ? 'text' : 'voice', context_version: 'pi2-interview-v2' }
    }),
    supabaseClient
      .from('interviews')
      .update({ estimated_tokens_used: tokensUsed })
      .eq('id', interview.id)
  ]);

  if(startWrites.some(result=>result.error)) {
    await supabaseClient.from('interviews').update({status:'failed_to_start'}).eq('id',interview.id);
    return res.status(500).json({error:'No se pudo guardar la primera pregunta. Reintenta iniciar la entrevista.'});
  }
  return res.json({
    success:        true,
    interviewId:    interview.id,
    firstQuestion,
    totalQuestions: MAX_QUESTIONS,
    difficultyLevel
  });
});

// ─── POST /interview/respond ───────────────────────────────────────────────
router.post('/interview/respond', requireAuth, async (req, res) => {


  const { interviewId, userAnswer } = req.body;
  const answer = userAnswer || req.body.userResponse;
  const responseMode = req.body.responseMode === 'voice' ? 'voice' : 'text';
  const responseTimedOut = req.body.responseTimedOut === true && answer === '[Sin respuesta: tiempo de respuesta agotado]';

  if (!interviewId) {
    return res.status(400).json({ error: 'Falta interviewId.' });
  }
  if(typeof answer !== 'string') return res.status(400).json({error:'La respuesta debe ser texto.'});
  if(answer.length > 12000) return res.status(400).json({error:'La respuesta excede el límite de 12 000 caracteres. Reduce su extensión antes de enviarla; no se ha recortado.'});
  if (!answer?.trim()) {
    return res.status(400).json({ error: 'La respuesta no puede estar vacía.' });
  }
  // BYOK: no exigimos key del servidor. Si no hay ninguna key (ni del usuario
  // ni del servidor), la llamada a la IA fallará y se clasificará el error abajo.

  const supabaseClient = req.db;

  // 1. Cargar entrevista
  const { data: interview, error: intErr } = await supabaseClient
    .from('interviews')
    .select('*')
    .eq('id', interviewId)
    .single();

  if (intErr || !interview) {
    return res.status(404).json({ error: 'Entrevista no encontrada.' });
  }
  if (interview.status !== 'active') {
    return res.status(400).json({ error: 'Esta entrevista no está activa.' });
  }

  // 2. Cargar mensajes existentes para contexto compacto
  const { data: messages, error: msgsErr } = await supabaseClient
    .from('interview_messages')
    .select('*')
    .eq('interview_id', interviewId)
    .order('created_at', { ascending: true });

  if (msgsErr) {
    return res.status(500).json({ error: 'Error al cargar historial de mensajes.' });
  }

  const questionsAnswered = interview.questions_answered || 0;
  const tokensUsed        = interview.estimated_tokens_used || 0;
  const profileSummary    = interview.profile_summary;
  const interviewType     = interview.interview_type;
  const difficultyLevel   = interview.difficulty_level || 'intermediate';
  const totalQuestions    = interview.total_questions || MAX_QUESTIONS;

  // 3. Determinar la pregunta actual
  const lastAiMsg       = [...messages].reverse().find(m => m.sender === 'ai');
  const currentQuestion = lastAiMsg?.message_content;
  if(!currentQuestion) return res.status(409).json({error:'No existe una pregunta guardada para responder.'});

  // 3b. Contexto de repregunta: localizar la última pregunta principal y
  // contar las repreguntas posteriores. Los mensajes ai sin metadata
  // (entrevistas antiguas) cuentan como pregunta principal.
  const aiMsgs = messages.filter(m => m.sender === 'ai');
  let lastMainIdx = -1;
  for (let i = aiMsgs.length - 1; i >= 0; i--) {
    if ((aiMsgs[i].evaluation?.message_kind || 'main') === 'main') {
      lastMainIdx = i;
      break;
    }
  }
  const followUpsUsed   = lastMainIdx >= 0 ? aiMsgs.length - 1 - lastMainIdx : 0;
  const inFollowUpRound = followUpsUsed > 0;
  const mainQuestion    = lastMainIdx >= 0 ? aiMsgs[lastMainIdx].message_content : currentQuestion;
  const lastUserMsg     = [...messages].reverse().find(m => m.sender === 'user');
  const originalAnswer  = inFollowUpRound ? (lastUserMsg?.message_content || '') : null;

  // 4. Calcular presupuesto restante y decidir si es la última pregunta
  const sessionTokenBudget = getSessionTokenBudget(profileSummary,totalQuestions);
  const remainingBudget = sessionTokenBudget - tokensUsed - RESERVED_FEEDBACK;
  const budgetExhausted = remainingBudget < MIN_TOKENS_PER_CALL;
  const reachedMax      = questionsAnswered >= totalQuestions - 1;
  const isLastQuestion  = reachedMax || budgetExhausted;

  // Solo se permite repreguntar si aún no se repreguntó en esta pregunta, no es
  // la última pregunta, y queda presupuesto para la evaluación posterior.
  const sessionFollowUps = aiMsgs.filter(m => m.evaluation?.message_kind === 'follow_up').length;
  const canFollowUp =
    !responseTimedOut && !isExplicitInterviewNonAnswer(answer) && sessionFollowUps < MAX_FOLLOWUPS_PER_SESSION &&
    !inFollowUpRound &&
    followUpsUsed < MAX_FOLLOWUPS_PER_QUESTION &&
    !isLastQuestion &&
    remainingBudget >= 2 * MIN_TOKENS_PER_CALL;

  if (budgetExhausted) {
    console.warn(`[/interview/respond] Presupuesto bajo (${remainingBudget} tokens restantes). Forzando cierre anticipado.`);
  }

  // 5. Construir prompt compacto para la evaluación
  const priorEvalSummary = buildPriorEvalSummary(messages);
  const exchangeContext = inFollowUpRound
    ? `Pregunta ${questionsAnswered + 1} de ${totalQuestions}: ${mainQuestion}
Respuesta original del candidato: ${originalAnswer}
Repregunta de profundización realizada: ${currentQuestion}
Respuesta del candidato a la repregunta: ${answer}
Estás evaluando la respuesta a una REPREGUNTA: evalúa el INTERCAMBIO COMPLETO como una sola respuesta y devuelve action "next_question".`
    : `Pregunta ${questionsAnswered + 1} de ${totalQuestions}: ${currentQuestion}
Respuesta del candidato: ${answer}
Repregunta disponible: ${canFollowUp
        ? 'SÍ. PUEDES devolver action "follow_up" si la respuesta es vaga o carece de ejemplos, métricas o estructura.'
        : 'NO. Evalúa y avanza con action "next_question".'}`;

  const priorMainQuestions = aiMsgs.filter(m => (m.evaluation?.message_kind || 'main') === 'main').map(m => m.message_content);
  const evalPrompt = `Perfil resumido: ${profileSummary}
Tipo de entrevista: ${interviewType}
Nivel de dificultad: ${difficultyLevel}
${responseTimedOut ? 'El sistema registra tiempo agotado sin respuesta. No es contenido del candidato ni demuestra falta de conocimientos; describe ausencia de respuesta, puntúa este turno con 0 y continúa sin repreguntar.' : ''}
Formula una sola pregunta breve (máximo 45 palabras), sin repetir los temas ya abordados.
Preguntas principales ya formuladas en esta sesión (no repetir ni reformular el mismo tema): ${JSON.stringify(priorMainQuestions)}
${exchangeContext}${priorEvalSummary ? `\nEvaluaciones previas (resumen): ${priorEvalSummary}` : ''}

${isLastQuestion
    ? 'Es la ÚLTIMA pregunta: evalúa SOLO este intercambio, marca is_finished: true y next_question: null. Después se solicitará un análisis consolidado independiente con todos los pares.'
    : 'Si no usas follow_up, genera la siguiente pregunta para continuar la entrevista.'}`;

  console.log('[/interview/respond] Tokens presupuesto:', { tokensUsed, remainingBudget, isLastQuestion });


  // 6. Llamar a OpenAI
  let evalJson   = null;
  let newTokens  = 0;

  try {
    const { content: raw, usage, provider, model } = await generateWithFallbackDetailed({
      useCase: 'interview_feedback',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT_INTERVIEW_EVAL },
        { role: 'user',   content: evalPrompt }
      ],
      db: supabaseClient,
      userId: req.user.id,
      jsonMode: true,
      maxTokens: MAX_OUT_EVAL
    });

    evalJson    = JSON.parse(raw);
    if(evalJson.feedback) evalJson.feedback={...evalJson.feedback,ai_provider:provider || null,ai_model:model || null,prompt_version:'pi2-interview-v3-grounded'};
    newTokens   = resolveTokens(usage, evalPrompt + raw);

    console.log('[/interview/respond] Eval OpenAI OK. Tokens:', newTokens);

  } catch (apiErr) {
    const classified = classifyOpenAIError(apiErr);
    console.error('[/interview/respond] Error OpenAI:', classified.type, apiErr.message);

    if (classified.type === 'rate_limit') {
      // Guardar la respuesta del usuario SIN evaluación y marcar pendiente
      await supabaseClient.from('interview_messages').insert({
        interview_id:    interviewId,
        sender:          'user',
        message_content: answer,
        evaluation:      {response_mode:responseMode,assessment_status:'pending'}
      });
      await supabaseClient
        .from('interviews')
        .update({
          status:            'pending_ai_feedback',
          ai_error_type:     'rate_limit',
          questions_answered: questionsAnswered + 1
        })
        .eq('id', interviewId);

      return res.status(202).json({
        success:           false,
        pendingFeedback:   true,
        interviewId,
        error: 'Tus respuestas fueron guardadas correctamente. La IA no está disponible temporalmente para generar el análisis final. Podrás solicitarlo más tarde.'
      });
    }

    return res.status(502).json({ error: classified.userMsg, aiErrorType: classified.type });
  }

  // 7. Decidir acción de forma defensiva: si la IA pide follow_up sin permiso
  // o sin repregunta, se fuerza el avance. Si llega el formato antiguo (sin
  // "action"), se comporta como next_question (retrocompatible).
  const action = (evalJson.action === 'follow_up' && canFollowUp && evalJson.follow_up_question)
    ? 'follow_up'
    : 'next_question';

  if (responseTimedOut && evalJson.feedback) evalJson.feedback.score = 0;
  if(action === 'next_question' && (!evalJson.feedback || !Number.isFinite(evalJson.feedback.score) || evalJson.feedback.score < 0 || evalJson.feedback.score > 100)) {
    return res.status(502).json({error:'La IA devolvió una evaluación incompleta. Tu respuesta sigue disponible para reintentar.'});
  }
  evalJson.feedback = evalJson.feedback ? {...groundInterviewGuideMetrics(sanitizeContentFeedback(evalJson.feedback),profileSummary,[originalAnswer,answer]),response_mode:responseMode} : null;
  if(action === 'next_question' && !isLastQuestion && !evalJson.is_finished && !evalJson.next_question?.trim()) {
    return res.status(502).json({error:'La IA no generó la siguiente pregunta. Reintenta; no se avanzó la sesión.'});
  }

  // 9. Rama de repregunta: guardar respuesta sin evaluación + repregunta de IA.
  // NO incrementa questions_answered ni cambia el status: la pregunta principal
  // sigue abierta hasta que el candidato responda la repregunta.
  if (action === 'follow_up') {
    await supabaseClient.from('interview_messages').insert({
      interview_id:    interviewId,
      sender:          'user',
      message_content: answer,
      evaluation:      {response_mode:responseMode,assessment_status:'pending'}
    });
    await supabaseClient.from('interview_messages').insert({
      interview_id:    interviewId,
      sender:          'ai',
      message_content: evalJson.follow_up_question,
      evaluation:      { message_kind: 'follow_up', question_index: questionsAnswered + 1 }
    });
    await supabaseClient
      .from('interviews')
      .update({
        estimated_tokens_used: tokensUsed + newTokens
      })
      .eq('id', interviewId);

    console.log('[/interview/respond] Repregunta emitida para la pregunta', questionsAnswered + 1);

    return res.json({
      success:        true,
      action:         'follow_up',
      feedback:       null,
      isFinished:     false,
      nextQuestion:   evalJson.follow_up_question,
      questionNumber: questionsAnswered + 1,
      completedEarly: false
    });
  }

  // 10. Determinar estado de finalización
  const shouldFinish    = isLastQuestion || evalJson.is_finished;
  const nextQuestion    = shouldFinish ? null : evalJson.next_question;
  const finalStatus     = shouldFinish
    ? ((budgetExhausted || questionsAnswered+1 < totalQuestions) ? 'completed_early' : 'completed')
    : 'active';

  if (responseTimedOut) evalJson.feedback = { ...evalJson.feedback, score: 0, response_timed_out: true };

  // 11. Guardar mensaje del usuario con su evaluación
  const {data:savedAnswer,error:saveAnswerError} = await supabaseClient.from('interview_messages').insert({
    interview_id:interviewId,sender:'user',message_content:answer,evaluation:evalJson.feedback
  }).select('*').single();
  if(saveAnswerError) return res.status(500).json({error:'No se pudo guardar tu respuesta. No se avanzó la entrevista.'});

  // 12. Guardar siguiente pregunta de IA si continúa
  if (!shouldFinish && nextQuestion) {
    await supabaseClient.from('interview_messages').insert({
      interview_id:    interviewId,
      sender:          'ai',
      message_content: nextQuestion,
      evaluation:      { message_kind: 'main', question_index: questionsAnswered + 2 }
    });
  }

  // 13. Actualizar estado de la entrevista
  const updatePayload = {
    questions_answered:     questionsAnswered + 1,
    estimated_tokens_used:  tokensUsed + newTokens,
    status:                 finalStatus
  };
  if (shouldFinish) {
    updatePayload.completed_at = new Date().toISOString();
  }

  await supabaseClient
    .from('interviews')
    .update(updatePayload)
    .eq('id', interviewId);

  let sessionSummary = null;
  const allPairs = buildQAPairs([...messages,savedAnswer]);
  if(shouldFinish) {
    try {
      const analysis = await generateSessionAnalysis(req,interview,allPairs);
      sessionSummary = analysis.result;
      await persistSessionAnalysis(supabaseClient,allPairs,sessionSummary);
      await supabaseClient.from('interviews').update({estimated_tokens_used:tokensUsed+newTokens+analysis.tokens}).eq('id',interviewId);
    } catch(error) {
      await supabaseClient.from('interviews').update({status:'pending_ai_feedback',ai_error_type:classifyOpenAIError(error).type}).eq('id',interviewId);
      return res.status(202).json({success:false,pendingFeedback:true,interviewId,error:'Tus respuestas quedaron guardadas. El análisis final de IA está pendiente; podrás reintentarlo.'});
    }
  }

  console.log('[/interview/respond] Estado final:', finalStatus, '| Tokens acumulados:', tokensUsed + newTokens);

  return res.json({
    success:      true,
    action:       'next_question',
    feedback:     evalJson.feedback,
    isFinished:   shouldFinish,
    nextQuestion,
    questionNumber: questionsAnswered + 2,
    completedEarly: finalStatus === 'completed_early',
    sessionResponses: toSessionResponses(allPairs),
    overallScore: averageInterviewScore(allPairs),
    sessionSummary
  });
});

// ─── POST /interview/generate-pending-feedback ─────────────────────────────
// Recupera respuestas guardadas de una entrevista interrumpida y genera el análisis final con IA.
router.post('/interview/generate-pending-feedback', requireAuth, async (req, res) => {
  console.log('[/interview/generate-pending-feedback] Solicitud recibida para:', req.user.id);

  const { interviewId } = req.body;
  if (!interviewId) {
    return res.status(400).json({ error: 'Falta interviewId.' });
  }
  // BYOK: no exigimos key del servidor. Si no hay ninguna key (ni del usuario
  // ni del servidor), la llamada a la IA fallará y se clasificará el error abajo.

  const supabaseClient = req.db;

  const { data: interview, error: intErr } = await supabaseClient
    .from('interviews')
    .select('*')
    .eq('id', interviewId)
    .single();

  if (intErr || !interview) {
    return res.status(404).json({ error: 'Entrevista no encontrada.' });
  }
  if (interview.status !== 'pending_ai_feedback') {
    return res.status(400).json({ error: 'Esta entrevista no tiene feedback pendiente.' });
  }

  const { data: messages } = await supabaseClient
    .from('interview_messages')
    .select('*')
    .eq('interview_id', interviewId)
    .order('created_at', { ascending: true });

  const pairs = buildQAPairs(messages || []);
  if (!pairs.length) {
    return res.status(400).json({ error: 'No hay respuestas guardadas para generar feedback.' });
  }

  const finalPrompt = buildFinalInterviewPrompt(interview,pairs);

  let finalJson = null;
  let newTokens = 0;

  try {
    const { content: raw, usage, provider, model } = await generateWithFallbackDetailed({
      useCase: 'interview_feedback',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT_INTERVIEW_FINAL },
        { role: 'user',   content: finalPrompt }
      ],
      db: supabaseClient,
      userId: req.user.id,
      jsonMode: true,
      maxTokens: MAX_OUT_FINAL
    });

    finalJson = {...sanitizeContentFeedback(JSON.parse(raw)),ai_provider:provider || null,ai_model:model || null,prompt_version:'pi2-interview-v3-grounded'};
    if(!finalJson?.general_analysis || !Number.isFinite(finalJson.overall_score) || !Array.isArray(finalJson.recommendations) || finalJson.recommendations.length < 3) throw new Error('Análisis de IA inválido.');
    await persistSessionAnalysis(supabaseClient,pairs,finalJson);
    newTokens = resolveTokens(usage, finalPrompt + raw);

  } catch (apiErr) {
    const classified = classifyOpenAIError(apiErr);
    console.error('[/interview/generate-pending-feedback] Error OpenAI:', classified.type, apiErr.message);
    return res.status(502).json({ error: classified.userMsg, aiErrorType: classified.type });
  }

  // Actualizar entrevista como completada
  await supabaseClient
    .from('interviews')
    .update({
      status: pairs.length < (interview.total_questions || MAX_QUESTIONS) ? 'completed_early' : 'completed',
      estimated_tokens_used: (interview.estimated_tokens_used || 0) + newTokens,
      completed_at:          new Date().toISOString(),
      ai_error_type:         null
    })
    .eq('id', interviewId);

  // Construir sessionResponses para el frontend
  const sessionResponses = pairs.map(p => ({
    question: p.question,
    response: p.answer,
    feedback: p.hasEval
      ? p.evaluation
      : { score: null, general_comment: 'Incluido en el análisis final consolidado.', strengths: [], improvements: [] }
  }));

  return res.json({
    success:         true,
    completedEarly: pairs.length < (interview.total_questions || MAX_QUESTIONS),
    overallScore:    averageInterviewScore(pairs),
    aiOverallScore: finalJson.overall_score,
    generalAnalysis: finalJson.general_analysis,
    strengths:       finalJson.strengths       || [],
    improvements:    finalJson.improvements    || [],
    recommendations: finalJson.recommendations || [],
    sessionResponses
  });
});

const sendResumableInterview = async (req, res) => {
  const { userId } = req.params;
  const supabaseClient = req.db;

  const { data: interview, error } = await supabaseClient
    .from('interviews')
    .select('*')
    .eq('profile_id', userId)
    .eq('status', 'paused')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('[/interview/active] Error:', error.message);
    return res.status(400).json({ error: 'No se pudo consultar la entrevista en curso.' });
  }
  if (!interview) {
    return res.json({ success: true, activeInterview: null });
  }

  const { data: messages } = await supabaseClient
    .from('interview_messages')
    .select('*')
    .eq('interview_id', interview.id)
    .order('created_at', { ascending: true });

  return res.json({ success: true, activeInterview: interview, messages: messages || [] });
};

// ─── GET /interview/resumable/:userId ──────────────────────────────────────
// Devuelve únicamente sesiones pausadas. Solo status='paused' es reanudable.
router.get('/interview/resumable/:userId', requireAuth, sendResumableInterview);

// Compatibilidad con el consumidor existente: ya no devuelve status='active'.
router.get('/interview/active/:userId', requireAuth, sendResumableInterview);

// ─── POST /interview/pause ─────────────────────────────────────────────────
router.post('/interview/pause', requireAuth, async (req, res) => {
  const { interviewId } = req.body;
  if (!interviewId) {
    return res.status(400).json({ error: 'Falta interviewId.' });
  }

  const supabaseClient = req.db;
  const { data: interview, error: readErr } = await supabaseClient
    .from('interviews')
    .select('*')
    .eq('id', interviewId)
    .single();

  if (readErr || !interview) {
    return res.status(404).json({ error: 'Entrevista no encontrada.' });
  }
  if (interview.profile_id !== req.user.id) {
    return res.status(403).json({ error: 'No tienes permiso para pausar esta entrevista.' });
  }
  if (interview.status === 'paused') {
    const { data: messages } = await supabaseClient
      .from('interview_messages')
      .select('*')
      .eq('interview_id', interviewId)
      .order('created_at', { ascending: true });
    return res.json({ success: true, interview, messages: messages || [] });
  }
  if (interview.status !== 'active') {
    return res.status(400).json({ error: 'Solo se puede pausar una entrevista activa.' });
  }

  const { data: updated, error: updateErr } = await supabaseClient
    .from('interviews')
    .update({ status: 'paused', profile_summary:withInterviewResponseMode(interview.profile_summary,req.body.responseMode === 'text' ? 'text' : req.body.responseMode === 'voice' ? 'voice' : resolveInterviewResponseMode(interview.profile_summary) || 'voice') })
    .eq('id', interviewId)
    .select('*')
    .single();

  if (updateErr) {
    console.error('[/interview/pause] Error:', updateErr.message);
    return res.status(500).json({ error: 'No se pudo pausar la entrevista.' });
  }

  const { data: messages } = await supabaseClient
    .from('interview_messages')
    .select('*')
    .eq('interview_id', interviewId)
    .order('created_at', { ascending: true });

  return res.json({ success: true, interview: updated, responseMode:resolveInterviewResponseMode(updated.profile_summary), messages: messages || [] });
});

// ─── POST /interview/resume ────────────────────────────────────────────────
router.post('/interview/resume', requireAuth, async (req, res) => {
  const { interviewId } = req.body;
  if (!interviewId) {
    return res.status(400).json({ error: 'Falta interviewId.' });
  }

  const supabaseClient = req.db;
  const { data: interview, error: readErr } = await supabaseClient
    .from('interviews')
    .select('*')
    .eq('id', interviewId)
    .single();

  if (readErr || !interview) {
    return res.status(404).json({ error: 'Entrevista no encontrada.' });
  }
  if (interview.profile_id !== req.user.id) {
    return res.status(403).json({ error: 'No tienes permiso para reanudar esta entrevista.' });
  }
  if (interview.status !== 'paused') {
    return res.status(400).json({ error: 'Solo se puede reanudar una entrevista pausada.' });
  }

  const { data: updated, error: updateErr } = await supabaseClient
    .from('interviews')
    .update({ status: 'active' })
    .eq('id', interviewId)
    .select('*')
    .single();

  if (updateErr) {
    console.error('[/interview/resume] Error:', updateErr.message);
    return res.status(500).json({ error: 'No se pudo reanudar la entrevista.' });
  }

  const { data: messages } = await supabaseClient
    .from('interview_messages')
    .select('*')
    .eq('interview_id', interviewId)
    .order('created_at', { ascending: true });

  return res.json({ success: true, interview: updated, responseMode:resolveInterviewResponseMode(updated.profile_summary), messages: messages || [] });
});

// ─── POST /interview/finish ────────────────────────────────────────────────
// Termina una entrevista en curso con lo respondido hasta ahora. Genera el
// análisis final SOLO sobre las preguntas respondidas y marca 'completed_early'.
// Si no hay respuestas registradas, la descarta.
router.post('/interview/finish', requireAuth, async (req, res) => {
  const { interviewId } = req.body;
  if (!interviewId) {
    return res.status(400).json({ error: 'Falta interviewId.' });
  }

  const supabaseClient = req.db;

  const { data: interview, error: intErr } = await supabaseClient
    .from('interviews')
    .select('*')
    .eq('id', interviewId)
    .single();

  if (intErr || !interview) {
    return res.status(404).json({ error: 'Entrevista no encontrada.' });
  }
  if (!['active', 'pending_ai_feedback'].includes(interview.status)) {
    return res.status(400).json({ error: 'Esta entrevista ya está finalizada.' });
  }

  const { data: messages } = await supabaseClient
    .from('interview_messages')
    .select('*')
    .eq('interview_id', interviewId)
    .order('created_at', { ascending: true });

  const pairs = buildQAPairs(messages || []);

  // Sin respuestas registradas → no hay nada que evaluar: se descarta.
  if (!pairs.length) {
    const result = await closeInterviewSession({
      interviewId,
      userId: req.user.id,
      action: 'finish',
      hasAnswers: false,
      userScopedDb: supabaseClient
    });

    if (!result.ok) {
      return res.status(500).json({ error: result.error || 'No se pudo descartar la entrevista.' });
    }

    return res.json({
      success: true,
      discarded: true,
      finalStatus: result.finalStatus,
      message: 'La entrevista se cerró sin respuestas suficientes para generar evaluación.'
    });
  }

  const finalPrompt = buildFinalInterviewPrompt(interview,pairs);

  let finalJson = null;
  let newTokens = 0;

  try {
    const { content: raw, usage, provider, model } = await generateWithFallbackDetailed({
      useCase: 'interview_feedback',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT_INTERVIEW_FINAL },
        { role: 'user',   content: finalPrompt }
      ],
      db: supabaseClient,
      userId: req.user.id,
      jsonMode: true,
      maxTokens: MAX_OUT_FINAL
    });

    finalJson = {...sanitizeContentFeedback(JSON.parse(raw)),ai_provider:provider || null,ai_model:model || null,prompt_version:'pi2-interview-v3-grounded'};
    if(!finalJson?.general_analysis || !Number.isFinite(finalJson.overall_score) || !Array.isArray(finalJson.recommendations) || finalJson.recommendations.length < 3) throw new Error('Análisis de IA inválido.');
    await persistSessionAnalysis(supabaseClient,pairs,finalJson);
    newTokens = resolveTokens(usage, finalPrompt + raw);
  } catch (apiErr) {
    const classified = classifyOpenAIError(apiErr);
    console.error('[/interview/finish] Error IA:', classified.type, apiErr.message);
    // Si la IA falla, guardamos como pendiente para reintentar el análisis luego.
    await supabaseClient
      .from('interviews')
      .update({ status: 'pending_ai_feedback', ai_error_type: classified.type })
      .eq('id', interviewId);
    return res.status(202).json({
      success: false,
      pendingFeedback: true,
      interviewId,
      error: 'Guardamos tus respuestas. La IA no está disponible ahora; podrás generar el análisis más tarde.'
    });
  }

  const closeResult = await closeInterviewSession({
    interviewId,
    userId: req.user.id,
    action: 'finish',
    hasAnswers: true,
    userScopedDb: supabaseClient
  });

  if (!closeResult.ok) {
    return res.status(500).json({ error: 'Generamos el feedback pero no se pudo cerrar la entrevista.' });
  }

  await supabaseClient
    .from('interviews')
    .update({
      estimated_tokens_used: (interview.estimated_tokens_used || 0) + newTokens,
      ai_error_type:         null
    })
    .eq('id', interviewId);

  const sessionResponses = pairs.map(p => ({
    question: p.question,
    response: p.answer,
    feedback: p.hasEval
      ? p.evaluation
      : { score: null, general_comment: 'Incluido en el análisis final consolidado.', strengths: [], improvements: [] }
  }));

  return res.json({
    success:         true,
    completedEarly:  true,
    overallScore:    averageInterviewScore(pairs),
    aiOverallScore: finalJson.overall_score,
    generalAnalysis: finalJson.general_analysis,
    strengths:       finalJson.strengths       || [],
    improvements:    finalJson.improvements    || [],
    recommendations: finalJson.recommendations || [],
    sessionResponses
  });
});

// ─── POST /interview/abandon ───────────────────────────────────────────────
// Descarta una entrevista en curso (o pendiente). Elimina el registro y sus
// mensajes (cascade). No permite descartar entrevistas ya completadas.
router.post('/interview/abandon', requireAuth, async (req, res) => {
  const { interviewId } = req.body;
  if (!interviewId) {
    return res.status(400).json({ error: 'Falta interviewId.' });
  }

  const result = await closeInterviewSession({
    interviewId,
    userId: req.user.id,
    action: 'abandon',
    userScopedDb: req.db
  });

  if (!result.ok) {
    return res.status(500).json({ error: result.error || 'No se pudo descartar la entrevista.' });
  }

  return res.json({ success: true, message: 'Entrevista descartada.' });
});

// ─── GET /interview/list/:userId ───────────────────────────────────────────
// Lista las entrevistas completadas del usuario con métricas resumidas por
// entrevista, para poder compararlas (HU16).
router.get('/interview/list/:userId', requireAuth, async (req, res) => {
  const { userId } = req.params;
  const db = req.db;

  const { data: interviews, error } = await db
    .from('interviews')
    .select('id, interview_type, difficulty_level, status, created_at, completed_at, questions_answered, total_questions, interview_messages(sender, evaluation)')
    .eq('profile_id', userId)
    .in('status', ['completed', 'completed_early'])
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[/interview/list] Error:', error.message);
    return res.status(400).json({ error: 'No se pudo cargar el historial de entrevistas.' });
  }

  const avg = (arr) => (arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null);

  const list = (interviews || []).map(i => {
    const evals = (i.interview_messages || [])
      .filter(m => m.sender === 'user' && m.evaluation)
      .map(m => m.evaluation);
    const scores    = evals.map(e => e.score).filter(s => typeof s === 'number');
    const fluencies = evals.map(e => e.fluency_score).filter(s => typeof s === 'number');
    return {
      id:                 i.id,
      interview_type:     i.interview_type,
      difficulty_level:   i.difficulty_level,
      status:             i.status,
      created_at:         i.created_at,
      completed_at:       i.completed_at,
      questions_answered: i.questions_answered,
      total_questions:    i.total_questions,
      avg_score:          avg(scores),
      avg_fluency:        null,
      answers_count:      evals.length
    };
  });

  return res.json({ success: true, interviews: list });
});

// ─── GET /interview/pending/:userId ───────────────────────────────────────
router.get('/interview/pending/:userId', requireAuth, async (req, res) => {
  const { userId } = req.params;
  const supabaseClient = req.db;

  const { data, error } = await supabaseClient
    .from('interviews')
    .select('id, interview_type, created_at, questions_answered, total_questions, ai_error_type')
    .eq('profile_id', userId)
    .eq('status', 'pending_ai_feedback')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[/interview/pending] Error:', error.message);
    return res.status(400).json({ error: 'No se pudo completar la consulta solicitada.', code: 'QUERY_FAILED' });
  }

  return res.json({ success: true, pendingInterviews: data || [] });
});

// ─── GET /metrics/:userId ──────────────────────────────────────────────────
router.get('/metrics/:userId', requireAuth, async (req, res) => {
  const { userId } = req.params;
  const supabaseClient = req.db;

  const { data: interviews, error } = await supabaseClient
    .from('interviews')
    .select('*, interview_messages(*)')
    .eq('profile_id', userId)
    .in('status', ['completed', 'completed_early']);

  if (error) {
    return res.status(400).json({ error: 'No se pudo completar la consulta solicitada.', code: 'QUERY_FAILED' });
  }

  let totalScore    = 0;
  let evaluatedCount = 0;

  (interviews || []).forEach(i => {
    const userMsgs = i.interview_messages?.filter(m => m.sender === 'user' && m.evaluation) || [];
    userMsgs.forEach(m => {
      if (typeof m.evaluation.score === 'number') {
        totalScore += m.evaluation.score;
        evaluatedCount++;
      }
    });
  });

  const avgScore = evaluatedCount > 0 ? Math.round(totalScore / evaluatedCount) : null;

  return res.json({
    success: true,
    stats: {
      totalInterviews: interviews?.length || 0,
      avgScore:        avgScore === null ? null : `${avgScore}%`,
      streak:          0
    }
  });
});

// ─── GET /resources/:userId ────────────────────────────────────────────────
router.get('/resources/:userId', requireAuth, async (req, res) => {
  const { userId } = req.params;
  const supabaseClient = req.db;

  const { data: profile, error } = await supabaseClient
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (error || !profile) {
    return res.status(404).json({ error: 'Perfil no encontrado.' });
  }

  const career = profile.career || 'Tecnología';

  // Recomendaciones extraídas de evaluaciones reales de entrevistas completadas
  const { data: interviews } = await supabaseClient
    .from('interviews')
    .select('*, interview_messages(*)')
    .eq('profile_id', userId)
    .in('status', ['completed', 'completed_early']);

  const dynamicResources = [];
  const seenResources    = new Set();

  (interviews || []).forEach(interview => {
    const userMsgs = interview.interview_messages?.filter(m => m.sender === 'user' && m.evaluation) || [];
    userMsgs.forEach(m => {
      (m.evaluation.recommendations || []).forEach(rec => {
        if (rec?.suggested_resource && !seenResources.has(rec.suggested_resource)) {
          seenResources.add(rec.suggested_resource);
          dynamicResources.push({
            title:       rec.suggested_resource,
            description: `Recomendado para superar tu debilidad en "${rec.weakness}". ${rec.reason}`,
            category:    'Technical'
          });
        }
      });
    });
  });

  // Si no hay recomendaciones de entrevistas, generarlas con IA (BYOK con fallback al servidor)
  if (dynamicResources.length === 0) {
    try {
      const profileSummary = buildProfileSummary(profile);
      const { content } = await generateWithFallbackDetailed({
        useCase: 'interview_feedback',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT_INTERVIEW_RESOURCES },
          { role: 'user', content: profileSummary }
        ],
        db: supabaseClient,
        userId: req.user.id,
        jsonMode: true,
        maxTokens: 400
      });

      const gJson = JSON.parse(content);
      (gJson.resources || []).forEach(r => {
        if (r.title && !seenResources.has(r.title)) {
          seenResources.add(r.title);
          dynamicResources.push({ title: r.title, description: r.description, category: r.category || 'General' });
        }
      });
    } catch (genErr) {
      console.warn('[/resources] No se pudieron generar recursos con IA:', genErr.message);
    }
  }

  return res.json({ success: true, resources: dynamicResources });
});

export default router;
