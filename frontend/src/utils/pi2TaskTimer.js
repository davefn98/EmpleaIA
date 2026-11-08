import { TASKS } from './pi2Validation.js';

const timerKey = (userId) => `empleaia_pi2_timer_${userId}`;
function readPilotTimer(userId) {
  if (!userId) return null;
  try {
    const timer = JSON.parse(sessionStorage.getItem(timerKey(userId)) || 'null');
    if (!timer || !Object.hasOwn(TASKS, timer.task) || !['manual', 'platform'].includes(timer.method)
      || !Number.isFinite(timer.startedAt) || (timer.finishedAt !== null && !Number.isFinite(timer.finishedAt))) return null;
    return timer;
  } catch {
    return null;
  }
}

export async function flushFinishedLegacyTimer(supabase, userId) {
  const timer = readPilotTimer(userId);
  if (!timer || timer.finishedAt === null) return;
  const { error } = await supabase.rpc('pi2_save_timed_task', {
    p_user_id: userId,
    p_task: timer.task,
    p_method: timer.method,
    p_started_at: new Date(timer.startedAt).toISOString(),
    p_finished_at: new Date(timer.finishedAt).toISOString(),
    p_build: timer.build,
  });
  if (error) throw error;
  const current = readPilotTimer(userId);
  if (current?.startedAt === timer.startedAt && current?.finishedAt === timer.finishedAt) sessionStorage.removeItem(timerKey(userId));
}
