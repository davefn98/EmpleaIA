/**
 * cvService.js — Lógica de negocio del módulo de CVs.
 *
 * Orquesta la generación de IA, los fallbacks honestos y las operaciones CRUD
 * delegando la persistencia a cvRepository.
 *
 * Regla de integridad de datos: los fallbacks usan ÚNICAMENTE datos reales del
 * usuario o campos vacíos ("" / []) cuando el dato no existe. Prohibido asignar
 * valores genéricos inventados (nombres de carrera, listas de skills por defecto,
 * roles de trabajo asumidos, etc.).
 *
 * Este módulo no conoce req/res ni códigos HTTP: recibe datos, devuelve datos
 * o lanza errores con `.status` y `.code` para que el controlador los traduzca.
 */

import { SYSTEM_PROMPT_CV } from '../lib/prompts.js';
import { generateWithFallback }                      from '../lib/AIProviderService.js';
import { SYSTEM_PROMPT_CV_IMPORT_FAITHFUL } from '../lib/cvImportPrompt.js';
import { cvImportTokenBudget, parseImportedCv } from './cvImportData.js';
import { importedCvJsonSchema } from '../validators/cvValidator.js';
import { fullProfileUpdateSchema } from '../validators/profileValidator.js';
import * as cvRepo                                   from '../repositories/cvRepository.js';
import {
  CV_TECHNICAL_SKILL_CATEGORIES,
  aiGeneratedCvSchema,
  generatedCvJsonSchema,
  generatedCvSchema,
  persistedCvSchema,
} from '../validators/cvValidator.js';

// ---------------------------------------------------------------------------
// Helpers privados
// ---------------------------------------------------------------------------

/**
 * Crea un error de aplicación tipado con status HTTP y código de negocio.
 *
 * @param {string} message
 * @param {number} status
 * @param {string} [code]
 * @returns {Error}
 */
function appError(message, status, code) {
  const err = new Error(message);
  err.status = status;
  if (code) err.code = code;
  return err;
}

/**
 * Fallback honesto para cv-generate cuando la IA no está disponible.
 *
 * Estructura el CV únicamente con la información real que el usuario ya
 * ingresó. No se inventan logros, métricas, empresas, instituciones ni
 * habilidades — eso pondría datos falsos en un CV real.
 *
 * @param {object} profile       - Registro de la tabla profiles
 * @param {object} userInputData - Objeto consolidado con academic/work del usuario
 * @returns {object}             - Objeto cvJson con la misma forma que la IA devuelve
 */
const SKILL_CATEGORY_PATTERNS = {
  backend: /\b(node(?:\.js)?|express|java|spring|python|django|flask|php|laravel|c#|\.net|golang|go|ruby|rails|nestjs)\b/i,
  cloud: /\b(aws|azure|gcp|cloud|lambda|cloudflare|firebase)\b/i,
  architecture: /\b(architecture|arquitectura|microservices|microservicios|solid|ddd|clean architecture|event driven|patrones de dise[nñ]o)\b/i,
  databases: /\b(sql|postgres(?:ql)?|mysql|mariadb|mongodb|redis|oracle|sqlite|database|base de datos|supabase)\b/i,
  integration: /\b(rest|graphql|soap|api|kafka|rabbitmq|webhook|integraci[oó]n)\b/i,
  testing: /\b(jest|vitest|mocha|junit|pytest|cypress|playwright|selenium|karate|testing|pruebas?)\b/i,
  devops: /\b(docker|kubernetes|terraform|jenkins|github(?: actions)?|gitlab ci|ci\/?cd|devops|git)\b/i,
  security: /\b(oauth|jwt|owasp|security|seguridad|pentest|iam)\b/i,
  frontend: /\b(react|angular|vue|svelte|javascript|typescript|html|css|tailwind|bootstrap|frontend|next(?:\.js)?)\b/i,
};

const SKILL_ALIASES = [
  ['javascript', 'js'],
  ['typescript', 'ts'],
  ['node', 'node js', 'nodejs'],
  ['postgres', 'postgresql'],
  ['amazon web services', 'aws'],
  ['google cloud platform', 'gcp'],
  ['continuous integration continuous delivery', 'ci cd'],
  ['rest api', 'restful api', 'api rest'],
];

const KNOWN_TECHNOLOGY_ALIASES = [
  ['node', 'node js', 'nodejs'], ['express'], ['java'], ['spring'], ['python'], ['django'],
  ['flask'], ['php'], ['laravel'], ['c#'], ['net'], ['go', 'golang'], ['ruby'], ['rails'],
  ['nestjs'], ['aws', 'amazon web services'], ['azure'], ['gcp', 'google cloud platform'],
  ['lambda'], ['cloudflare'], ['firebase'], ['sql'], ['postgres', 'postgresql'], ['mysql'],
  ['mariadb'], ['mongodb'], ['redis'], ['oracle'], ['sqlite'], ['supabase'], ['graphql'],
  ['soap'], ['kafka'], ['rabbitmq'], ['jest'], ['vitest'], ['mocha'], ['junit'], ['pytest'],
  ['cypress'], ['playwright'], ['selenium'], ['docker'], ['kubernetes'], ['terraform'],
  ['jenkins'], ['oauth'], ['jwt'], ['owasp'], ['react'], ['angular'], ['vue'], ['svelte'],
  ['javascript', 'js'], ['typescript', 'ts'], ['html'], ['css'], ['tailwind'], ['bootstrap'],
  ['next js', 'nextjs'],
];

function text(value) {
  return value === null || value === undefined ? '' : String(value);
}

function normalize(value) {
  return text(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9+#.]+/g, ' ')
    .replace(/\./g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function uniqueStrings(values) {
  const seen = new Set();
  return (Array.isArray(values) ? values : [])
    .map((value) => text(value).trim())
    .filter((value) => {
      const key = normalize(value);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function emptyTechnicalSkills() {
  return Object.fromEntries(CV_TECHNICAL_SKILL_CATEGORIES.map((category) => [category, []]));
}

function categorizeSkills(skills) {
  const categorized = emptyTechnicalSkills();
  for (const skill of uniqueStrings(skills)) {
    const category = Object.entries(SKILL_CATEGORY_PATTERNS)
      .find(([, pattern]) => pattern.test(skill))?.[0] || 'other';
    categorized[category].push(skill);
  }
  return categorized;
}

function orderedSkillCategories(technicalSkills, preferredOrder = CV_TECHNICAL_SKILL_CATEGORIES) {
  const preferred = uniqueStrings(preferredOrder)
    .filter((category) => CV_TECHNICAL_SKILL_CATEGORIES.includes(category));
  const missing = CV_TECHNICAL_SKILL_CATEGORIES.filter((category) => !preferred.includes(category));
  return [...preferred, ...missing].sort((left, right) => {
    const leftHasSkills = technicalSkills[left]?.length > 0 ? 0 : 1;
    const rightHasSkills = technicalSkills[right]?.length > 0 ? 0 : 1;
    return leftHasSkills - rightHasSkills;
  });
}

function skillOrderFromTarget(technicalSkills, targetJobDescription) {
  const target = normalize(targetJobDescription);
  if (!target) return orderedSkillCategories(technicalSkills);

  return [...CV_TECHNICAL_SKILL_CATEGORIES].sort((left, right) => {
    const score = (category) => (technicalSkills[category] || []).reduce(
      (total, skill) => total + (includesNormalizedPhrase(target, normalize(skill)) ? 2 : 0),
      SKILL_CATEGORY_PATTERNS[category]?.test(targetJobDescription) ? 1 : 0
    );
    return score(right) - score(left);
  });
}

function targetPosition(value) {
  const listingDetails = /^(?:sin experiencia|con o sin experiencia|turno\b|full\b|part\b|planilla\b|gana\b|sueldo\b|horario\b|bonos?\b|beneficios?\b|s\/)/;
  return text(value).split(/\s+\/\s+|[|•\r\n]/).map((part) => part.trim())
    .find((part) => part && !listingDetails.test(normalize(part))) || '';
}

function buildSupportedHeadline(userInputData, technicalSkills, categoryOrder) {
  const roles = uniqueStrings((userInputData.work_experience || []).map(({ role }) => role));
  const career = text(userInputData.personal_info?.career).trim();
  const target = targetPosition(userInputData.personal_info?.target_role);
  const matchingRole = [...roles, career].find((label) => label && normalize(label) === normalize(target));
  if (target && !matchingRole) return `Objetivo: ${target}`;
  const role = matchingRole || roles[0] || career;
  const highlights = categoryOrder
    .flatMap((category) => technicalSkills[category])
    .slice(0, 3);
  return uniqueStrings([role, ...highlights]).reduce((headline, item) => {
    if (!headline) return item;
    return headline.length + item.length + 3 <= 110 ? `${headline} | ${item}` : headline;
  }, '');
}

function sourceAcademicRecord(record) {
  return {
    institution: text(record.institution),
    degree:      text(record.degree),
    start_date:  text(record.start_date),
    end_date:    text(record.end_date),
    description: text(record.description),
  };
}

function workEvidence(record) {
  return uniqueStrings([
    ...(Array.isArray(record.achievements) ? record.achievements : []),
    ...(Array.isArray(record.bullets) ? record.bullets : []),
    record.description,
  ].flatMap((line) => text(line).split(/[\n•▪✓✔]+/).map((item) => item.trim().replace(/^[-–—]\s+/, ''))));
}

function sourceWorkRecord(record, relevance, singleExperience, bullets = []) {
  const limit = singleExperience || relevance === 'high' ? 6 : relevance === 'medium' ? 4 : 2;
  const sourceEvidence = workEvidence(record);
  const selected = [...bullets];
  for (const fact of sourceEvidence) {
    if (selected.length >= limit) break;
    const terms = [...new Set(evidenceTerms(fact))];
    const covered = selected.some((bullet) => {
      if (includesNormalizedPhrase(normalize(bullet), normalize(fact))) return true;
      const bulletTerms = new Set(evidenceTerms(bullet));
      return terms.length > 0 && terms.every((term) => bulletTerms.has(term)) && !hasUnsupportedMetric(fact, bullet);
    });
    if (!covered) selected.push(fact);
  }
  return {
    source_id:  text(record.id),
    company:    text(record.company),
    role:       text(record.role),
    start_date: text(record.start_date),
    end_date:   text(record.end_date),
    relevance,
    bullets: selected.slice(0, limit),
    source_evidence: sourceEvidence,
  };
}

function getCertifications(profile) {
  return uniqueStrings((profile.certifications || []).map((certification) =>
    typeof certification === 'string'
      ? certification
      : certification?.name || certification?.title || certification?.certification || ''
  ));
}

function sourceCorpus(profile, userInputData) {
  return [
    userInputData.personal_info?.bio ?? profile.bio,
    userInputData.personal_info?.career,
    ...(userInputData.skills?.technical || []),
    ...(userInputData.skills?.soft || []),
    ...(userInputData.certifications || getCertifications(profile)),
    ...(userInputData.work_experience || []).flatMap((record) => [
      record.role,
      ...workEvidence(record),
    ]),
    ...(userInputData.academic_background || []).flatMap((record) => [record.degree, record.description]),
  ].filter(Boolean).join(' ');
}

function isSupported(value, corpus) {
  const candidate = normalize(value);
  const normalizedCorpus = ` ${normalize(corpus)} `;
  if (!candidate) return false;
  if (normalizedCorpus.includes(` ${candidate} `)) return true;
  const aliases = SKILL_ALIASES.find((group) => group.includes(candidate));
  return Boolean(aliases?.some((alias) => normalizedCorpus.includes(` ${alias} `)));
}

function includesNormalizedPhrase(normalizedText, phrase) {
  return ` ${normalizedText} `.includes(` ${phrase} `);
}

function hasUnsupportedTechnology(value, corpus) {
  const normalizedValue = normalize(value);
  const normalizedCorpus = normalize(corpus);
  return KNOWN_TECHNOLOGY_ALIASES.some((aliases) =>
    aliases.some((alias) => includesNormalizedPhrase(normalizedValue, alias)) &&
    !aliases.some((alias) => includesNormalizedPhrase(normalizedCorpus, alias))
  );
}

function hasUnsupportedMetric(value, corpus) {
  const metrics = text(value).match(/\b\d+(?:[.,]\d+)?%?/g) || [];
  const sourceMetrics = new Set(text(corpus).match(/\b\d+(?:[.,]\d+)?%?/g) || []);
  return metrics.some((metric) => !sourceMetrics.has(metric));
}

const EVIDENCE_STOP_WORDS = new Set([
  'para', 'como', 'desde', 'entre', 'sobre', 'mediante', 'utilizando', 'participando',
  'experiencia', 'soluciones', 'sistemas',
  'aplicaciones', 'servicios', 'proyectos', 'equipo', 'entornos', 'procesos',
]);

function evidenceTerms(value) {
  return normalize(value).split(' ')
    .filter((term) => term.length >= 4 && !EVIDENCE_STOP_WORDS.has(term));
}

function hasEvidenceOverlap(value, evidence) {
  const sourceTerms = evidenceTerms(evidence);
  const claimTerms = evidenceTerms(value);
  if (claimTerms.length === 0) return true;
  const matches = claimTerms.filter((claim) => sourceTerms.some((source) =>
    claim === source || (claim.length >= 6 && source.length >= 6 && claim.slice(0, 6) === source.slice(0, 6))
  )).length;
  return matches >= Math.min(2, claimTerms.length) && matches / claimTerms.length >= 0.35;
}

function hasUnsupportedNamedTerm(value, evidence) {
  const normalizedEvidence = ` ${normalize(evidence)} `;
  const namedTerms = [...text(value).matchAll(/\b[A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9.+#/-]{1,}\b/g)];
  return namedTerms.some((match) => {
    if (match.index === 0) return false;
    const term = normalize(match[0]);
    return term.length > 1 && !normalizedEvidence.includes(` ${term} `);
  });
}

const SUMMARY_GOAL = /^(?:(?:busco|quiero|me interesa|espero) (?:aplicar|trasladar)|(?:puedo|me permite) (?:aplicar|aportar|contribuir)|estoy preparad[oa] para aplicar)\b/;
const SUMMARY_BRIDGE = /\b(?:esa|esta|esas|estas|mis|los) (?:experiencia|practica|habilidades|conocimientos) (?:a|al|en|para)\s+/;
// Terms that change the nature of the claim even when the surrounding words match.
const SUMMARY_CLAIM_EVIDENCE = [
  /\b(?:estudiante|actualmente curs\w*|estoy cursando)\b/,
  /\b(?:mantenimiento|mantuv\w*|mantenia)\b/,
  /\b(?:informes?|reportes?)\b/,
];

function summaryStatements(value) {
  return text(value).split(/(?<=[.!?])\s+|;\s*|,\s*lo que (?=me permite\b)/i)
    .map((part) => part.trim()).filter(Boolean);
}

function isSupportedSummary(summary, corpus, vacancy, facts) {
  const normalizedCorpus = normalize(corpus);
  if (!summary || !normalizedCorpus) return false;

  const claims = [];
  for (const statement of summaryStatements(summary)) {
    const normalized = normalize(statement);
    if (SUMMARY_GOAL.test(normalized)) {
      const bridge = SUMMARY_BRIDGE.exec(normalized);
      const contribution = bridge ? normalized.slice(bridge.index + bridge[0].length) : normalized;
      // A goal may mention vacancy tasks, but cannot carry a claim about past work.
      if (hasUnsupportedMetric(statement, '') || /\b(?:experiencia (?:directa )?en|tengo|tiene|he|habia|lidero|realizo|gestiona)\b/.test(contribution)
        || /[a-záéíóúñ]{2,}[éí](?=\s|[,.;!?]|$)/iu.test(statement)
        || !hasEvidenceOverlap(contribution, vacancy)) return false;
      continue;
    }

    const addsUnsupportedClaim = SUMMARY_CLAIM_EVIDENCE.some((pattern) => pattern.test(normalized) && !pattern.test(normalizedCorpus));
    if (addsUnsupportedClaim || hasUnsupportedTechnology(statement, corpus) || hasUnsupportedNamedTerm(statement, corpus)
      || hasUnsupportedMetric(statement, corpus) || !hasEvidenceOverlap(statement, corpus)) return false;
    claims.push(statement);
  }

  const factTerms = new Set(evidenceTerms(facts.join(' ')));
  return claims.length > 0 && (!factTerms.size || evidenceTerms(claims.join(' ')).some((term) => factTerms.has(term)));
}

function sanitizeBullets(record, bullets) {
  const evidence = workEvidence(record).join(' ');
  if (!evidence) return [];
  return uniqueStrings(bullets).filter((bullet) =>
    !hasUnsupportedTechnology(bullet, evidence) &&
    !hasUnsupportedNamedTerm(bullet, evidence) &&
    !hasUnsupportedMetric(bullet, evidence) &&
    hasEvidenceOverlap(bullet, evidence)
  );
}

function filterSupported(values, corpus, alreadyUsed = new Set()) {
  return uniqueStrings(values).filter((value) => {
    const key = normalize(value);
    if (alreadyUsed.has(key) || !isSupported(value, corpus)) return false;
    alreadyUsed.add(key);
    return true;
  });
}

function relevanceFromSource(record, targetJobDescription) {
  const targetWords = new Set(normalize(targetJobDescription).split(' ').filter((word) => word.length >= 4));
  if (targetWords.size === 0) return 'low';
  const recordWords = new Set(normalize([
    record.role,
    ...workEvidence(record),
  ].join(' ')).split(' '));
  const matches = [...targetWords].filter((word) => recordWords.has(word)).length;
  return matches >= 3 ? 'high' : matches >= 1 ? 'medium' : 'low';
}

const EXPERIENCE_SIGNALS = [
  { evidence: /\b(?:resol\w*|solucion\w*|atend\w*)\b.*\b(?:incidencias?|incidentes?|problemas?|fallas?)\b/, vacancy: /inciden|problema|consulta|atencion|soporte/, phrase: 'resolución de incidencias', skill: 'Resolución de problemas' },
  { evidence: /\b(?:seguimiento|segui|seguir|seguimos)\b.*\b(?:incidencias?|incidentes?|servicios?|casos?|solicitudes?|tickets?)\b/, vacancy: /seguimiento|inciden|consulta|atencion|soporte/, phrase: 'seguimiento operativo', skill: 'Seguimiento operativo', describe: (fact) => /\bservicios? (?:productivos?|en produccion)\b/.test(fact) ? 'seguimiento de servicios en producción' : 'seguimiento operativo' },
  { evidence: /\b(?:trazabilidad|trace|document\w*)\b.*\b(?:cambios?|incidencias?|procesos?|casos?)\b/, vacancy: /trazabilidad|registro|document|calidad/, phrase: 'registro y trazabilidad de cambios' },
  { evidence: /\b(?:pases?|despleg\w*|desplieg\w*)\b.*\b(?:produccion|servicios?|contenedores?)\b/, vacancy: /despleg|desplieg|produccion|cloud|aws/, phrase: 'despliegue de servicios' },
  { evidence: /\bpruebas?\s+automatiz\w*\b/, vacancy: /prueba|testing|calidad/, phrase: 'pruebas automatizadas' },
  { evidence: /\bintegracion continua\b/, vacancy: /integracion continua|ci cd|devops/, phrase: 'integración continua' },
  { evidence: /\b(?:coordine|coordinacion|colabore|colaboracion)\b.*\b(?:equipo|equipos|areas)\b/, vacancy: /equipo|coordinacion|colaboracion/, phrase: 'coordinación con equipos', skill: 'Trabajo en equipo' },
];

const EXPERIENCE_TOOLS = ['AWS', 'Azure', 'GitHub Actions', 'GitHub', 'GitLab CI', 'Docker', 'Kubernetes', 'Karate', 'Playwright', 'Node.js', 'React', 'Python', 'Java', 'PostgreSQL', 'SQL Server', 'Excel'];

function observedCompetencies(work, targetJobDescription) {
  const facts = work.flatMap(workEvidence).map(normalize);
  const vacancy = normalize(targetJobDescription);
  const signals = EXPERIENCE_SIGNALS.flatMap((signal) => {
    const matchedFacts = facts.filter((fact) => signal.evidence.test(fact));
    if (!matchedFacts.length) return [];
    const detail = matchedFacts.map((fact) => signal.describe?.(fact)).find((value) => value && value !== signal.phrase);
    return [{ ...signal, detail: detail || signal.phrase }];
  })
    .sort((left, right) => Number(right.vacancy.test(vacancy)) - Number(left.vacancy.test(vacancy)));
  const tools = EXPERIENCE_TOOLS.filter((tool) => facts.some((fact) =>
    isSupported(tool, tool === 'GitHub' ? fact.replace(/\bgithub actions\b/g, '') : fact)
  ));
  return { signals, tools };
}

function transferableSummary(signals, target, previousSummary) {
  const phrases = signals.slice(0, 3).map(({ detail }) => detail);
  const [first, second, third] = phrases;
  const goal = `Busco aplicar esa experiencia en un puesto de ${target}.`;
  const alternatives = second ? [
    `Tengo experiencia en ${first} y ${second}. ${goal}`,
    `Mi experiencia incluye ${second} y ${first}. Me interesa trasladar esas habilidades a un puesto de ${target}.`,
    third ? `He trabajado en ${third}, ${first} y ${second}. ${goal}`
      : `Busco un puesto de ${target} donde pueda aportar mi experiencia en ${first} y ${second}.`,
  ] : [
    `Tengo experiencia en ${first}. ${goal}`,
    `Busco un puesto de ${target} donde pueda aplicar mi experiencia en ${first}.`,
  ];
  const previousIndex = alternatives.findIndex((summary) => normalize(summary) === normalize(previousSummary));
  return alternatives[(previousIndex + 1) % alternatives.length];
}

function summaryFacts(userInputData) {
  return uniqueStrings([
    ...(userInputData.work_experience || []).flatMap((record) => workEvidence(record).flatMap(summaryStatements)),
    ...(userInputData.academic_background || []).flatMap(({ description }) => summaryStatements(description)),
  ]);
}

function supportedSummary(profile, userInputData, skills, { target = '', vacancy = '', previousSummary = '' } = {}) {
  const bio = text(userInputData.personal_info?.bio ?? profile.bio).trim();
  const role = (userInputData.work_experience || []).map(({ role }) => text(role).trim()).find(Boolean);
  const education = (userInputData.academic_background || []).map(({ degree }) => text(degree).trim()).find(Boolean);
  const career = text(userInputData.personal_info?.career ?? profile.career).trim();
  const introduction = role ? `Experiencia como ${role}.` : education ? `Formación en ${education}.` : career ? `Perfil profesional en ${career}.` : '';
  const vacancyTerms = new Set(evidenceTerms(vacancy));
  const facts = summaryFacts(userInputData).filter((fact) => fact.length <= 280)
    .map((fact) => ({ fact, matches: evidenceTerms(fact).filter((term) => vacancyTerms.has(term)).length }))
    .sort((left, right) => right.matches - left.matches).slice(0, 2)
    .map(({ fact }) => `${fact.replace(/[.!?]+$/, '')}.`);
  const highlights = uniqueStrings(skills).slice(0, 4);
  const knowledge = highlights.length ? `Conocimientos en ${highlights.join(', ')}.` : '';
  if (!facts.length) return bio || [introduction, knowledge].filter(Boolean).join(' ');

  const goal = target ? `Busco aplicar esa experiencia en un puesto de ${target}.` : '';
  const alternateGoal = target ? `Me interesa aportar esa práctica en un puesto de ${target}.` : '';
  const first = [...facts, goal || knowledge].filter(Boolean).join(' ');
  const reversedFacts = [...facts].reverse();
  const second = [...reversedFacts, alternateGoal || introduction || knowledge].filter(Boolean).join(' ');
  return normalize(first) === normalize(previousSummary) ? second : first;
}

/** Fallback honesto que cumple exactamente el contrato persistido. */
export function buildFallbackCv(profile, userInputData, targetJobDescription = '') {
  const sourceWork = userInputData.work_experience || [];
  const { signals, tools } = observedCompetencies(sourceWork, targetJobDescription);
  const technicalSkills = categorizeSkills([...(userInputData.skills?.technical || profile.technical_skills || []), ...tools]);
  const categoryOrder = skillOrderFromTarget(technicalSkills, targetJobDescription);
  return {
    headline: buildSupportedHeadline(userInputData, technicalSkills, categoryOrder),
    professional_summary: supportedSummary(profile, userInputData, categoryOrder.flatMap((category) => technicalSkills[category]), {
      target: targetPosition(userInputData.personal_info?.target_role), vacancy: targetJobDescription,
    }),
    work_experience: sourceWork.map((record) =>
      sourceWorkRecord(record, relevanceFromSource(record, targetJobDescription), sourceWork.length === 1)
    ),
    academic_background: (userInputData.academic_background || []).map(sourceAcademicRecord),
    technical_skills: technicalSkills,
    technical_skill_order: categoryOrder,
    soft_skills: uniqueStrings([...(userInputData.skills?.soft || profile.soft_skills || []), ...signals.map(({ skill }) => skill)]),
    certifications: uniqueStrings(userInputData.certifications || getCertifications(profile)),
  };
}

/** Valida el JSON de IA y repone todos los campos inmutables desde la fuente. */
export function parseAndReconcileGeneratedCv(rawJson, profile, userInputData, targetJobDescription = '', excludedSkillKeys = new Set(), previousSummary = '') {
  const parsedJson = typeof rawJson === 'string' ? JSON.parse(rawJson) : rawJson;
  const generated = aiGeneratedCvSchema.parse(parsedJson);
  const sourceWork = userInputData.work_experience || [];
  const usedSourceIndexes = new Set();
  const reconciledWork = [];

  for (const generatedRecord of generated.work_experience) {
    let sourceIndex = sourceWork.findIndex((record, index) =>
      !usedSourceIndexes.has(index) && text(record.id) === generatedRecord.source_id
    );
    if (sourceIndex < 0 && generatedRecord.source_id === '') {
      sourceIndex = sourceWork.findIndex((record, index) =>
        !usedSourceIndexes.has(index) && text(record.id) === '' &&
        normalize(record.company) === normalize(generatedRecord.company) &&
        normalize(record.role) === normalize(generatedRecord.role)
      );
    }
    if (sourceIndex < 0) continue;
    usedSourceIndexes.add(sourceIndex);
    reconciledWork.push(sourceWorkRecord(
      sourceWork[sourceIndex],
      generatedRecord.relevance,
      sourceWork.length === 1,
      sanitizeBullets(sourceWork[sourceIndex], generatedRecord.bullets)
    ));
  }

  sourceWork.forEach((record, index) => {
    if (!usedSourceIndexes.has(index)) {
      reconciledWork.push(sourceWorkRecord(record, relevanceFromSource(record, targetJobDescription), sourceWork.length === 1));
    }
  });

  const corpus = sourceCorpus(profile, userInputData);
  const target = targetPosition(userInputData.personal_info?.target_role);
  const vacancy = normalize(`${target} ${targetJobDescription}`);
  const { signals, tools } = observedCompetencies(sourceWork, vacancy);
  const usedSkills = new Set(excludedSkillKeys);
  const technicalSkills = emptyTechnicalSkills();
  for (const category of CV_TECHNICAL_SKILL_CATEGORIES) {
    technicalSkills[category] = filterSupported(generated.technical_skills[category], corpus, usedSkills);
  }
  const omittedSkills = categorizeSkills(filterSupported([...(userInputData.skills?.technical || []), ...tools], corpus, usedSkills));
  for (const category of CV_TECHNICAL_SKILL_CATEGORIES) {
    technicalSkills[category].push(...omittedSkills[category]);
  }
  const categoryOrder = orderedSkillCategories(technicalSkills, generated.technical_skill_order);
  const highlights = categoryOrder.flatMap((category) => technicalSkills[category]);
  const observedSoftSkills = uniqueStrings([...(userInputData.skills?.soft || []), ...signals.map(({ skill }) => skill)])
    .filter((skill) => !excludedSkillKeys.has(normalize(skill)));
  const certifications = uniqueStrings(userInputData.certifications || getCertifications(profile));
  const summary = generated.professional_summary.trim();
  const facts = summaryFacts(userInputData);
  const transferableSignals = signals.filter(({ vacancy: pattern }) => pattern.test(vacancy));
  const differentRole = target && sourceWork.some(({ role }) => text(role).trim())
    && !sourceWork.some(({ role }) => normalize(role) === normalize(target));
  const shouldLeadWithTransferableSkills = differentRole && transferableSignals.length > 0;
  const repeatsSummary = Boolean(previousSummary) && normalize(summary) === normalize(previousSummary);
  const leadsWithPastRole = sourceWork.some(({ role }) => {
    const roleName = normalize(role);
    return roleName && includesNormalizedPhrase(normalize(summary.split(/[.!?]/)[0]), roleName);
  });
  const normalizedSummary = normalize(summary);
  const coveredSignals = transferableSignals.filter(({ evidence, phrase, detail }) =>
    evidence.test(normalizedSummary) || includesNormalizedPhrase(normalizedSummary, normalize(phrase))
    || includesNormalizedPhrase(normalizedSummary, normalize(detail))
  ).length;
  const coversTransferableEvidence = coveredSignals >= Math.min(2, transferableSignals.length);
  const tooBrief = transferableSignals.length >= 2 && normalizedSummary.split(' ').length < 16;
  const validSummary = isSupportedSummary(summary, corpus, vacancy, facts);
  let professionalSummary = validSummary && !repeatsSummary ? summary
    : supportedSummary(profile, userInputData, highlights, { target, vacancy, previousSummary });
  if (shouldLeadWithTransferableSkills && (!validSummary || leadsWithPastRole || !coversTransferableEvidence || tooBrief || repeatsSummary)) {
    professionalSummary = transferableSummary(transferableSignals, target, previousSummary);
  }

  const result = {
    headline: buildSupportedHeadline(userInputData, technicalSkills, categoryOrder),
    professional_summary: professionalSummary,
    work_experience: reconciledWork,
    academic_background: (userInputData.academic_background || []).map(sourceAcademicRecord),
    technical_skills: technicalSkills,
    technical_skill_order: categoryOrder,
    soft_skills: uniqueStrings([
      ...filterSupported(generated.soft_skills, `${corpus} ${observedSoftSkills.join(' ')}`, new Set(excludedSkillKeys)),
      ...observedSoftSkills,
    ]),
    certifications: uniqueStrings([...filterSupported(generated.certifications, certifications.join(' ')), ...certifications]),
  };
  return generatedCvSchema.parse(result);
}

export function buildCvUserPrompt(userInputData, targetJobDescription, focusDescription, previousCv) {
  const { personal_info: { target_role, career, bio } = {}, ...professionalData } = userInputData;
  return [
    `PUESTO_OBJETIVO:\n${targetPosition(target_role) || '(puesto no proporcionado)'}`,
    `TARGET_JOB_DESCRIPTION:\n${targetJobDescription || '(vacante no proporcionada)'}`,
    `ENFOQUE DE PRESENTACION:\n${focusDescription}`,
    `DATOS DEL CANDIDATO (unica fuente factual):\n${JSON.stringify({ personal_info: { career, bio }, ...professionalData })}`,
    'Ordena la evidencia por pertinencia y genera el CV en JSON según las reglas del sistema.',
    ...(previousCv ? [
      `VERSIÓN ANTERIOR (referencia de redacción):\n${JSON.stringify(previousCv)}`,
      'Redacta una alternativa para Sobre mí y las viñetas. Cambia la estructura y prioriza otros hechos pertinentes cuando los datos lo permitan. Conserva nombres técnicos y hechos comprobables. Usa la versión anterior solo para evitar repetir la redacción y mantén los datos del candidato como única fuente factual.',
    ] : []),
  ].join('\n\n');
}

/**
 * Fallback honesto para cv-parse cuando la IA no está disponible.
 *
 * Extrae datos del texto del CV usando expresiones regulares. Cuando un campo
 * no puede extraerse del texto real del CV queda vacío ("" o []) — nunca se
 * asigna un valor genérico inventado como "Computación e Informática" o listas
 * de habilidades por defecto.
 *
 * La detección por keywords (p. ej. "redes" → "Redes y Seguridad de TI") es una
 * heurística que sí parte del texto del usuario. El inicio vacío ("") garantiza
 * que, si ningún keyword coincide, el campo quede en blanco en lugar de tener
 * un valor fabricado.
 *
 * Exportada para permitir su test unitario en aislamiento.
 *
 * @param {string} cvText
 * @returns {object}
 */
export function buildFallbackParsedData(cvText) {
  const textLower = cvText.toLowerCase();

  // Intentar extraer nombre de la primera línea no vacía
  let first_name = '';
  let last_name  = '';
  const lines = cvText.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
  if (lines.length > 0) {
    const nameParts = lines[0].split(' ');
    if (nameParts.length >= 2) {
      first_name = nameParts[0];
      last_name  = nameParts.slice(1).join(' ');
    } else {
      first_name = nameParts[0];
    }
  }

  // Buscar email
  const emailMatch = cvText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  const email = emailMatch ? emailMatch[0] : '';

  // Buscar teléfono
  const phoneMatch = cvText.match(/(?:\+?\d{1,3}[- ]?)?\d{9,10}/);
  const phone = phoneMatch ? phoneMatch[0] : '';

  // Carrera: detectada por keywords del texto; vacía si ninguno coincide (sin valor por defecto inventado)
  let career = '';
  if (textLower.includes('redes'))           career = 'Redes y Seguridad de TI';
  else if (textLower.includes('diseño'))     career = 'Diseño y Desarrollo de Software';
  else if (textLower.includes('industrial')) career = 'Electrónica Industrial';
  else if (textLower.includes('sistemas'))   career = 'Ingeniería de Sistemas';

  // Puesto objetivo: detectado por keywords; vacío si ninguno coincide (sin valor por defecto inventado)
  let target_role = '';
  if (textLower.includes('frontend'))                                          target_role = 'Junior Frontend Developer';
  else if (textLower.includes('backend'))                                      target_role = 'Junior Backend Developer';
  else if (textLower.includes('fullstack') || textLower.includes('full stack')) target_role = 'Junior Full Stack Developer';
  else if (textLower.includes('soporte') || textLower.includes('técnico'))     target_role = 'Soporte Técnico de TI';

  // Habilidades técnicas: solo las encontradas en el texto — array vacío si no hay ninguna
  const techKeywords = [
    'react', 'node', 'javascript', 'python', 'html', 'css', 'sql',
    'postgresql', 'git', 'supabase', 'docker', 'angular', 'vue',
    'java', 'c#', 'php',
  ];
  const technical_skills = [];
  techKeywords.forEach((kw) => {
    if (textLower.includes(kw)) {
      const cap =
        kw === 'sql' || kw === 'html' || kw === 'css'
          ? kw.toUpperCase()
          : kw.charAt(0).toUpperCase() + kw.slice(1);
      technical_skills.push(cap);
    }
  });
  // Sin lista por defecto: si el texto no menciona ningún skill, el array queda vacío.

  // Habilidades blandas: solo las encontradas en el texto — array vacío si no hay ninguna
  const softKeywords = [
    'scrum', 'comunicación', 'equipo', 'proactivo', 'liderazgo',
    'organización', 'empatía', 'resolución', 'presión',
  ];
  const soft_skills = [];
  softKeywords.forEach((kw) => {
    if (textLower.includes(kw)) {
      const cap = kw.charAt(0).toUpperCase() + kw.slice(1);
      soft_skills.push(cap);
    }
  });
  // Sin lista por defecto: si el texto no menciona ninguna habilidad, el array queda vacío.

  // Bio: construida solo con los datos extraídos; vacía si no se extrajo career ni target_role
  const bioSegments = [
    career      ? `Egresado de ${career}` : null,
    target_role ? `orientado a desempeñarse como ${target_role}` : null,
  ].filter(Boolean);
  const bio = bioSegments.length > 0 ? bioSegments.join(' ') + '.' : '';

  return {
    first_name: first_name || '',
    last_name:  last_name  || '',
    email:      email      || '',
    phone:      phone      || '',
    career,
    target_role,
    bio,
    technical_skills,
    soft_skills,
    work_experience:     [],
    academic_background: [],
  };
}

// ---------------------------------------------------------------------------
// Funciones exportadas
// ---------------------------------------------------------------------------

/**
 * Genera un CV con IA y lo guarda salvo que se solicite solo la vista previa.
 *
 * Si la IA falla, usa el fallback honesto (datos reales del usuario).
 * Si la persistencia falla por columnas de metadatos faltantes (migración
 * pendiente), reintenta sin esas columnas; si aun así falla, lanza un error
 * 500 tipado con mensaje claro para el cliente.
 *
 * @param {object} params
 * @param {object} params.db             - Cliente Supabase autenticado (req.db)
 * @param {string} params.userId         - ID del usuario autenticado (req.user.id)
 * @param {string} params.profileId
 * @param {string} [params.document_title]
 * @param {string} [params.status]
 * @param {string} [params.cv_style]
 * @returns {Promise<{ cvId: string, cvData: object }>}
 */
export async function generateCv({ 
  db, 
  userId, 
  profileId, 
  persist = true,
  document_title, 
  status, 
  cv_style,
  custom_target_role,
  cv_focus,
  excluded_experience_ids,
  excluded_skills,
  candidate_data,
  previous_cv,
  target_job_description,
  aiGenerate = generateWithFallback,
}) {
  // 1. Obtener perfil
  const { data: profile, error: profileError } = await cvRepo.getProfile(db, profileId);
  if (profileError || !profile) {
    console.error('[cvService] Error recuperando perfil:', profileError);
    throw appError('Perfil no encontrado en la base de datos', 404, 'PROFILE_NOT_FOUND');
  }

  // 2. Obtener formación académica y experiencia laboral en paralelo
  const [academic, work] = await Promise.all([
    cvRepo.getAcademicBackground(db, profileId),
    cvRepo.getWorkExperience(db, profileId),
  ]);

  // 3. Consolidar la información estructurada aplicando filtros
  const excludedSkillKeys = new Set((excluded_skills || []).map(normalize));
  const excludedExperienceIds = new Set((excluded_experience_ids || []).map(text));
  const targetJobDescription = text(target_job_description ?? profile.target_job_description).trim();
  const candidateTechnicalSkills = candidate_data?.skills?.technical || profile.technical_skills || [];
  const candidateSoftSkills = candidate_data?.skills?.soft || profile.soft_skills || [];
  const candidateWork = candidate_data?.work_experience || work;
  const candidateAcademic = candidate_data?.academic_background || academic;
  const candidateCertifications = candidate_data?.certifications || getCertifications(profile);
  const userInputData = {
    personal_info: {
      first_name:  candidate_data?.personal_info?.first_name ?? profile.first_name,
      last_name:   candidate_data?.personal_info?.last_name ?? profile.last_name,
      email:       candidate_data?.personal_info?.email ?? profile.contact_email ?? profile.email,
      phone:       candidate_data?.personal_info?.phone ?? profile.phone,
      location:    candidate_data?.personal_info?.location ?? profile.location,
      linkedin:    candidate_data?.personal_info?.linkedin ?? profile.linkedin,
      portfolio:   candidate_data?.personal_info?.portfolio ?? profile.portfolio,
      career:      candidate_data?.personal_info?.career ?? profile.career,
      target_role: custom_target_role ?? candidate_data?.personal_info?.target_role ?? profile.target_role,
      bio:         candidate_data?.personal_info?.bio ?? profile.bio,
      cv_focus:    cv_focus || 'ATS',
    },
    skills: {
      technical: candidateTechnicalSkills.filter((skill) => !excludedSkillKeys.has(normalize(skill))),
      soft:      candidateSoftSkills.filter((skill) => !excludedSkillKeys.has(normalize(skill))),
    },
    certifications: candidateCertifications,
    academic_background: candidateAcademic,
    work_experience: candidateWork
      .map((record, index) => ({ ...record, id: record.id || `candidate-exp-${index}` }))
      .filter((record) => !excludedExperienceIds.has(text(record.id))),
  };

  // 4. Invocar a la IA; un fallo no debe persistir una plantilla como éxito IA.
  let cvJson;
  try {
    const focusLabel = cv_focus || 'ATS';
    const focusDescription = focusLabel === 'técnico' ? 'técnico (resaltando stacks, arquitecturas, metodologías)'
      : focusLabel === 'ejecutivo' ? 'ejecutivo (resaltando liderazgo, gestión de proyectos, visión estratégica)'
      : focusLabel === 'junior' ? 'junior (resaltando aprendizaje rápido, proyectos académicos, adaptabilidad)'
      : focusLabel === 'senior' ? 'senior (resaltando impacto cuantificable, mentoría, toma de decisiones)'
      : 'ATS estándar de alto impacto';

    const cvJsonText = await aiGenerate({
      useCase:   'cv_generation',
      messages:  [
        { role: 'system', content: SYSTEM_PROMPT_CV },
        { role: 'user', content: buildCvUserPrompt(userInputData, targetJobDescription, focusDescription, previous_cv) },
      ],
      db,
      userId,
      jsonMode:  true,
      responseSchema: generatedCvJsonSchema,
      maxTokens: 4000,
    });
    cvJson = parseAndReconcileGeneratedCv(cvJsonText, profile, userInputData, targetJobDescription, excludedSkillKeys, previous_cv?.summary);
  } catch (apiError) {
    console.warn('[cvService] Falló la generación IA:', { code: apiError.code || 'INVALID_AI_RESPONSE' });
    throw appError('No se pudo generar un CV válido con IA. Tus datos y el documento anterior se conservan; vuelve a intentarlo.', 502, 'DOCUMENT_AI_UNAVAILABLE');
  }

  cvJson = persistedCvSchema.parse({
    ...cvJson,
    snapshot_version: 1,
    personal_info: Object.fromEntries(
      ['first_name', 'last_name', 'email', 'phone', 'location', 'linkedin', 'portfolio', 'career', 'target_role']
        .map((field) => [field, text(userInputData.personal_info[field])])
    ),
    target_job_description: targetJobDescription,
    cv_focus: cv_focus || 'ATS',
  });

  if (!persist) return { cvId: null, cvData: cvJson };

  const defaultTitle = `CV ${profile.first_name || 'Egresado'} - ${custom_target_role || profile.target_role || profile.career || 'TI'}`;
  const savedCv = await saveCv({ db, profileId, cvData: cvJson, documentTitle: document_title || defaultTitle, status, cvStyle: cv_style });
  return { cvId: savedCv.id, cvData: cvJson };
}

export async function saveCv({ db, profileId, cvData, documentTitle, status, cvStyle }) {
  // Si el esquema real no tiene alguna columna de metadatos (migración
  // supabase/migration_fix_all.sql pendiente), se reintenta sin esa columna
  // para no bloquear la generación: el CV se guarda con los campos que sí
  // existen. profile_id y cv_data son parte del esquema base y nunca se omiten.
  const personal = cvData.personal_info;
  const defaultTitle = `CV ${text(personal?.first_name) || 'Egresado'}${personal?.target_role ? ` - ${personal.target_role}` : ''}`;
  const insertPayload = {
    profile_id:     profileId,
    cv_data:        cvData,
    document_title: documentTitle || defaultTitle,
    status:         status    || 'generated',
    cv_style:       cvStyle   || null,
  };
  const REQUIRED_COLUMNS = ['profile_id', 'cv_data'];

  let savedCv   = null;
  let lastError = null;
  const maxAttempts = Object.keys(insertPayload).length - REQUIRED_COLUMNS.length + 1;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const { data, error, errorCode } = await cvRepo.insertCv(db, insertPayload);
    if (!error) {
      savedCv = data;
      break;
    }
    lastError = error;

    // PGRST204: "Could not find the 'X' column..." / 42703: "column t.X does not exist"
    const missingColumn = errorCode === 'DB_SCHEMA_MISMATCH'
      ? (error.message?.match(/'([^']+)' column/)?.[1] ||
         error.message?.match(/column (?:\w+\.)?"?(\w+)"? does not exist/)?.[1])
      : null;

    if (missingColumn && !REQUIRED_COLUMNS.includes(missingColumn) && missingColumn in insertPayload) {
      console.warn(
        `[cvService] La columna '${missingColumn}' no existe en generated_cvs. ` +
        `Se reintenta el guardado sin ella. Ejecuta supabase/migration_fix_all.sql en Supabase para actualizar el esquema.`
      );
      delete insertPayload[missingColumn];
      continue;
    }
    break;
  }

  if (!savedCv) {
    console.error('[cvService] Error guardando el CV en Supabase:', lastError);
    const isSchemaError = lastError?.code === 'PGRST204' || lastError?.code === '42703';
    throw appError(
      isSchemaError
        ? 'No se pudo guardar el CV: el esquema de la base de datos está desactualizado. Ejecuta la migración supabase/migration_fix_all.sql.'
        : 'No se pudo guardar el CV en la base de datos.',
      500,
      isSchemaError ? 'DB_SCHEMA_MISMATCH' : 'CV_SAVE_FAILED'
    );
  }

  return savedCv;
}

/**
 * Parsea el texto de un CV con IA y actualiza el perfil del usuario.
 *
 * La importación exige IA y valida el contrato. El guardado es atómico;
 * los errores bloquean la operación y no se presentan como éxito.
 *
 * @param {object} params
 * @param {object} params.db        - Cliente Supabase autenticado (req.db)
 * @param {string} params.userId    - ID del usuario autenticado (req.user.id)
 * @param {string} params.profileId
 * @param {string} params.cvText
 * @returns {Promise<{ parsedData: object }>}
 */
export async function parseCv({ db, userId, profileId, cvText, generate = generateWithFallback }) {
  const { parsedData } = await parseCvRaw({ db, userId, cvText, generate });
  const { data: currentProfile, error: profileError } = await cvRepo.getProfile(db, profileId);
  if (profileError || !currentProfile) throw appError('No se pudo leer el perfil antes de importar. No se guardó ningún dato.', 404, 'PROFILE_REQUIRED');

  const profileUpdate = {};
  for (const field of ['first_name', 'last_name', 'phone', 'location', 'career', 'bio']) {
    if (parsedData[field]?.trim()) profileUpdate[field] = parsedData[field];
  }
  for (const field of ['target_role', 'target_job_description']) {
    if (!currentProfile[field]?.trim() && parsedData[field]?.trim()) profileUpdate[field] = parsedData[field];
  }
  if (parsedData.technical_skills.length) profileUpdate.technical_skills = parsedData.technical_skills;
  if (parsedData.soft_skills.length) profileUpdate.soft_skills = parsedData.soft_skills;

  // Empty import sections must retain existing records. The RPC commits all
  // three sections together or rolls back; no delete-then-insert soft failure.
  const academic = parsedData.academic_background.length ? parsedData.academic_background
    : await cvRepo.getAcademicBackground(db, profileId);
  const work = parsedData.work_experience.length ? parsedData.work_experience
    : await cvRepo.getWorkExperience(db, profileId);
  const validation = fullProfileUpdateSchema.safeParse({
    profile: profileUpdate,
    academic_background: academic.map(({ institution, degree, start_date, end_date, description }) => ({ institution, degree, start_date, end_date, description })),
    work_experience: work.map(({ company, role, start_date, end_date, description, achievements }) => ({ company, role, start_date, end_date, description, achievements })),
  });
  if (!validation.success) throw appError('Revisa los campos y fechas del CV antes de guardar. No se guardó ningún dato.', 422, 'CV_IMPORT_REVIEW_REQUIRED');
  const { error } = await db.rpc('replace_current_user_profile_data', {
    p_profile: validation.data.profile,
    p_academic: validation.data.academic_background,
    p_work: validation.data.work_experience,
  });
  if (error) throw appError('No se pudo guardar el perfil importado. La operación fue cancelada sin reemplazar parcialmente tus datos.', 500, 'CV_IMPORT_SAVE_FAILED');
  return { parsedData };
}

/**
 * Extrae los datos estructurados de un CV en texto libre con IA, SIN persistir
 * nada en el perfil del usuario. Se usa para autocompletar el wizard de CV:
 * el usuario decide después si guarda o descarta los datos.
 *
 * @param {object} params
 * @param {object} params.db      - Cliente Supabase autenticado (req.db)
 * @param {string} params.userId  - ID del usuario autenticado (req.user.id)
 * @param {string} params.cvText
 * @returns {Promise<{ parsedData: object }>}
 */
export async function parseCvRaw({ db, userId, cvText, generate = generateWithFallback }) {
  const maxTokens = cvImportTokenBudget(cvText);
  let raw;
  try {
    raw = await generate({
      useCase: 'cv_generation',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT_CV_IMPORT_FAITHFUL },
        { role: 'user', content: JSON.stringify({ cv_document: cvText }) },
      ],
      db, userId, jsonMode: true, maxTokens,
      responseSchema: importedCvJsonSchema,
    });
  } catch {
    // No silent regex fallback: it omits experience and appears successful.
    throw appError('No se pudo importar el CV con IA. No se modificó tu formulario; revisa tu proveedor y vuelve a intentarlo.', 502, 'CV_IMPORT_AI_UNAVAILABLE');
  }
  return { parsedData: parseImportedCv(raw, cvText) };
}

/**
 * Elimina un CV del usuario autenticado.
 *
 * @param {object} params
 * @param {object} params.db
 * @param {string} params.id      - ID del CV (generated_cvs.id)
 * @param {string} params.userId  - ID del usuario autenticado (req.user.id)
 * @returns {Promise<void>}
 */
export async function deleteUserCv({ db, id, userId }) {
  const { error } = await cvRepo.deleteCv(db, id, userId);
  if (error) {
    console.error('[cvService] Error al eliminar CV:', error);
    throw appError('Error al eliminar el CV en la base de datos', 500);
  }
}

/**
 * Actualiza campos editables de un CV del usuario autenticado.
 * Solo actualiza los campos que llegan definidos en `fields`.
 *
 * @param {object} params
 * @param {object} params.db
 * @param {string} params.id
 * @param {string} params.userId
 * @param {object} params.fields
 * @param {string} [params.fields.status]
 * @param {string} [params.fields.document_title]
 * @param {string} [params.fields.cv_style]
 * @param {object} [params.fields.cv_data]
 * @returns {Promise<{ cv: object }>}
 */
export async function updateUserCv({ db, id, userId, fields }) {
  const updatePayload = {};
  if (fields.status         !== undefined) updatePayload.status         = fields.status;
  if (fields.document_title !== undefined) updatePayload.document_title = fields.document_title;
  if (fields.cv_style       !== undefined) updatePayload.cv_style       = fields.cv_style;
  if (fields.cv_data        !== undefined) updatePayload.cv_data        = fields.cv_data;
  updatePayload.updated_at = new Date().toISOString();

  const { data: updatedCv, error } = await cvRepo.updateCv(db, id, userId, updatePayload);

  if (error) {
    console.error('[cvService] Error al actualizar CV:', error);
    throw appError('Error al actualizar el CV.', 400, 'CV_UPDATE_FAILED');
  }

  return { cv: updatedCv };
}
