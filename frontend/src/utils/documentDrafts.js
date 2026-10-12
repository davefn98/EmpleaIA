import { CV_SECTIONS_DEFAULT, CV_SECTION_ORDER_DEFAULT } from '../config/cvThemes.js';

const text = (value) => typeof value === 'string' ? value : '';
const list = (value) => Array.isArray(value) ? value : [];
const object = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const personalFields = ['first_name', 'last_name', 'email', 'phone', 'location', 'linkedin', 'portfolio', 'career', 'target_role'];

export function restoreCvTheme(style) {
  const saved = object(style);
  const order = [...new Set(list(saved.sectionOrder).filter((key) => CV_SECTION_ORDER_DEFAULT.includes(key)))];
  return {
    template: saved.template || 'classic', primaryColor: saved.primaryColor || 'purple',
    fontFamily: saved.fontFamily || 'inter', fontSize: saved.fontSize || 'normal',
    spacing: saved.spacing || 'normal', headerStyle: saved.headerStyle || 'centered',
    visibleSections: { ...CV_SECTIONS_DEFAULT, ...object(saved.visibleSections) },
    sectionOrder: order.length ? order : [...CV_SECTION_ORDER_DEFAULT]
  };
}

export function readStoredCvTheme(storage) {
  const read = (key, json = false) => {
    try {
      const value = storage.getItem(`empleaia_cv_theme_${key}`);
      return json && value ? JSON.parse(value) : value;
    } catch { return null; }
  };
  return restoreCvTheme({
    template: read('template'), primaryColor: read('color'), fontFamily: read('font'),
    fontSize: read('fontSize'), spacing: read('spacing'), headerStyle: read('headerStyle'),
    visibleSections: read('visibleSections', true), sectionOrder: read('sectionOrder', true)
  });
}

/** A saved document is its own source; missing historical fields stay empty. */
export function restoreCvDocument(cvData) {
  const data = object(cvData);
  const personal = Object.keys(object(data.personal_info)).length ? data.personal_info : data;
  const profile = Object.fromEntries(personalFields.map((field) => [field, text(personal[field])]));
  const technical = data.technical_skills ?? data.skills_categories ?? data.skill_categories ?? data.skills;
  const technicalSkills = Array.isArray(technical) ? technical : Object.entries(object(technical))
    .filter(([key]) => key !== 'methodologies_and_soft_skills' && key !== 'soft_skills')
    .flatMap(([, values]) => list(values));
  return {
    ...profile,
    target_role: profile.target_role || text(data.target_role) || text(data.headline),
    target_job_description: text(data.target_job_description),
    cv_focus: text(data.cv_focus) || 'ATS',
    bio: text(data.professional_summary ?? data.profile_summary ?? data.summary ?? data.bio),
    technical_skills: technicalSkills.filter((skill) => typeof skill === 'string'),
    soft_skills: list(data.soft_skills ?? technical?.methodologies_and_soft_skills),
    certifications: list(data.certifications),
    work_experience: list(data.work_experience ?? data.experience).map((record) => ({
      ...record, id: record.id || record.source_id,
      description: text(record.description) || list(record.bullets ?? record.achievements).join('\n')
    })),
    academic_background: list(data.academic_background ?? data.education)
  };
}

export function createCvDocumentData(cvData, profile, context = {}) {
  return {
    ...object(cvData), snapshot_version: 1,
    personal_info: Object.fromEntries(personalFields.map((field) => [field, text(profile?.[field])])),
    target_job_description: text(context.target_job_description ?? profile?.target_job_description),
    cv_focus: text(context.cv_focus ?? cvData?.cv_focus) || 'ATS'
  };
}

/** Keep AI wording/category order unless that specific editor section changed. */
export function updateCvDocumentData(cvData, editor) {
  const previous = restoreCvDocument(cvData);
  const next = createCvDocumentData(cvData, editor, editor);
  next.professional_summary = text(editor.bio);
  if (editor.target_role !== previous.target_role) next.headline = text(editor.target_role);
  for (const [field, values] of [
    ['academic_background', editor.academic_background], ['soft_skills', editor.soft_skills],
    ['certifications', editor.certifications]
  ]) {
    if (JSON.stringify(list(values)) !== JSON.stringify(list(previous[field]))) next[field] = list(values);
  }
  if (JSON.stringify(editor.technical_skills) !== JSON.stringify(previous.technical_skills)) {
    next.technical_skills = list(editor.technical_skills);
  }
  if (JSON.stringify(editor.work_experience) !== JSON.stringify(previous.work_experience)) {
    next.work_experience = list(editor.work_experience).map((record) => {
      const { description, ...rest } = record;
      return { ...rest, bullets: text(description).split('\n').map((line) => line.trim()).filter(Boolean) };
    });
  }
  return next;
}

export function restoreLetterDocument(letter) {
  const saved = object(letter);
  const offer = text(saved.job_offer_text);
  const field = (label) => offer.match(new RegExp(`(?:^|\\n)${label}:\\s*([^\\n]*)`))?.[1]?.trim() || '';
  const description = offer.match(/(?:^|\n)Descripción de la Vacante:\s*([\s\S]*?)(?=\nTono deseado:|$)/)?.[1]?.trim();
  return {
    id: saved.id || null, content: text(saved.letter_content), jobOfferText: offer,
    company: text(saved.company ?? field('Empresa')),
    targetRole: text(saved.target_role ?? field('Puesto Objetivo')),
    jobDescription: text(saved.job_description ?? description ?? offer),
    tone: text(saved.tone ?? field('Tono deseado')) || 'profesional'
  };
}
