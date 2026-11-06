import { readFile } from 'node:fs/promises';
import { generateCv } from '../services/cvService.js';
import { generateWithFallback } from '../lib/AIProviderService.js';
import { CV_TECHNICAL_SKILL_CATEGORIES as categories } from '../validators/cvValidator.js';

const live = process.argv.includes('--live');
const cases = JSON.parse(await readFile(new URL('./cv-summary-cases.json', import.meta.url), 'utf8'));
const normalize = (value) => value.normalize('NFD').replace(/\p{M}/gu, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const matches = (value, pattern) => new RegExp(pattern).test(value);
const numbers = (value) => value.match(/\b\d+(?:[.,]\d+)?%?/g) || [];

function simulatedResponse(summary) {
  return JSON.stringify({
    headline: '', professional_summary: summary, work_experience: [], academic_background: [],
    technical_skills: Object.fromEntries(categories.map((category) => [category, []])),
    technical_skill_order: categories, soft_skills: [], certifications: [],
  });
}

function evaluateSummary(scenario, summary) {
  const normalized = normalize(summary);
  if (!scenario.evidence.length) {
    return { adaptation: !normalized, alerts: normalized ? ['resumen sin evidencia'] : [] };
  }
  const adaptation = scenario.evidence.every((pattern) => matches(normalized, pattern))
    && matches(normalized, scenario.alignment) && normalized.split(' ').length >= 16;
  const alerts = scenario.forbidden.filter((pattern) => matches(normalized, pattern));
  const sourceNumbers = new Set(numbers(JSON.stringify([scenario.profile, scenario.work, scenario.academic])));
  if (numbers(summary).some((number) => !sourceNumbers.has(number))) alerts.push('cifra sin respaldo');
  return { adaptation, alerts };
}

async function evaluateCase(scenario) {
  const work = scenario.work || [];
  const profile = { id: scenario.id, ...scenario.profile };
  const rows = { academic_background: scenario.academic || [], work_experience: work };
  const db = {
    from(table) {
      if (table === 'profiles') return { select() { return this; }, eq() { return this; }, async single() { return { data: profile }; } };
      if (Object.hasOwn(rows, table)) return { select() { return this; }, async eq() { return { data: rows[table] }; } };
      if (table === 'ai_model_preferences' || table === 'ai_provider_credentials') {
        return { select() { return this; }, eq() { return this; }, order() { return this; }, limit() { return this; }, async maybeSingle() { return { data: null }; } };
      }
      throw new Error(`Acceso inesperado durante la evaluación: ${table}`);
    },
  };
  const rawSummaries = [];
  const aiGenerate = async (params) => {
    const raw = live ? await generateWithFallback(params) : simulatedResponse(scenario.simulated);
    try { rawSummaries.push(JSON.parse(raw).professional_summary); }
    catch { rawSummaries.push(null); }
    return raw;
  };
  const request = {
    db, userId: scenario.id, profileId: scenario.id, persist: false, aiGenerate,
    custom_target_role: scenario.target, target_job_description: scenario.vacancy,
  };
  const { cvData: first } = await generateCv(request);
  const { cvData: next } = await generateCv({ ...request, previous_cv: {
    summary: first.professional_summary.slice(0, 1200),
    bullets: first.work_experience.flatMap(({ bullets }) => bullets).slice(0, 12).map((bullet) => bullet.slice(0, 400)),
  } });
  const summaries = [first.professional_summary, next.professional_summary];
  const results = summaries.map((summary) => evaluateSummary(scenario, summary));
  const adaptation = results.every((result) => result.adaptation);
  const variation = scenario.evidence.length ? normalize(summaries[0]) !== normalize(summaries[1]) : null;
  const roles = (cv) => cv.work_experience.map(({ role }) => role).sort().join('|');
  const originalRoles = work.map(({ role }) => role).sort().join('|');
  const alerts = results.flatMap((result) => result.alerts);
  if ([first, next].some((cv) => roles(cv) !== originalRoles)) alerts.push('cargos alterados');
  return { id: scenario.id, adaptation, variation, alerts, summaries, rawSummaries };
}

for (const scenario of cases) {
  const reference = evaluateSummary(scenario, scenario.reference);
  if (!reference.adaptation || reference.alerts.length) throw new Error(`Referencia inválida para la rúbrica de ${scenario.id}`);
}

console.log(`Evaluación de Sobre mí (${live ? 'modelo del servidor' : 'respuestas simuladas'})`);
const results = [];
for (const scenario of cases) {
  try {
    const result = await evaluateCase(scenario);
    results.push(result);
    console.log(JSON.stringify(result));
  } catch (error) {
    console.error(JSON.stringify({ id: scenario.id, error: error.code || 'EVALUATION_ERROR' }));
  }
}
const eligible = results.filter(({ variation }) => variation !== null);
console.log(JSON.stringify({
  evaluated: results.length, total: cases.length,
  adapted: results.filter(({ adaptation }) => adaptation).length,
  varied: eligible.filter(({ variation }) => variation).length, eligible: eligible.length,
  withoutAlerts: results.filter(({ alerts }) => !alerts.length).length,
}));
if (results.length !== cases.length || results.some(({ adaptation, variation, alerts }) => !adaptation || variation === false || alerts.length)) {
  process.exitCode = 1;
}
