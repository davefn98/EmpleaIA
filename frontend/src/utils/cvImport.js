const hasText = (value) => typeof value === 'string' && value.trim().length > 0;
const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();

export function completeImportedExperience(record) {
  const description = String(record.description || '').trim();
  const achievements = Array.isArray(record.achievements) ? record.achievements : [];
  const additional = achievements.filter((item) => hasText(item) && !normalize(description).includes(normalize(item)));
  return { ...record, description: [description, ...additional].filter(Boolean).join('\n'), achievements };
}

export function importedCvFields(parsed) {
  const result = {};
  for (const field of ['first_name', 'last_name', 'email', 'phone', 'location', 'linkedin', 'portfolio', 'career', 'bio']) {
    result[field] = hasText(parsed[field]) ? parsed[field] : '';
  }
  for (const field of ['technical_skills', 'soft_skills', 'certifications', 'work_experience', 'academic_background']) {
    result[field] = Array.isArray(parsed[field]) ? parsed[field] : [];
  }
  result.work_experience = result.work_experience.map(completeImportedExperience);
  return result;
}

/** Imported blanks cannot erase a previous target, job description or contact. */
export function mergeImportedPersonal(previous, parsed) {
  const next = { ...previous };
  for (const field of ['first_name', 'last_name', 'phone', 'location', 'linkedin', 'career', 'bio']) {
    if (hasText(parsed[field])) next[field] = parsed[field];
  }
  // A vacancy is chosen separately from career history. Preserve an existing choice.
  for (const field of ['target_role', 'target_job_description']) {
    if (!hasText(previous[field]) && hasText(parsed[field])) next[field] = parsed[field];
  }
  return next;
}
