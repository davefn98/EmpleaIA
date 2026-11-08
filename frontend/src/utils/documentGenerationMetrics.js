export const GENERATION_TARGET_SECONDS = 30;
const MAX_ATTEMPTS = 100;
const storageKey = (userId) => `empleaia_generation_metrics_${userId}`;

export function readGenerationAttempts(userId) {
  if (!userId) return [];
  try {
    const attempts = JSON.parse(localStorage.getItem(storageKey(userId)) || '[]');
    if (!Array.isArray(attempts)) return [];
    return attempts.filter((attempt) =>
      ['cv', 'letter'].includes(attempt?.type) && typeof attempt.success === 'boolean'
      && Number.isFinite(attempt.durationMs) && attempt.durationMs >= 0
      && Number.isFinite(Date.parse(attempt.date))
    );
  } catch {
    return [];
  }
}

export function recordGenerationAttempt(userId, type, startedAt, success, regeneration) {
  if (!userId) return;
  const attempt = {
    id: crypto.randomUUID(),
    type, success, regeneration,
    durationMs: Math.round(performance.now() - startedAt),
    date: new Date().toISOString(),
  };
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify([attempt, ...readGenerationAttempts(userId)].slice(0, MAX_ATTEMPTS)));
  } catch {
    // La disponibilidad del almacenamiento no condiciona la generación del documento.
  }
  return attempt;
}

export function summarizeGenerationAttempts(attempts, type) {
  const matching = attempts.filter((attempt) => attempt.type === type);
  const successful = matching.filter((attempt) => attempt.success);
  return {
    averageSeconds: successful.length ? successful.reduce((sum, attempt) => sum + attempt.durationMs, 0) / successful.length / 1000 : null,
    successes: successful.length,
    failures: matching.length - successful.length,
  };
}
