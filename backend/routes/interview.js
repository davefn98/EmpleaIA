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

// Presupuesto por sesión: 12000 tokens totales, 1500 reservados siempre para feedback final.
// Si (budget - usado - reservado) < MIN_PER_CALL antes de una nueva pregunta → finalizar anticipadamente.
// (Subido de 8000 para absorber hasta 1 repregunta por pregunta principal.)
const TOKEN_BUDGET        = 12000;
const RESERVED_FEEDBACK   = 1500;
const MIN_TOKENS_PER_CALL = 600;

// max_tokens por tipo de llamada (limita output y por tanto el costo)
const MAX_OUT_QUESTION = 250;
const MAX_OUT_EVAL     = 700;
const MAX_OUT_FINAL    = 900;

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

const getHasApiKey = () =>
  process.env.OPENAI_API_KEY &&
  process.env.OPENAI_API_KEY !== 'tu-api-key-de-openai' &&
  process.env.OPENAI_API_KEY.trim() !== '';

// ~3.5 caracteres por token en español (heurística conservadora)
const estimateTokens = (text) => Math.ceil((text || '').length / 3.5);

// Extrae tokens reales del objeto usage de OpenAI, con fallback a estimación
const resolveTokens = (usage, fallbackText) =>
  usage?.total_tokens || estimateTokens(fallbackText);

const classifyOpenAIError = (err) => {
  const status  = err?.status || err?.response?.status;
  const type    = err?.error?.type || err?.code || '';
  const msg     = (err?.error?.message || err?.message || '').toLowerCase();

  if (
    status === 429 ||
    type === 'insufficient_quota' ||
    type === 'rate_limit_exceeded' ||
    msg.includes('quota') ||
    msg.includes('rate_limit') ||
    msg.includes('billing')
  ) {
    return {
      type: 'rate_limit',
      errorCode: 'quota',
      userMsg: 'La IA no está disponible temporalmente por límite de cuota. Intenta nuevamente más tarde.'
    };
  }
  if (status === 404 || type === 'model_not_found') {
    return { type: 'model_not_found', errorCode: 'server', userMsg: 'El modelo de IA configurado no está disponible.' };
  }
  if (status === 401 || type === 'invalid_api_key') {
    return { type: 'invalid_api_key', errorCode: 'invalid_api_key', userMsg: 'La API key de OpenAI no está configurada correctamente.' };
  }
  if (
    err?.name === 'APIConnectionTimeoutError' ||
    type === 'ETIMEDOUT' ||
    type === 'ECONNRESET' ||
    msg.includes('timeout') ||
    msg.includes('timed out')
  ) {
    return { type: 'timeout', errorCode: 'timeout', userMsg: 'La IA tardó demasiado en responder. Intenta nuevamente.' };
  }
  if (
    status === 400 &&
    (msg.includes('invalid file format') || msg.includes('unsupported') || msg.includes('could not be decoded') || msg.includes('format'))
  ) {
    return { type: 'unsupported_format', errorCode: 'unsupported_format', userMsg: 'El formato de audio no es compatible.' };
  }
  return {
    type: 'unknown',
    errorCode: 'server',
    userMsg: `Error de IA (${status || 'desconocido'}): ${err?.error?.message || err?.message || 'Sin detalle.'}`
  };
};

// Mapea la clasificación a la respuesta HTTP del endpoint de transcripción
const TRANSCRIBE_ERROR_RESPONSES = {
  quota:              { status: 429, error: 'No se pudo transcribir el audio. Puedes escribir tu respuesta manualmente.' },
  invalid_api_key:    { status: 503, error: 'El servicio de voz no está configurado correctamente. Puedes continuar respondiendo por escrito.' },
  unsupported_format: { status: 400, error: 'No pudimos procesar el formato de audio grabado. Intenta de nuevo o responde por escrito.' },
  timeout:            { status: 504, error: 'La transcripción tardó demasiado. Intenta con una respuesta más corta o continúa por escrito.' },
  empty_audio:         { status: 400, error: 'No se detectó audio. Intenta hablar más cerca del micrófono o responde por escrito.' },
  file_too_large:      { status: 400, error: 'El audio es demasiado grande. Intenta grabar una respuesta más corta o responde por escrito.' },
  server:             { status: 500, error: 'Ocurrió un problema al transcribir el audio. Puedes continuar respondiendo por escrito.' }
};

const audioExtensionFromMime = (mime = '') => {
  if (mime.includes('ogg')) return 'ogg';
  if (mime.includes('mp4')) return 'mp4';
  if (mime.includes('mpeg')) return 'mp3';
  if (mime.includes('wav')) return 'wav';
  if (mime.includes('webm')) return 'webm';
  return 'webm';
};

// Genera un resumen compacto del perfil (~150-200 chars, ~50 tokens)
const buildProfileSummary = (profile) => {
  const tech = (profile.technical_skills || []).slice(0, 5).join(', ');
  const soft = (profile.soft_skills || []).slice(0, 3).join(', ');
  const bio  = (profile.bio || '').slice(0, 80);
  return [
    `Candidato: ${profile.first_name} ${profile.last_name || ''}`.trim(),
    `Carrera: ${profile.career}`,
    `Puesto objetivo: ${profile.target_role}`,
    `Tech: ${tech}`,
    `Soft: ${soft}`,
    bio ? `Bio: ${bio}` : ''
  ].filter(Boolean).join('. ');
};

// Resumen compacto de evaluaciones previas (solo scores + 1 mejora por pregunta)
const buildPriorEvalSummary = (messages) => {
  const evaluated = messages.filter(m => m.sender === 'user' && m.evaluation?.score != null);
  if (!evaluated.length) return '';
  return evaluated
    .map((m, i) => {
      const topImprovement = (m.evaluation.improvements || [])[0] || '';
      return `P${i + 1}: ${m.evaluation.score}/100${topImprovement ? ` (mejorar: ${topImprovement.slice(0, 60)})` : ''}`;
    })
    .join(' | ');
};

// Empareja mensajes IA → usuario para reconstruir pares pregunta-respuesta.
// Las repreguntas (mensajes ai con evaluation.message_kind === 'follow_up') se
// fusionan con el par de su pregunta principal para no contar doble en el
// análisis final. Los mensajes ai sin metadata (entrevistas antiguas) cuentan
// como pregunta principal.
const buildQAPairs = (messages) => {
  const pairs = [];
  let currentQuestion = null;
  let currentIsFollowUp = false;
  for (const msg of messages) {
    if (msg.sender === 'ai') {
      currentQuestion = msg.message_content;
      currentIsFollowUp = msg.evaluation?.message_kind === 'follow_up';
    } else if (msg.sender === 'user') {
      if (currentIsFollowUp && pairs.length > 0) {
        const prev = pairs[pairs.length - 1];
        prev.answer     = `${prev.answer}\n[Repregunta] ${currentQuestion}\n[Ampliación] ${msg.message_content}`;
        prev.msgId      = msg.id;
        prev.hasEval    = !!msg.evaluation;
        prev.evaluation = msg.evaluation;
      } else {
        pairs.push({
          question:  currentQuestion || 'Presentación inicial',
          answer:    msg.message_content,
          msgId:     msg.id,
          hasEval:   !!msg.evaluation,
          evaluation: msg.evaluation
        });
      }
    }
  }
  return pairs;
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
      console.log('[/interview/transcribe] Resultado de transcripción:', transcription.text);
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

// ─── POST /interview/start ─────────────────────────────────────────────────
router.post('/interview/start', requireAuth, async (req, res) => {
  console.log('[/interview/start] Body recibido:', req.body);

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
  if (!profile.bio?.trim())         missing.push('resumen profesional');
  if (!(profile.technical_skills?.length)) missing.push('al menos 1 habilidad técnica');
  if (!(profile.soft_skills?.length))      missing.push('al menos 1 habilidad blanda');

  if (missing.length > 0) {
    return res.status(400).json({ error: 'Completa tu perfil antes de iniciar una entrevista personalizada.', missingFields: missing });
  }

  const profileSummary = buildProfileSummary(profile);
  console.log('[/interview/start] Profile summary generado:', profileSummary);

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
  console.log('[/interview/start] Prompt:\n', startPrompt);

  try {
    const { content, usage } = await generateWithFallbackDetailed({
      useCase: 'interview_questions',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT_INTERVIEW_START },
        { role: 'user',   content: startPrompt }
      ],
      db: supabaseClient,
      userId: req.user.id,
      maxTokens: MAX_OUT_QUESTION
    });

    firstQuestion = content;
    tokensUsed    = resolveTokens(usage, startPrompt + firstQuestion);

    console.log('[/interview/start] Primera pregunta generada:', firstQuestion);
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
  await Promise.all([
    supabaseClient.from('interview_messages').insert({
      interview_id:    interview.id,
      sender:          'ai',
      message_content: firstQuestion,
      // En mensajes 'ai' la columna evaluation se usa como metadata del mensaje
      evaluation:      { message_kind: 'main', question_index: 1 }
    }),
    supabaseClient
      .from('interviews')
      .update({ estimated_tokens_used: tokensUsed })
      .eq('id', interview.id)
  ]);

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
  console.log('[/interview/respond] Body recibido:', req.body);

  const { interviewId, questionText, userAnswer, gesturalData } = req.body;
  const answer = userAnswer || req.body.userResponse;

  if (!interviewId) {
    return res.status(400).json({ error: 'Falta interviewId.' });
  }
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

  const questionsAnswered = interview.questions_answered;
  const tokensUsed        = interview.estimated_tokens_used;
  const profileSummary    = interview.profile_summary;
  const interviewType     = interview.interview_type;
  const difficultyLevel   = interview.difficulty_level || 'intermediate';
  const totalQuestions    = interview.total_questions || MAX_QUESTIONS;

  // 3. Determinar la pregunta actual
  const lastAiMsg       = [...messages].reverse().find(m => m.sender === 'ai');
  const currentQuestion = questionText || lastAiMsg?.message_content || 'Presentación inicial';

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
  const remainingBudget = TOKEN_BUDGET - tokensUsed - RESERVED_FEEDBACK;
  const budgetExhausted = remainingBudget < MIN_TOKENS_PER_CALL;
  const reachedMax      = questionsAnswered >= totalQuestions - 1;
  const isLastQuestion  = reachedMax || budgetExhausted;

  // Solo se permite repreguntar si aún no se repreguntó en esta pregunta, no es
  // la última pregunta, y queda presupuesto para la evaluación posterior.
  const canFollowUp =
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

  const evalPrompt = `Perfil resumido: ${profileSummary}
Tipo de entrevista: ${interviewType}
Nivel de dificultad: ${difficultyLevel}
${exchangeContext}${priorEvalSummary ? `\nEvaluaciones previas (resumen): ${priorEvalSummary}` : ''}

${isLastQuestion
    ? 'Es la ÚLTIMA pregunta de la sesión. Genera feedback final completo, marca is_finished: true y next_question: null.'
    : 'Si no usas follow_up, genera la siguiente pregunta para continuar la entrevista.'}`;

  console.log('[/interview/respond] Tokens presupuesto:', { tokensUsed, remainingBudget, isLastQuestion });
  console.log('[/interview/respond] Prompt eval:\n', evalPrompt);

  // 6. Llamar a OpenAI
  let evalJson   = null;
  let newTokens  = 0;

  try {
    const { content: raw, usage } = await generateWithFallbackDetailed({
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
    newTokens   = resolveTokens(usage, evalPrompt + raw);

    console.log('[/interview/respond] Eval OpenAI OK. Tokens:', newTokens);
    console.log('[/interview/respond] evalJson:', evalJson);
  } catch (apiErr) {
    const classified = classifyOpenAIError(apiErr);
    console.error('[/interview/respond] Error OpenAI:', classified.type, apiErr.message);

    if (classified.type === 'rate_limit') {
      // Guardar la respuesta del usuario SIN evaluación y marcar pendiente
      await supabaseClient.from('interview_messages').insert({
        interview_id:    interviewId,
        sender:          'user',
        message_content: answer,
        evaluation:      null
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

  if (action === 'next_question' && !evalJson.feedback) {
    console.warn('[/interview/respond] La IA no devolvió feedback en un turno de avance. Se degrada con comentario neutro.');
    evalJson.feedback = {
      score: null,
      strengths: [],
      improvements: [],
      general_comment: 'Respuesta registrada. La evaluación se consolidará en el análisis final.'
    };
  }

  // 8. Acumular telemetría gestual (cámara web) — común a ambas ramas
  let updatedGestural = interview.gestural_summary || {};
  if (gesturalData) {
    if (gesturalData.expressions) {
      updatedGestural.expressions = updatedGestural.expressions || {};
      for (const k in gesturalData.expressions) {
        updatedGestural.expressions[k] = (updatedGestural.expressions[k] || 0) + gesturalData.expressions[k];
      }
    }
    if (gesturalData.eyeContact) {
      updatedGestural.eyeContact = updatedGestural.eyeContact || {};
      for (const k in gesturalData.eyeContact) {
        updatedGestural.eyeContact[k] = (updatedGestural.eyeContact[k] || 0) + gesturalData.eyeContact[k];
      }
    }
  }

  // 9. Rama de repregunta: guardar respuesta sin evaluación + repregunta de IA.
  // NO incrementa questions_answered ni cambia el status: la pregunta principal
  // sigue abierta hasta que el candidato responda la repregunta.
  if (action === 'follow_up') {
    await supabaseClient.from('interview_messages').insert({
      interview_id:    interviewId,
      sender:          'user',
      message_content: answer,
      evaluation:      null
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
        estimated_tokens_used: tokensUsed + newTokens,
        gestural_summary:      updatedGestural
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
    ? (budgetExhausted ? 'completed_early' : 'completed')
    : 'active';

  // 11. Guardar mensaje del usuario con su evaluación
  await supabaseClient.from('interview_messages').insert({
    interview_id:    interviewId,
    sender:          'user',
    message_content: answer,
    evaluation:      evalJson.feedback
  });

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
    status:                 finalStatus,
    gestural_summary:       updatedGestural
  };
  if (shouldFinish) {
    updatePayload.completed_at = new Date().toISOString();
  }

  await supabaseClient
    .from('interviews')
    .update(updatePayload)
    .eq('id', interviewId);

  console.log('[/interview/respond] Estado final:', finalStatus, '| Tokens acumulados:', tokensUsed + newTokens);

  return res.json({
    success:      true,
    action:       'next_question',
    feedback:     evalJson.feedback,
    isFinished:   shouldFinish,
    nextQuestion,
    questionNumber: questionsAnswered + 2,
    completedEarly: budgetExhausted && shouldFinish
  });
});

// ─── POST /interview/generate-pending-feedback ─────────────────────────────
// Recupera respuestas guardadas de una entrevista interrumpida y genera el análisis final con IA.
router.post('/interview/generate-pending-feedback', requireAuth, async (req, res) => {
  console.log('[/interview/generate-pending-feedback] Body:', req.body);

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

  const profileSummary = interview.profile_summary || 'Candidato sin perfil resumido disponible.';
  const sessionText = pairs
    .map((p, i) => `--- Pregunta ${i + 1} ---\nPregunta: ${p.question}\nRespuesta: ${p.answer}`)
    .join('\n\n');

  const finalPrompt = `Perfil resumido: ${profileSummary}
Tipo de entrevista: ${interview.interview_type}
Número de respuestas registradas: ${pairs.length}

${sessionText}

Genera el análisis final consolidado de esta sesión.`;

  console.log('[/interview/generate-pending-feedback] Llamando a OpenAI para análisis consolidado...');
  console.log('[/interview/generate-pending-feedback] Prompt:\n', finalPrompt);

  let finalJson = null;
  let newTokens = 0;

  try {
    const { content: raw, usage } = await generateWithFallbackDetailed({
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

    finalJson = JSON.parse(raw);
    newTokens = resolveTokens(usage, finalPrompt + raw);

    console.log('[/interview/generate-pending-feedback] Análisis generado:', finalJson);
  } catch (apiErr) {
    const classified = classifyOpenAIError(apiErr);
    console.error('[/interview/generate-pending-feedback] Error OpenAI:', classified.type, apiErr.message);
    return res.status(502).json({ error: classified.userMsg, aiErrorType: classified.type });
  }

  // Actualizar entrevista como completada
  await supabaseClient
    .from('interviews')
    .update({
      status:               'completed',
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
    overallScore:    finalJson.overall_score,
    generalAnalysis: finalJson.general_analysis,
    strengths:       finalJson.strengths       || [],
    improvements:    finalJson.improvements    || [],
    recommendations: finalJson.recommendations || [],
    sessionResponses
  });
});

// ─── GET /interview/active/:userId ─────────────────────────────────────────
// Devuelve la entrevista en curso (status 'active') más reciente del usuario,
// con sus mensajes, para poder reanudarla.
router.get('/interview/active/:userId', requireAuth, async (req, res) => {
  const { userId } = req.params;
  const supabaseClient = req.db;

  const { data: interview, error } = await supabaseClient
    .from('interviews')
    .select('*')
    .eq('profile_id', userId)
    .eq('status', 'active')
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
      userScopedDb: supabaseClient
    });

    if (!result.ok) {
      return res.status(500).json({ error: result.error || 'No se pudo descartar la entrevista.' });
    }

    return res.json({
      success: true,
      discarded: true,
      message: 'La entrevista se cerró sin respuestas, así que se descartó.'
    });
  }

  const profileSummary = interview.profile_summary || 'Candidato sin perfil resumido disponible.';
  const sessionText = pairs
    .map((p, i) => `--- Pregunta ${i + 1} ---\nPregunta: ${p.question}\nRespuesta: ${p.answer}`)
    .join('\n\n');

  const finalPrompt = `Perfil resumido: ${profileSummary}
Tipo de entrevista: ${interview.interview_type}
Número de respuestas registradas: ${pairs.length}

${sessionText}

El candidato decidió terminar la entrevista antes de tiempo. Genera el análisis final consolidado SOLO con las respuestas registradas.`;

  let finalJson = null;
  let newTokens = 0;

  try {
    const { content: raw, usage } = await generateWithFallbackDetailed({
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

    finalJson = JSON.parse(raw);
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
    overallScore:    finalJson.overall_score,
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
      avg_fluency:        avg(fluencies),
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
    return res.status(400).json({ error: error.message });
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
    return res.status(400).json({ error: error.message });
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

  const avgScore = evaluatedCount > 0 ? Math.round(totalScore / evaluatedCount) : 0;

  return res.json({
    success: true,
    stats: {
      totalInterviews: interviews?.length || 0,
      avgScore:        `${avgScore}%`,
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
