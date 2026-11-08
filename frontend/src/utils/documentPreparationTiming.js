export function startDocumentVisit(userId, type, startedAt = performance.now()) {
  return { userId, type, startedAt, regeneration: null, completed: false };
}

export function markDocumentGenerated(visit, regeneration) {
  if (visit && visit.regeneration === null) visit.regeneration = regeneration;
}

export function completeDocumentVisit(visit) {
  if (!visit || visit.regeneration === null || visit.completed) return null;
  visit.completed = true;
  return visit;
}
