const fieldNames = {
  first_name: 'Nombres', last_name: 'Apellidos', contact_email: 'Correo de contacto',
  phone: 'Teléfono', location: 'Ubicación', linkedin: 'LinkedIn', portfolio: 'Portafolio',
  career: 'Carrera o profesión', target_role: 'Puesto objetivo',
  target_job_description: 'Descripción del puesto', bio: 'Resumen profesional',
  company: 'Empresa', role: 'Cargo', institution: 'Institución', degree: 'Carrera o programa de estudios',
  start_date: 'Fecha de inicio', end_date: 'Fecha de fin', description: 'Descripción',
  technical_skills: 'Habilidades técnicas', soft_skills: 'Habilidades blandas', certifications: 'Certificaciones',
};

const requiredMessages = {
  first_name: 'Escribe tus nombres.',
  last_name: 'Escribe tus apellidos.',
  phone: 'Escribe tu teléfono.',
  contact_email: 'Escribe tu correo de contacto.',
  company: 'Escribe el nombre de la empresa.',
  role: 'Escribe el cargo que tuviste.',
  institution: 'Escribe el nombre de la institución.',
  degree: 'Escribe la carrera o el programa de estudios.',
  start_date: 'Escribe la fecha de inicio. Por ejemplo, marzo de 2025.',
};

export function missingProfileSaveFields({ firstName, lastName, phone, contactEmail, work = [], academic = [] }) {
  const requiredFields = [
    { path: ['profile', 'first_name'], value: firstName },
    { path: ['profile', 'last_name'], value: lastName },
    { path: ['profile', 'phone'], value: phone },
    { path: ['profile', 'contact_email'], value: contactEmail },
    ...work.flatMap((experience, index) => ['company', 'role', 'start_date'].map((field) => ({
      path: ['work_experience', index, field], value: experience[field],
    }))),
    ...academic.flatMap((study, index) => ['institution', 'degree', 'start_date'].map((field) => ({
      path: ['academic_background', index, field], value: study[field],
    }))),
  ];

  return profileSaveIssues(requiredFields
    .filter(({ value }) => !String(value ?? '').trim())
    .map(({ path }) => ({ path, code: 'too_small', minimum: 1 })));
}

export function profileSaveIssues(details) {
  if (!Array.isArray(details)) return [];
  return details.flatMap((issue) => {
    if (!Array.isArray(issue?.path) || issue.code === 'unrecognized_keys') return [];
    const [section, item, field] = issue.path;
    const trajectory = section === 'work_experience' || section === 'academic_background';
    const key = trajectory ? field : item;
    const label = fieldNames[key];
    if (!label) return [];
    const tab = trajectory ? 'trajectory'
      : ['technical_skills', 'soft_skills', 'certifications'].includes(key) ? 'skills' : 'personal';
    const entry = section === 'work_experience' ? 'Experiencia' : 'Estudio';
    const prefix = trajectory && Number.isInteger(item) ? `${entry} ${item + 1}. ` : '';
    let message = `Revisa el dato en «${label}».`;
    if (issue.code === 'too_big' && issue.type === 'string') {
      message = `Acorta «${label}» a ${issue.maximum} caracteres como máximo.`;
    } else if (issue.code === 'too_small' && issue.minimum === 1) {
      message = requiredMessages[key] || `Completa «${label}».`;
    } else if (key === 'contact_email') {
      message = 'Revisa que tu correo de contacto esté bien escrito.';
    } else if (key === 'start_date' || key === 'end_date') {
      message = `Revisa la ${label.toLowerCase()}. Puedes escribir, por ejemplo, marzo de 2025.`;
    }
    return [{ tab, text: `${prefix}${message}` }];
  });
}
