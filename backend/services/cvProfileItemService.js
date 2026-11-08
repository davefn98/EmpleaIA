import { createHash } from 'node:crypto';

const normalized = (value) => value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('es');
const studyIdentity = (study) => JSON.stringify([normalized(study.institution), normalized(study.degree), study.start_date]);
const studyFields = ['institution', 'degree', 'start_date', 'end_date'];
const sameStudy = (a, b) => studyFields.every((field) => a[field] === b[field]);

// Una segunda solicitud para el mismo estudio nuevo compite por la misma clave primaria.
function studyId(userId, study) {
  const hash = createHash('sha256').update(userId + studyIdentity(study)).digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-8${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

export async function saveCvStudyToProfile(db, userId, { id, study, confirmed }) {
  const fields = 'id, institution, degree, start_date, end_date';
  const { data: records, error } = await db.from('academic_background').select(fields).eq('profile_id', userId);
  if (error) throw error;
  const linked = records.find((record) => record.id === id);
  const matches = records.filter((record) => studyIdentity(record) === studyIdentity(study));
  const current = linked ?? (matches.length === 1 ? matches[0] : null);
  if (matches.some((record) => record.id !== current?.id)) return { status: 'duplicate' };
  if (current && sameStudy(current, study)) return { status: 'unchanged', id: current.id };

  if (!current) {
    if (confirmed) return { status: 'stale' };
    const newId = studyId(userId, study);
    const { error: insertError } = await db.from('academic_background').insert({ id: newId, profile_id: userId, ...study });
    if (insertError?.code === '23505') return { status: 'stale' };
    if (insertError) throw insertError;
    return { status: 'saved', id: newId };
  }

  if (confirmed?.id !== current.id || !sameStudy(confirmed.study, current)) {
    return { status: 'review', current };
  }
  let update = db.from('academic_background').update(study).eq('id', current.id).eq('profile_id', userId);
  for (const field of studyFields) {
    update = current[field] === null ? update.is(field, null) : update.eq(field, current[field]);
  }
  const { data: updated, error: updateError } = await update.select('id').maybeSingle();
  if (updateError) throw updateError;
  return updated ? { status: 'saved', id: updated.id } : { status: 'stale' };
}

export async function saveCvSkillToProfile(db, userId, { type, name }) {
  const field = type === 'technical' ? 'technical_skills' : 'soft_skills';
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: profile, error } = await db.from('profiles').select(`${field}, updated_at`).eq('id', userId).single();
    if (error) throw error;
    const skills = profile[field] || [];
    if (skills.some((skill) => normalized(skill) === normalized(name))) return { status: 'unchanged' };
    const updatedAt = new Date(Math.max(Date.now(), Date.parse(profile.updated_at) + 1)).toISOString();
    const { data: updated, error: updateError } = await db.from('profiles')
      .update({ [field]: [...skills, name], updated_at: updatedAt })
      .eq('id', userId).eq('updated_at', profile.updated_at).select('id').maybeSingle();
    if (updateError) throw updateError;
    if (updated) return { status: 'saved' };
  }
  return { status: 'stale' };
}
