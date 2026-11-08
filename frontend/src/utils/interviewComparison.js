export function orderInterviewsByDate(interviews) {
  return [...interviews].sort((a, b) => Date.parse(a.completed_at || a.created_at) - Date.parse(b.completed_at || b.created_at));
}

export function interviewScoreChange(interviews) {
  if (interviews.length < 2 || interviews.some((item) => typeof item.avg_score !== 'number' || !Number.isFinite(item.avg_score))) return null;
  const ordered = orderInterviewsByDate(interviews);
  return Math.round((ordered.at(-1).avg_score - ordered[0].avg_score) * 100) / 100;
}
