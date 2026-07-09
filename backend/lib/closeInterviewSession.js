import { supabaseAdmin } from './supabaseClient.js';

/**
 * Cierra una sesión de entrevista de forma garantizada.
 * Usa el cliente admin (service_role) si está disponible; de lo contrario,
 * usa el cliente scopeado al JWT del usuario como fallback.
 *
 * La función garantiza que, al retornar { ok: true }, la entrevista
 * ya NO tiene status='active' en la base de datos (verificado con re-lectura).
 *
 * @param {object} params
 * @param {string} params.interviewId    - UUID de la entrevista
 * @param {string} params.userId         - UUID del usuario (validación de propiedad)
 * @param {'finish'|'abandon'} params.action - Acción solicitada
 * @param {object} params.userScopedDb   - Cliente Supabase del usuario (req.db) como fallback
 * @returns {Promise<{ ok: boolean, finalStatus: string|null, deleted: boolean, error?: string }>}
 */
export async function closeInterviewSession({ interviewId, userId, action, userScopedDb }) {
  const db = supabaseAdmin || userScopedDb;
  const label = supabaseAdmin ? 'admin' : 'user-scoped';

  // 1. Leer la entrevista y validar propiedad
  const { data: interview, error: readErr } = await db
    .from('interviews')
    .select('id, profile_id, status, questions_answered')
    .eq('id', interviewId)
    .single();

  if (readErr || !interview) {
    console.warn(`[closeInterviewSession][${label}] Entrevista ${interviewId} no encontrada:`, readErr?.message);
    return { ok: false, finalStatus: null, deleted: false, error: 'Entrevista no encontrada.' };
  }

  if (interview.profile_id !== userId) {
    console.warn(`[closeInterviewSession][${label}] Propiedad inválida: entrevista ${interviewId} pertenece a ${interview.profile_id}, solicitada por ${userId}`);
    return { ok: false, finalStatus: null, deleted: false, error: 'No tienes permiso para cerrar esta entrevista.' };
  }

  // Entrevista ya cerrada → éxito inmediato
  if (!['active', 'pending_ai_feedback'].includes(interview.status)) {
    console.log(`[closeInterviewSession][${label}] Entrevista ${interviewId} ya está en status='${interview.status}'. No requiere cambio.`);
    return { ok: true, finalStatus: interview.status, deleted: false };
  }

  const hasAnswers = (interview.questions_answered || 0) > 0;

  // 2. Determinar status objetivo
  let targetStatus;
  if (action === 'finish' && hasAnswers) {
    targetStatus = 'completed_early';
  } else if (action === 'finish' && !hasAnswers) {
    targetStatus = '__delete__';
  } else if (action === 'abandon' && !hasAnswers) {
    targetStatus = '__delete__';
  } else {
    // abandon con respuestas
    targetStatus = 'abandoned';
  }

  // 3a. Path DELETE (sin respuestas): intentar borrar físicamente
  if (targetStatus === '__delete__') {
    const { data: deleted, error: delErr } = await db
      .from('interviews')
      .delete()
      .eq('id', interviewId)
      .select('id');

    if (!delErr && deleted?.length) {
      console.log(`[closeInterviewSession][${label}] Entrevista ${interviewId} eliminada físicamente.`);
      return { ok: true, finalStatus: null, deleted: true };
    }

    console.warn(`[closeInterviewSession][${label}] DELETE falló para ${interviewId}. Fallback a UPDATE.`, delErr?.message || 'sin filas afectadas');
    targetStatus = 'failed_to_start';
  }

  // 3b. Path UPDATE: cascada de status candidatos
  const statusCandidates = targetStatus === 'abandoned'
    ? ['abandoned', 'failed_to_start']
    : [targetStatus];

  for (const candidate of statusCandidates) {
    const updatePayload = { status: candidate };
    if (candidate === 'completed_early') {
      updatePayload.completed_at = new Date().toISOString();
    }

    const { data: updated, error: updErr } = await db
      .from('interviews')
      .update(updatePayload)
      .eq('id', interviewId)
      .select('id, status');

    if (updErr) {
      if (updErr.code === '23514') {
        console.warn(`[closeInterviewSession][${label}] Status '${candidate}' rechazado por check constraint. Probando siguiente candidato.`);
        continue;
      }
      console.error(`[closeInterviewSession][${label}] Error UPDATE a '${candidate}' para ${interviewId}:`, updErr.message);
      continue;
    }

    if (updated?.length && updated[0].status !== 'active') {
      console.log(`[closeInterviewSession][${label}] Entrevista ${interviewId} → status='${updated[0].status}'`);
      return { ok: true, finalStatus: updated[0].status, deleted: false };
    }

    console.warn(`[closeInterviewSession][${label}] UPDATE a '${candidate}' para ${interviewId}: sin filas afectadas.`);
  }

  // 4. Verificación final: re-leer para confirmar estado actual
  const { data: recheck } = await db
    .from('interviews')
    .select('status')
    .eq('id', interviewId)
    .single();

  if (recheck && recheck.status !== 'active') {
    console.log(`[closeInterviewSession][${label}] Re-lectura: entrevista ${interviewId} ya tiene status='${recheck.status}'.`);
    return { ok: true, finalStatus: recheck.status, deleted: false };
  }

  console.error(
    `[closeInterviewSession][${label}] ¡FALLO TOTAL! Entrevista ${interviewId} sigue con status='active' después de todos los intentos.\n` +
    `  Verifica: 1) SUPABASE_SERVICE_ROLE_KEY en backend/.env  2) Migración v8 aplicada  3) Políticas RLS en Supabase`
  );
  return {
    ok: false,
    finalStatus: 'active',
    deleted: false,
    error: 'No se pudo cerrar la entrevista. Verifica la configuración de base de datos (service role key y migraciones).'
  };
}
