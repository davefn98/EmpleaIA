import { CV_SECTIONS_DEFAULT, CV_SECTION_ORDER_DEFAULT } from '../config/cvThemes.js';
import { hasCvEducation, hasCvExperience, toCvTextList } from './cvContent.js';

const text = (value) => typeof value === 'string' ? value : '';
const list = (value) => Array.isArray(value) ? value : [];
const object = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const personalFields = ['first_name', 'last_name', 'email', 'phone', 'location', 'linkedin', 'portfolio', 'career', 'target_role'];

export function cvEditorSnapshot(editor) {
  const source = object(editor);
  return {
    ...Object.fromEntries([...personalFields, 'target_job_description', 'bio'].map((field) => [field, text(source[field])])),
    cv_focus: text(source.cv_focus) || 'ATS',
    ...Object.fromEntries(['technical_skills', 'soft_skills', 'certifications', 'work_experience', 'academic_background'].map((field) => [field, list(source[field])])),
  };
}

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
  const categories = technical?.prioritized ?? technical?.categories ?? technical?.technical ?? technical;
  const technicalSkills = Array.isArray(categories) ? categories.flatMap((category) => typeof category === 'string'
    ? [category] : list(category?.items ?? category?.skills ?? category?.values ?? category?.technologies)) : Object.entries(object(categories))
    .filter(([key]) => key !== 'methodologies_and_soft_skills' && key !== 'soft_skills')
    .flatMap(([, values]) => list(values));
  return {
    ...profile,
    target_role: Object.hasOwn(personal, 'target_role') ? profile.target_role : text(data.target_role) || text(data.headline),
    target_job_description: text(data.target_job_description),
    cv_focus: text(data.cv_focus) || 'ATS',
    bio: text(data.professional_summary ?? data.profile_summary ?? data.summary ?? data.bio),
    technical_skills: technicalSkills.filter((skill) => typeof skill === 'string'),
    soft_skills: list(data.soft_skills ?? technical?.methodologies_and_soft_skills),
    certifications: list(data.certifications),
    work_experience: list(data.work_experience ?? data.experience).filter(Boolean).map((record) => ({
      ...record, id: record.id || record.source_id,
      description: text(record.description) || list(record.bullets ?? record.achievements).join('\n')
    })),
    academic_background: list(data.academic_background ?? data.education).filter(Boolean)
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

const editableCvFields = ['professional_summary', 'work_experience', 'academic_background', 'technical_skills', 'soft_skills'];
const manualCvFields = (document) => list(document?.manual_fields).filter((field) => editableCvFields.includes(field));

export function applyManualCvEdits(document, patch) {
  return {
    ...document,
    ...patch,
    manual_fields: [...new Set([...manualCvFields(document), ...editableCvFields.filter((field) => Object.hasOwn(patch, field))])],
  };
}

export function prepareCvGeneration(editor, document, visibleSections) {
  const saved = restoreCvDocument(document);
  const manualFields = manualCvFields(document);
  const legacyDraft = document && Object.hasOwn(document, 'source_bio') && !Array.isArray(document.manual_fields);
  if (legacyDraft && Array.isArray(document.technical_skills)) manualFields.push('technical_skills');
  const isManual = (field) => manualFields.includes(field);
  const useEditedWork = isManual('work_experience') || legacyDraft;
  const work = document ? saved.work_experience : editor.work_experience;
  const academic = isManual('academic_background') ? saved.academic_background : editor.academic_background;
  const shows = (key) => !document || visibleSections[key] !== false;
  const visibleRecords = (records, key, hasContent) => shows(key)
    ? list(records).filter((record) => hasContent(record) && !record.hidden_from_cv) : [];
  const candidateDates = (record) => ({
    id: text(record.id || record.source_id) || undefined,
    start_date: text(record.start_date),
    end_date: text(record.end_date) || null,
  });
  const preservedContent = {};

  if (document) {
    preservedContent.manual_fields = manualFields;
    if (isManual('professional_summary') || !shows('professionalSummary')) {
      preservedContent.professional_summary = saved.bio;
    }
    if (isManual('work_experience') || !shows('experience') || saved.work_experience.some((record) => record.hidden_from_cv)) {
      preservedContent.work_experience = document.work_experience ?? document.experience ?? saved.work_experience;
    }
    if (isManual('academic_background') || !shows('education') || saved.academic_background.some((record) => record.hidden_from_cv)) {
      preservedContent.academic_background = document.academic_background ?? document.education ?? saved.academic_background;
    }
    if (isManual('technical_skills') || !shows('skillsTech')) {
      preservedContent.technical_skills = document.technical_skills ?? document.skills ?? document.skills_categories ?? document.skill_categories ?? saved.technical_skills;
      if (Array.isArray(document.technical_skill_order)) preservedContent.technical_skill_order = document.technical_skill_order;
    }
    if (isManual('soft_skills') || !shows('skillsSoft')) {
      preservedContent.soft_skills = saved.soft_skills;
    }
    if (!shows('skillsTech')) preservedContent.certifications = saved.certifications;
  }

  return {
    preservedContent,
    candidate: {
      personal_info: {
        ...Object.fromEntries(personalFields.map((field) => [field, text(editor[field])])),
        bio: shows('professionalSummary') ? (isManual('professional_summary') || legacyDraft ? saved.bio : text(editor.bio)) : '',
      },
      skills: {
        technical: shows('skillsTech') ? toCvTextList(isManual('technical_skills') ? saved.technical_skills : editor.technical_skills) : [],
        soft: shows('skillsSoft') ? toCvTextList(isManual('soft_skills') ? saved.soft_skills : editor.soft_skills) : [],
      },
      certifications: shows('skillsTech') ? toCvTextList(editor.certifications) : [],
      academic_background: visibleRecords(academic, 'education', hasCvEducation).map((record) => ({
        ...candidateDates(record),
        institution: text(record.institution),
        degree: text(record.degree),
        description: text(record.description),
      })),
      work_experience: visibleRecords(work, 'experience', hasCvExperience).map((record) => ({
        ...candidateDates(record),
        company: text(record.company),
        role: text(record.role),
        description: useEditedWork
          ? text(record.impact_description ?? record.description)
          : Array.isArray(record.source_evidence) ? '' : text(record.description),
        achievements: toCvTextList(useEditedWork
          ? record.bullets ?? record.achievements
          : record.source_evidence ?? record.achievements ?? record.bullets),
      })),
    },
  };
}

/** Keep AI wording/category order unless that specific editor section changed. */
export function updateCvDocumentData(cvData, editor) {
  const previous = restoreCvDocument(cvData);
  const next = createCvDocumentData(cvData, editor, editor);
  next.professional_summary = text(editor.bio);
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

export function letterContextSnapshot({ company, targetRole, jobDescription, tone }) {
  return JSON.stringify([company, targetRole, jobDescription, tone].map((value) => text(value).trim()));
}

export function restoreLetterDocument(letter, { asCopy = false } = {}) {
  const saved = object(letter);
  const offer = text(saved.job_offer_text);
  const field = (label) => offer.match(new RegExp(`(?:^|\\n)${label}:\\s*([^\\n]*)`))?.[1]?.trim() || '';
  const description = offer.match(/(?:^|\n)Descripción de la Vacante:\s*([\s\S]*?)(?=\nTono deseado:|$)/)?.[1]?.trim();
  return {
    id: asCopy ? null : saved.id || null, content: text(saved.letter_content), jobOfferText: offer,
    company: text(saved.company ?? field('Empresa')),
    targetRole: text(saved.target_role ?? field('Puesto Objetivo')),
    jobDescription: text(saved.job_description ?? description ?? offer),
    tone: text(saved.tone ?? field('Tono deseado')) || 'profesional'
  };
}
