export const normalizeProfile = (profile) => {
  if (!profile) return { first_name: '', last_name: '', career: '', target_role: '', email: '', display_name: 'Estudiante', display_career: 'Estudiante', display_target_role: 'Estudiante' };

  const firstName = (profile.first_name || '').trim();
  const lastName = (profile.last_name || '').trim();
  const displayName = firstName ? `${firstName} ${lastName}`.trim() : 'Estudiante';

  return {
    ...profile,
    display_name: displayName,
    display_career: (profile.career || '').trim() || 'Estudiante',
    display_target_role: (profile.target_role || '').trim() || 'Estudiante',
  };
};

export const normalizeUserSnapshot = (data = {}) => ({
  ...data,
  profile: data.profile ? normalizeProfile(data.profile) : null,
  academic: Array.isArray(data.academic) ? data.academic : [],
  work: Array.isArray(data.work) ? data.work : [],
  cvs: Array.isArray(data.cvs) ? data.cvs : [],
  letters: Array.isArray(data.letters) ? data.letters : [],
  interviews: Array.isArray(data.interviews) ? data.interviews : [],
});
