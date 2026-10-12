import { z } from 'zod';

const optionalText = z.string().trim().max(500).optional().nullable();
const requiredText = z.string().trim().min(1).max(300);
const targetJobDescription = z.string().refine((value) => !value.includes('\0'), {
  message: 'La descripción del puesto contiene un carácter no válido.',
}).optional().nullable();

export function parseFlexibleDate(val) {
  if (val === null || val === undefined) return null;
  const str = String(val).trim();
  if (str === '') return '';

  const trimmed = str.toLowerCase();
  
  // Si representa el presente o actual
  if (
    trimmed === 'presente' || 
    trimmed === 'actual' || 
    trimmed === 'en curso' || 
    trimmed === 'actualmente' || 
    trimmed === 'trabajo actual' ||
    trimmed === 'al presente' ||
    trimmed === 'hoy' ||
    trimmed === 'now'
  ) {
    return null;
  }

  // 1. Validar si ya es YYYY-MM-DD
  const isoPattern = /^(\d{4})-(\d{2})-(\d{2})(T.*)?$/;
  const isoMatch = trimmed.match(isoPattern);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  }

  // 2. Formato YYYY-MM (e.g. 2021-05)
  const yearMonthPattern = /^(\d{4})-(\d{2})$/;
  const ymMatch = trimmed.match(yearMonthPattern);
  if (ymMatch) {
    return `${ymMatch[1]}-${ymMatch[2]}-01`;
  }

  // 3. Formato MM/YYYY o MM-YYYY (e.g. 05/2021 o 5-2021)
  const monthYearPattern = /^(\d{1,2})[\/\-](\d{4})$/;
  const myMatch = trimmed.match(monthYearPattern);
  if (myMatch) {
    const month = myMatch[1].padStart(2, '0');
    const year = myMatch[2];
    return `${year}-${month}-01`;
  }

  // 4. Formato YYYY (e.g. 2021)
  const yearPattern = /^(\d{4})$/;
  const yearMatch = trimmed.match(yearPattern);
  if (yearMatch) {
    return `${yearMatch[1]}-01-01`;
  }

  // 5. Formato texto (e.g. "Mayo 2021", "Mayo de 2021", "May 2021", "Mayo, 2021")
  const months = {
    jan: '01', ene: '01', feb: '02', mar: '03', apr: '04', abr: '04',
    may: '05', jun: '06', jul: '07', aug: '08', ago: '08', sep: '09', set: '09',
    oct: '10', nov: '11', dec: '12', dic: '12'
  };

  const yearInTextMatch = trimmed.match(/\b(\d{4})\b/);
  if (yearInTextMatch) {
    const year = yearInTextMatch[1];
    for (const [monthName, monthVal] of Object.entries(months)) {
      if (trimmed.includes(monthName)) {
        return `${year}-${monthVal}-01`;
      }
    }
    return `${year}-01-01`;
  }

  try {
    const parsed = new Date(str);
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString().split('T')[0];
    }
  } catch (e) {
    // ignorar
  }

  return val;
}

const dateText = z.preprocess(
  (val) => parseFlexibleDate(val),
  z.string().date().optional().nullable().or(z.literal(''))
);

export const profileUpdateSchema = z.object({
  first_name: requiredText.optional(), last_name: requiredText.optional(),
  email: z.string().trim().email().max(320).optional(), phone: optionalText,
  location: optionalText, career: requiredText.optional(), target_role: requiredText.optional(),
  target_job_description: targetJobDescription,
  bio: z.string().trim().max(5000).optional().nullable(),
  technical_skills: z.array(z.string().trim().min(1).max(100)).max(100).optional(),
  soft_skills: z.array(z.string().trim().min(1).max(100)).max(100).optional(),
}).strict();

const academicSchema = z.object({
  institution: requiredText, degree: requiredText, start_date: dateText, end_date: dateText,
  description: z.string().trim().max(5000).optional().nullable(),
}).strict();
const workSchema = z.object({
  company: requiredText, role: requiredText, start_date: dateText, end_date: dateText,
  description: z.string().trim().max(5000).default(''),
  achievements: z.array(z.string().trim().min(1).max(500)).max(100).optional(),
}).strict();

export const fullProfileUpdateSchema = z.object({
  profile: profileUpdateSchema,
  academic_background: z.array(academicSchema).max(100),
  work_experience: z.array(workSchema).max(100),
}).strict();

export function classifyProfileState(profile, academicBackground = [], workExperience = []) {
  if (!profile) {
    return 'inexistent';
  }

  const hasFirstName = typeof profile.first_name === 'string' && profile.first_name.trim().length > 0;
  const hasLastName = typeof profile.last_name === 'string' && profile.last_name.trim().length > 0;
  const hasEmail = typeof profile.email === 'string' && profile.email.trim().length > 0;
  const hasCareer = typeof profile.career === 'string' && profile.career.trim().length > 0;
  const hasTargetRole = typeof profile.target_role === 'string' && profile.target_role.trim().length > 0;

  // Si no tiene el nombre o el correo, o le falta carrera/rol objetivo, se considera básico
  if (!hasFirstName || !hasLastName || !hasEmail || !hasCareer || !hasTargetRole) {
    return 'basic';
  }

  const hasBio = typeof profile.bio === 'string' && profile.bio.trim().length > 0;
  const hasTechSkills = Array.isArray(profile.technical_skills) && profile.technical_skills.length > 0;
  const hasSoftSkills = Array.isArray(profile.soft_skills) && profile.soft_skills.length > 0;

  // Si tiene los datos mínimos de carrera y rol, pero no tiene bio o habilidades, se considera incompleto
  if (!hasBio || !hasTechSkills || !hasSoftSkills) {
    return 'incomplete';
  }

  return 'complete';
}
