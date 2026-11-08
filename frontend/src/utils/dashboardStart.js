import { missingProfileSaveFields } from './profileSaveIssues.js';

export function dashboardStart(profile, stats, draftCvId) {
  if (stats.totalCvs || stats.totalLetters || stats.totalInterviews) {
    return { stage: 'active', action: draftCvId ? 'Continuar mi CV' : 'Crear un CV' };
  }
  const missing = missingProfileSaveFields({
    firstName: profile?.first_name,
    lastName: profile?.last_name,
    phone: profile?.phone,
    contactEmail: profile?.contact_email ?? profile?.email,
  });
  return { stage: missing.length ? 'profile' : 'first-cv', missing };
}

export function latestCvDraft(cvs) {
  return cvs.filter((cv) => cv.status === 'draft' && cv.id)
    .sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at))[0] ?? null;
}
