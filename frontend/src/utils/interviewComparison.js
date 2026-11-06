export function interviewScoreChange(interviews) {
  if (interviews.length < 2 || interviews.some((item) => typeof item.avg_score !== 'number' || !Number.isFinite(item.avg_score))) return null;
  const ordered = [...interviews].sort((a, b) => new Date(a.completed_at || a.created_at) - new Date(b.completed_at || b.created_at));
  return Math.round((ordered.at(-1).avg_score - ordered[0].avg_score) * 100) / 100;
}
