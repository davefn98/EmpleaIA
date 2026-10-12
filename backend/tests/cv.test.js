/**
 * cv.test.js — Pruebas unitarias del módulo de CVs (framework nativo node:test).
 * Ejecutar con:  npm test   (desde la carpeta backend)
 *
 * Se centran en las funciones puras que no dependen de red ni de base de datos:
 * en particular `buildFallbackParsedData`, que debe ser 100% honesta — nunca
 * devolver valores inventados cuando el texto del CV no contiene la información.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

// Dependencia transitiva de AIProviderService (encryption.js) necesita esta clave.
process.env.ENCRYPTION_KEY = 'a'.repeat(64);

const {
  buildCvUserPrompt,
  buildFallbackCv,
  buildFallbackParsedData,
  generateCv,
  parseAndReconcileGeneratedCv,
} = await import('../services/cvService.js');
const {
  cvGenerateSchema,
  generatedCvJsonSchema,
  generatedCvSchema,
} = await import('../validators/cvValidator.js');
const { OpenAIProvider } = await import('../lib/aiProviders/OpenAIProvider.js');

const emptyGeneratedCv = (overrides = {}) => ({
  headline: '',
  professional_summary: '',
  work_experience: [],
  academic_background: [],
  technical_skills: {
    backend: [], cloud: [], architecture: [], databases: [], integration: [],
    testing: [], devops: [], security: [], frontend: [], other: [],
  },
  technical_skill_order: [
    'backend', 'cloud', 'architecture', 'databases', 'integration',
    'testing', 'devops', 'security', 'frontend', 'other',
  ],
  soft_skills: [],
  certifications: [],
  ...overrides,
});

function createCvDb({ profile, academic = [], work = [] }) {
  const savedPayloads = [];
  return {
    savedPayloads,
    from(table) {
      if (table === 'profiles') {
        return {
          select() { return this; },
          eq() { return this; },
          async single() { return { data: profile, error: null }; },
        };
      }
      if (table === 'academic_background' || table === 'work_experience') {
        const data = table === 'academic_background' ? academic : work;
        return {
          select() { return this; },
          eq() { return this; },
          then(resolve) { resolve({ data, error: null }); },
        };
      }
      if (table === 'generated_cvs') {
        return {
          insert(payload) { savedPayloads.push(payload); return this; },
          select() { return this; },
          async single() { return { data: { id: 'cv-1' }, error: null }; },
        };
      }
      throw new Error(`Tabla inesperada en test: ${table}`);
    },
  };
}

// ---------------------------------------------------------------------------
// Honestidad: texto vacío / sin datos relevantes
// ---------------------------------------------------------------------------

test('buildFallbackParsedData: texto vacío → career y target_role son strings vacíos', () => {
  const result = buildFallbackParsedData('');
  assert.equal(result.career,      '', 'career debe ser "" cuando no coincide ningún keyword');
  assert.equal(result.target_role, '', 'target_role debe ser "" cuando no coincide ningún keyword');
});

test('buildFallbackParsedData: texto vacío → technical_skills y soft_skills son arrays vacíos', () => {
  const result = buildFallbackParsedData('');
  assert.deepEqual(result.technical_skills, [], 'technical_skills debe ser [] cuando el texto no menciona skills');
  assert.deepEqual(result.soft_skills,      [], 'soft_skills debe ser [] cuando el texto no menciona skills');
});

test('buildFallbackParsedData: texto sin keywords → bio vacío (no se fabrica una bio genérica)', () => {
  const result = buildFallbackParsedData('Sin información relevante aquí');
  assert.equal(result.bio, '', 'bio debe ser "" cuando no hay career ni target_role extraídos');
});

test('buildFallbackParsedData: texto irrelevante → nunca devuelve "Computación e Informática"', () => {
  const result = buildFallbackParsedData('Texto sin ninguna mención a carreras o tecnologías');
  assert.notEqual(result.career, 'Computación e Informática', 'el default de carrera inventado no debe aparecer');
});

test('buildFallbackParsedData: texto irrelevante → nunca devuelve "Junior Developer"', () => {
  const result = buildFallbackParsedData('Texto sin ninguna mención a roles o puestos');
  assert.notEqual(result.target_role, 'Junior Developer', 'el default de role inventado no debe aparecer');
});

test('buildFallbackParsedData: sin skills reales → no rellena con ["HTML","CSS","JavaScript","Git"]', () => {
  const result = buildFallbackParsedData('Texto sin menciones a tecnologías');
  assert.equal(result.technical_skills.includes('HTML'),       false, 'HTML no debe aparecer si no está en el texto');
  assert.equal(result.technical_skills.includes('JavaScript'), false, 'JavaScript no debe aparecer si no está en el texto');
});

test('buildFallbackParsedData: sin skills blandas → no rellena con valores genéricos', () => {
  const result = buildFallbackParsedData('Texto sin habilidades mencionadas');
  assert.deepEqual(result.soft_skills, [], 'soft_skills debe ser [] sin keywords en el texto');
});

// ---------------------------------------------------------------------------
// Extracción real desde texto
// ---------------------------------------------------------------------------

test('buildFallbackParsedData: keyword "redes" en texto → career extraído correctamente', () => {
  const result = buildFallbackParsedData('Experiencia en redes y telecomunicaciones');
  assert.equal(result.career, 'Redes y Seguridad de TI');
});

test('buildFallbackParsedData: keyword "frontend" en texto → target_role extraído correctamente', () => {
  const result = buildFallbackParsedData('Desarrollador frontend con React');
  assert.equal(result.target_role, 'Junior Frontend Developer');
});

test('buildFallbackParsedData: keyword "react" en texto → aparece en technical_skills', () => {
  const result = buildFallbackParsedData('Trabajo con React y Git');
  assert.ok(result.technical_skills.includes('React'), 'React debe detectarse en el texto');
  assert.ok(result.technical_skills.includes('Git'),   'Git debe detectarse en el texto');
});

test('buildFallbackParsedData: keyword "scrum" en texto → aparece en soft_skills', () => {
  const result = buildFallbackParsedData('Experiencia trabajando con scrum y liderazgo de equipos');
  assert.ok(result.soft_skills.includes('Scrum'),     'Scrum debe detectarse en el texto');
  assert.ok(result.soft_skills.includes('Liderazgo'), 'Liderazgo debe detectarse en el texto');
});

test('buildFallbackParsedData: bio se construye con datos extraídos — nunca inventa texto', () => {
  const result = buildFallbackParsedData('backend developer con experiencia');
  // "backend" → target_role = "Junior Backend Developer"; career sigue vacío
  assert.ok(result.bio.includes('Junior Backend Developer'), 'bio debe incluir el role extraído');
  assert.ok(!result.bio.includes('Computación'), 'bio no debe incluir valores inventados');
});

test('buildFallbackParsedData: email y teléfono se extraen del texto cuando existen', () => {
  const result = buildFallbackParsedData('Contacto: juan@example.com | 987654321');
  assert.equal(result.email, 'juan@example.com');
  assert.ok(result.phone.length > 0, 'phone debe detectarse');
});

// ---------------------------------------------------------------------------
// Forma de la respuesta
// ---------------------------------------------------------------------------

test('buildFallbackParsedData: siempre devuelve work_experience y academic_background como arrays vacíos', () => {
  const result = buildFallbackParsedData('Texto con mucha experiencia laboral y estudios universitarios');
  assert.deepEqual(result.work_experience,     [], 'el regex fallback no puede extraer experiencia laboral estructurada');
  assert.deepEqual(result.academic_background, [], 'el regex fallback no puede extraer educación estructurada');
});

// ---------------------------------------------------------------------------
// Contrato de generación, fallback y fidelidad
// ---------------------------------------------------------------------------

test('generatedCvSchema: exige contrato estricto y rechaza campos adicionales', () => {
  assert.equal(generatedCvSchema.safeParse(emptyGeneratedCv()).success, true);
  assert.equal(generatedCvSchema.safeParse({ ...emptyGeneratedCv(), invented: true }).success, false);
  assert.equal(generatedCvSchema.safeParse(emptyGeneratedCv({
    work_experience: [{
      source_id: '1', company: '', role: '', start_date: '', end_date: '',
      relevance: 'critical', bullets: [],
    }],
  })).success, false);
});

test('cvGenerateSchema: acepta target_job_description y rechaza caracteres nulos', () => {
  assert.equal(cvGenerateSchema.safeParse({
    profileId: 'profile-1',
    target_job_description: 'Backend Node.js con PostgreSQL',
  }).success, true);
  assert.equal(cvGenerateSchema.safeParse({
    profileId: 'profile-1',
    target_job_description: 'Backend\0Node.js',
  }).success, false);
});

test('buildFallbackCv: usa el contrato nuevo y deja vacíos los datos ausentes', () => {
  const fallback = buildFallbackCv({}, {
    personal_info: {},
    skills: { technical: [], soft: [] },
    work_experience: [],
    academic_background: [],
  });
  assert.deepEqual(fallback, emptyGeneratedCv());
  assert.equal(generatedCvSchema.safeParse(fallback).success, true);
});

test('parseAndReconcileGeneratedCv: restaura experiencia y educación y elimina tecnologías inventadas', () => {
  const profile = {
    technical_skills: ['Node.js'],
    soft_skills: ['Liderazgo'],
    certifications: ['AWS Cloud Practitioner'],
    bio: 'Backend con Node.js',
  };
  const source = {
    personal_info: {},
    skills: { technical: ['Node.js'], soft: ['Liderazgo'] },
    work_experience: [{
      id: 'exp-1',
      company: 'Empresa real',
      role: 'Desarrollador junior',
      start_date: '2023-01-01',
      end_date: null,
      description: 'Desarrollé APIs con Node.js.',
      achievements: ['Reduje la latencia en 20%.'],
    }],
    academic_background: [{
      institution: 'Instituto real',
      degree: 'Desarrollo de Software',
      start_date: '2020-01-01',
      end_date: '2022-12-01',
      description: 'Formación técnica',
    }],
  };
  source.personal_info = {
    target_role: 'Backend Developer',
    career: 'Desarrollo de Software',
    bio: 'Backend con Node.js',
  };
  const generated = emptyGeneratedCv({
    headline: 'Kubernetes Engineer',
    professional_summary: 'Perfil Kubernetes con 10 años de experiencia.',
    work_experience: [{
      source_id: 'exp-1',
      company: 'Empresa inventada',
      role: 'CTO',
      start_date: '1990-01-01',
      end_date: '2099-01-01',
      relevance: 'high',
      bullets: [
        'Desarrollé APIs con Node.js.',
        'Reduje la latencia en 20%.',
        'Mejoré servicios backend.',
        'Orquesté Kubernetes.',
        'Reduje costos en 2%.',
        'Lideré una migración global de APIs a Rust.',
      ],
    }],
    academic_background: [{
      institution: 'Universidad inventada', degree: 'Doctorado', start_date: '', end_date: '', description: '',
    }],
    technical_skills: {
      ...emptyGeneratedCv().technical_skills,
      backend: ['Node.js'],
      devops: ['Kubernetes'],
    },
    technical_skill_order: [
      'devops', 'backend', 'cloud', 'architecture', 'databases',
      'integration', 'testing', 'security', 'frontend', 'other',
    ],
    soft_skills: ['Liderazgo', 'Negociación'],
    certifications: ['AWS Cloud Practitioner', 'CKA'],
  });

  const reconciled = parseAndReconcileGeneratedCv(JSON.stringify(generated), profile, source);
  assert.deepEqual(reconciled.work_experience[0], {
    source_id: 'exp-1',
    company: 'Empresa real',
    role: 'Desarrollador junior',
    start_date: '2023-01-01',
    end_date: '',
    relevance: 'medium',
    bullets: generated.work_experience[0].bullets.slice(0, 2),
  });
  assert.deepEqual(reconciled.academic_background, [{
    institution: 'Instituto real',
    degree: 'Desarrollo de Software',
    start_date: '2020-01-01',
    end_date: '2022-12-01',
    description: 'Formación técnica',
  }]);
  assert.deepEqual(reconciled.technical_skills.backend, ['Node.js']);
  assert.deepEqual(reconciled.technical_skills.devops, []);
  assert.equal(reconciled.technical_skill_order[0], 'backend');
  assert.deepEqual(reconciled.soft_skills, ['Liderazgo']);
  assert.deepEqual(reconciled.certifications, ['AWS Cloud Practitioner']);
  assert.equal(reconciled.headline, 'Backend Developer | Node.js');
  assert.equal(reconciled.professional_summary, 'Backend con Node.js');
});

test('buildCvUserPrompt: separa la vacante de la fuente factual', () => {
  const prompt = buildCvUserPrompt({ skills: { technical: ['Node.js'] } }, 'Se requiere Kubernetes', 'ATS');
  assert.match(prompt, /TARGET_JOB_DESCRIPTION:\nSe requiere Kubernetes/);
  assert.match(prompt, /DATOS DEL CANDIDATO \(unica fuente factual\):/);
});

test('generateCv: JSON inválido activa fallback, usa vacante del perfil y persiste contrato válido', async () => {
  const profile = {
    id: 'profile-1', first_name: 'Ada', career: 'Ingeniería', target_role: 'Backend Developer',
    target_job_description: 'Vacante del perfil: Node.js', bio: 'Desarrolladora backend.',
    technical_skills: ['Node.js'], soft_skills: [], certifications: [],
  };
  const db = createCvDb({ profile });
  let aiParams;
  const result = await generateCv({
    db,
    userId: 'profile-1',
    profileId: 'profile-1',
    aiGenerate: async (params) => {
      aiParams = params;
      return '{json inválido';
    },
  });

  assert.equal(result.cvId, 'cv-1');
  assert.equal(generatedCvSchema.safeParse(result.cvData).success, true);
  assert.match(aiParams.messages[1].content, /Vacante del perfil: Node\.js/);
  assert.equal(aiParams.maxTokens, 4000);
  assert.equal(aiParams.responseSchema, generatedCvJsonSchema);
  assert.deepEqual(db.savedPayloads[0].cv_data, result.cvData);
});

test('generateCv: la vacante opcional del request prevalece sobre la guardada', async () => {
  const profile = {
    id: 'profile-1', first_name: 'Ada', target_job_description: 'Vacante antigua',
    technical_skills: [], soft_skills: [], certifications: [],
  };
  const db = createCvDb({ profile });
  let prompt;
  await generateCv({
    db,
    userId: 'profile-1',
    profileId: 'profile-1',
    target_job_description: 'Vacante específica del request',
    aiGenerate: async (params) => {
      prompt = params.messages[1].content;
      return JSON.stringify(emptyGeneratedCv());
    },
  });
  assert.match(prompt, /Vacante específica del request/);
  assert.doesNotMatch(prompt, /Vacante antigua/);
});

test('generateCv: usa candidate_data temporal sin modificar el perfil maestro', async () => {
  const profile = {
    id: 'profile-1', first_name: 'Ada', target_role: 'Rol maestro', bio: 'Bio maestra',
    technical_skills: ['Java'], soft_skills: [], certifications: [],
  };
  const db = createCvDb({ profile, work: [{ id: 'master-1', company: 'Empresa maestra', role: 'Java Developer' }] });
  let prompt;
  const candidateData = {
    personal_info: { career: 'Ingeniería', target_role: 'Backend Developer', bio: 'Backend con Node.js' },
    skills: { technical: ['Node.js'], soft: [] },
    academic_background: [],
    work_experience: [{
      id: 'temporary-1', company: 'Empresa temporal', role: 'Backend Developer',
      start_date: '', end_date: null, description: 'Desarrollo de APIs con Node.js.', achievements: [],
    }],
  };

  const result = await generateCv({
    db,
    userId: 'profile-1',
    profileId: 'profile-1',
    candidate_data: candidateData,
    aiGenerate: async (params) => {
      prompt = params.messages[1].content;
      return JSON.stringify(emptyGeneratedCv());
    },
  });

  assert.match(prompt, /Empresa temporal/);
  assert.doesNotMatch(prompt, /Empresa maestra/);
  assert.equal(result.cvData.headline, 'Backend Developer | Node.js');
  assert.equal(result.cvData.work_experience[0].company, 'Empresa temporal');
});

test('OpenAIProvider: usa json_schema estricto en modelos compatibles', async () => {
  const provider = new OpenAIProvider();
  let request;
  provider._buildClient = () => ({
    chat: {
      completions: {
        create: async (params) => {
          request = params;
          return { choices: [{ message: { content: '{}' } }], usage: {} };
        },
      },
    },
  });
  await provider.generateText({
    apiKey: 'test',
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: 'CV' }],
    jsonMode: true,
    responseSchema: generatedCvJsonSchema,
  });
  assert.equal(request.response_format.type, 'json_schema');
  assert.equal(request.response_format.json_schema.strict, true);
  assert.equal(request.response_format.json_schema.schema, generatedCvJsonSchema);
});

test('OpenAIProvider: evita json_schema en snapshots antiguos no compatibles', async () => {
  const provider = new OpenAIProvider();
  let request;
  provider._buildClient = () => ({
    chat: { completions: { create: async (params) => {
      request = params;
      return { choices: [{ message: { content: '{}' } }], usage: {} };
    } } },
  });
  await provider.generateText({
    apiKey: 'test', model: 'gpt-4o-2024-05-13', messages: [], jsonMode: true,
    responseSchema: generatedCvJsonSchema,
  });
  assert.equal(request.response_format.type, 'json_object');
});

test('escenarios A-G: el fallback y la reconciliación conservan evidencia y priorizan la vacante', () => {
  const profile = {
    target_role: 'Backend Developer',
    bio: 'Desarrollador backend con experiencia en APIs y servicios empresariales.',
    technical_skills: ['Node.js', 'AWS', 'PostgreSQL', 'Git', 'React'],
    soft_skills: ['Comunicación'],
  };
  const makeExperience = (index, overrides = {}) => ({
    id: `exp-${index}`,
    company: `Empresa ${index}`,
    role: index === 1 ? 'Backend Developer' : 'Software Developer',
    start_date: `${2016 + index}-01-01`,
    end_date: index === 7 ? null : `${2016 + index}-12-31`,
    description: index === 1
      ? 'Desarrollo e integración de APIs REST con Node.js y PostgreSQL en AWS.'
      : 'Mantenimiento de aplicaciones internas.',
    achievements: [],
    ...overrides,
  });
  const baseInput = (workExperience) => ({
    personal_info: {
      target_role: profile.target_role,
      career: 'Ingeniería de Sistemas',
      bio: profile.bio,
    },
    skills: { technical: profile.technical_skills, soft: profile.soft_skills },
    academic_background: [],
    work_experience: workExperience,
  });

  const shortCv = buildFallbackCv(profile, baseInput([makeExperience(1)]), 'Node.js y AWS');
  assert.equal(shortCv.work_experience.length, 1, 'Caso A: conserva un CV corto');

  const intermediateCv = buildFallbackCv(
    profile,
    baseInput([makeExperience(1), makeExperience(2), makeExperience(3)]),
    'Node.js y APIs REST'
  );
  assert.equal(intermediateCv.work_experience.length, 3, 'Caso B: conserva un CV intermedio');

  const longExperience = Array.from({ length: 7 }, (_, index) => makeExperience(index + 1));
  const longCv = buildFallbackCv(profile, baseInput(longExperience), 'Backend Node.js');
  assert.equal(longCv.work_experience.length, 7, 'Caso C: conserva trayectorias extensas');

  const detailed = makeExperience(1, {
    achievements: Array.from({ length: 9 }, (_, index) => `Logro real ${index + 1} con Node.js`),
  });
  const detailedCv = buildFallbackCv(profile, baseInput([detailed]), 'Node.js AWS APIs REST PostgreSQL');
  assert.ok(detailedCv.work_experience[0].bullets.length <= 6, 'Caso D: limita sin reducir a una sola función relevante');

  assert.deepEqual(
    shortCv.technical_skill_order.slice(0, 2),
    ['backend', 'cloud'],
    'Caso E: una vacante técnica prioriza sus categorías coincidentes'
  );
  assert.equal(
    intermediateCv.work_experience.filter((experience) => experience.relevance !== 'low').length,
    1,
    'Caso F: solo la experiencia coincidente recibe mayor relevancia'
  );

  const unmetRequirementCv = buildFallbackCv(profile, baseInput([makeExperience(1)]), 'Kubernetes y Go obligatorios');
  assert.equal(
    Object.values(unmetRequirementCv.technical_skills).flat().includes('Kubernetes'),
    false,
    'Caso G: un requisito no cumplido no se incorpora al CV'
  );
  assert.equal(generatedCvSchema.safeParse(unmetRequirementCv).success, true);
});
