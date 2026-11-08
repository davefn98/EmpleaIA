import { useId, useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { normalizeCvData } from './CVPreview';
import { hasCvEducation, hasCvExperience, hasCvText } from '../../utils/cvContent';

const sections = [
  ['contact', 'Datos de contacto'], ['summary', 'Sobre mí'], ['experience', 'Experiencia'],
  ['education', 'Educación'], ['skills', 'Habilidades'],
];
const contactFields = [
  ['first_name', 'Nombres'], ['last_name', 'Apellidos'], ['email', 'Correo de contacto'],
  ['phone', 'Teléfono'], ['location', 'Ubicación'], ['linkedin', 'LinkedIn'], ['portfolio', 'Portafolio'],
];
const experienceFields = [['role', 'Puesto'], ['company', 'Empresa']];
const educationFields = [['degree', 'Título o grado'], ['institution', 'Institución']];
const dateFields = [['start_date', 'Fecha de inicio'], ['end_date', 'Fecha de fin (vacía si continúa)']];
const inputClass = 'mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900';
const actionClass = 'rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800';

function Visibility({ label, shown, unavailable, onChange }) {
  const action = shown ? 'Ocultar' : 'Mostrar';
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
      <span className="text-slate-600 dark:text-slate-300">
        {unavailable || (shown ? 'Visible en el CV' : 'Oculto en el CV')}
      </span>
      {!unavailable && (
        <button type="button" className={actionClass} onClick={() => onChange(!shown)}>
          {action} {label}
        </button>
      )}
    </div>
  );
}

function RecordsEditor({ records, kind, sectionShown, onChange, onSaveToProfile, savingToProfile }) {
  const isExperience = kind === 'experience';
  const fields = isExperience ? experienceFields : educationFields;
  const name = isExperience ? 'puesto' : 'estudio';
  const [newRecordId, setNewRecordId] = useState(null);
  const addRecordButton = useRef(null);
  const update = (index, patch) => onChange(records.map((record, current) => current === index ? { ...record, ...patch } : record));

  return (
    <div className="space-y-3">
      {records.map((record, index) => {
        const hasContent = isExperience ? hasCvExperience(record) : hasCvEducation(record);
        const title = record[fields[0][0]] || record[fields[1][0]] || (isExperience ? 'Nuevo puesto' : 'Nuevo estudio');
        const emptyMessage = isExperience ? 'Agrega el puesto, la empresa o una responsabilidad para verlo en el CV.' : 'Agrega el título o la institución para ver este estudio en el CV.';
        const storedBullets = record.bullets ?? record.achievements ?? [];
        const bullets = Array.isArray(storedBullets) ? storedBullets : [storedBullets];
        const bulletText = bullets.map((item) => typeof item === 'string' ? item : item?.name || item?.label || item?.skill || item?.text || '');
        return (
          <div key={record.id || record.source_id || index} className="relative rounded-lg border border-slate-200 dark:border-slate-700">
            <details open={record.id === newRecordId || undefined} className="p-3">
              <summary className="cursor-pointer break-words pr-9 text-sm font-semibold">
                {title}
                {(!hasContent || (sectionShown && record.hidden_from_cv)) && (
                  <span className="ml-2 text-xs font-normal text-slate-500 dark:text-slate-400">
                    {hasContent ? 'Oculto' : 'Sin datos'}
                  </span>
                )}
              </summary>
              <div className="mt-3 space-y-3">
                <Visibility label={`este ${name}`} shown={!record.hidden_from_cv}
                  unavailable={!hasContent ? emptyMessage : !sectionShown ? 'La sección está oculta.' : undefined}
                  onChange={(visible) => update(index, { hidden_from_cv: !visible })} />
                {fields.map(([field, label]) => (
                  <label key={field} className="block text-xs font-medium">
                    {label}
                    <input className={inputClass} value={record[field] ?? ''} onChange={(event) => update(index, { [field]: event.target.value })} />
                  </label>
                ))}
                {dateFields.map(([field, label]) => {
                  const savedDate = record[field] ?? '';
                  const isCalendarDate = /^\d{4}-\d{2}-\d{2}$/.test(savedDate)
                    && new Date(savedDate).toJSON()?.slice(0, 10) === savedDate;
                  return (
                    <div key={field}>
                      <label className="block text-xs font-medium">
                        {label}
                        <input type="date" className={`${inputClass} dark:[color-scheme:dark]`} value={isCalendarDate ? savedDate : ''}
                          onChange={(event) => update(index, { [field]: event.target.value, period: '' })} />
                      </label>
                      {savedDate && !isCalendarDate && (
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                          <span>Fecha guardada: {savedDate}</span>
                          <button type="button" className="underline" onClick={() => update(index, { [field]: '', period: '' })}>Quitar fecha guardada</button>
                        </div>
                      )}
                    </div>
                  );
                })}
                {record.period && !record.start_date && <p className="text-xs text-slate-500 dark:text-slate-400">Periodo guardado: {record.period}</p>}
                {onSaveToProfile && (
                  <button type="button" className={`${actionClass} disabled:opacity-50`} disabled={savingToProfile || !hasContent}
                    onClick={() => onSaveToProfile({ kind: 'study', record })}>
                    Guardar también en Mi perfil
                  </button>
                )}
                {isExperience && (
                  <>
                    <label className="block text-xs font-medium">
                      Descripción del puesto
                      <textarea className={inputClass} rows={2} value={record.impact_description ?? record.description ?? ''} onChange={(event) => update(index, { impact_description: '', description: event.target.value })} />
                    </label>
                    <label className="block text-xs font-medium">
                      Responsabilidades (una por línea)
                      <textarea className={inputClass} rows={5} value={bulletText.join('\n')}
                        onChange={(event) => update(index, { bullets: event.target.value.split('\n') })} />
                    </label>
                    <button type="button" className={actionClass} disabled={bulletText.length < 2}
                      onClick={() => update(index, { bullets: [...bulletText].reverse() })}>Invertir el orden de las viñetas</button>
                  </>
                )}
              </div>
            </details>
            <button type="button" title={`Eliminar ${name}`} aria-label={`Eliminar ${name}: ${title}`}
              className="absolute right-1.5 top-1.5 grid size-8 cursor-pointer place-items-center rounded-md text-rose-700 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-950"
              onClick={() => {
                onChange(records.filter((_, current) => current !== index));
                addRecordButton.current?.focus();
              }}>
              <Trash2 aria-hidden="true" className="size-4" />
            </button>
          </div>
        );
      })}
      <button ref={addRecordButton} type="button" className={actionClass} onClick={() => {
        const id = crypto.randomUUID();
        setNewRecordId(id);
        onChange([...records, { id, hidden_from_cv: false }]);
      }}>Agregar {name}</button>
    </div>
  );
}

function SkillsEditor({ cv, onChange, onSaveToProfile, savingToProfile }) {
  const [newSkill, setNewSkill] = useState('');
  const [destination, setDestination] = useState('technical');
  const { skillCategories, softSkills } = cv;
  const destinations = skillCategories.map(({ key, label }) => [key, label]);
  if (!skillCategories.some(({ key }) => key === 'technical')) destinations.push(['technical', 'Habilidades técnicas']);
  destinations.push(['soft', 'Habilidades blandas']);
  const activeDestination = destinations.some(([key]) => key === destination) ? destination : 'technical';
  const addSkill = () => {
    const skill = newSkill.trim();
    if (!skill) return;
    if (activeDestination === 'soft') {
      if (!softSkills.includes(skill)) onChange({ soft_skills: [...softSkills, skill] });
    } else {
      const index = skillCategories.findIndex(({ key }) => key === activeDestination);
      const categories = index < 0
        ? [...skillCategories, { key: 'technical', label: 'Habilidades técnicas', skills: [skill] }]
        : skillCategories.map((category, current) => current === index && !category.skills.includes(skill)
          ? { ...category, skills: [...category.skills, skill] } : category);
      onChange({ technical_skills: categories });
    }
    setNewSkill('');
  };
  const groups = [
    ...skillCategories.map((category, index) => ({
      ...category,
      remove: (skill) => onChange({ technical_skills: skillCategories.map((group, current) => current === index
        ? { ...group, skills: group.skills.filter((item) => item !== skill) } : group) }),
    })),
    { key: 'soft', label: 'Habilidades blandas', skills: softSkills, remove: (skill) => onChange({ soft_skills: softSkills.filter((item) => item !== skill) }) },
  ];

  return (
    <div className="space-y-3">
      {groups.filter(({ skills }) => skills.length).map(({ key, label, skills, remove }) => (
        <div key={key}>
          <p className="mb-1 text-xs font-semibold">{label}</p>
          <div className="flex flex-wrap gap-1.5">
            {[...new Set(skills)].map((skill) => (
              <div key={skill} className="flex flex-wrap items-center gap-x-2 rounded-lg border border-slate-300 px-2 py-1.5 text-xs dark:border-slate-600">
                <button type="button" aria-label={`Quitar ${skill} de ${label}`} className="font-semibold hover:text-rose-700" onClick={() => remove(skill)}>{skill} ×</button>
                <button type="button" disabled={savingToProfile} aria-label={`Guardar también en Mi perfil la habilidad ${skill}`}
                  className="font-semibold text-indigo-700 underline underline-offset-2 disabled:opacity-50 dark:text-indigo-300"
                  onClick={() => onSaveToProfile({ kind: 'skill', name: skill, type: key === 'soft' ? 'soft' : 'technical' })}>
                  Guardar también en Mi perfil
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}
      <label className="block text-xs font-medium">Categoría
        <select className={inputClass} value={activeDestination} onChange={(event) => setDestination(event.target.value)}>
          {destinations.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
      </label>
      <label className="block text-xs font-medium">Nueva habilidad
        <input className={inputClass} value={newSkill} onChange={(event) => setNewSkill(event.target.value)} onKeyDown={(event) => {
          if (event.key === 'Enter') { event.preventDefault(); addSkill(); }
        }} />
      </label>
      <button type="button" className={actionClass} disabled={!newSkill.trim()} onClick={addSkill}>Agregar habilidad</button>
    </div>
  );
}

export default function CvContentEditor({ document, visibleSections, onChange, onContactChange, onVisibilityChange, onSaveToProfile, savingToProfile }) {
  const [section, setSection] = useState('summary');
  const selectId = useId();
  const cv = normalizeCvData(document.personal_info, document);
  const work = (Array.isArray(document.work_experience ?? document.experience) ? (document.work_experience ?? document.experience) : []).filter(Boolean);
  const education = (Array.isArray(document.academic_background ?? document.education) ? (document.academic_background ?? document.education) : []).filter(Boolean);
  const contactShown = visibleSections.personalInfo !== false;
  const experienceShown = visibleSections.experience !== false;
  const educationShown = visibleSections.education !== false;
  const visibility = (key, label, unavailable) => (
    <Visibility label={label} shown={visibleSections[key] !== false} unavailable={unavailable} onChange={(shown) => onVisibilityChange(key, shown)} />
  );
  const recordSectionNotice = (records, hasContent, shown, emptyMessage, hiddenMessage) => {
    const entries = records.filter(hasContent);
    if (!entries.length) return emptyMessage;
    if (shown && entries.every((record) => record.hidden_from_cv)) return hiddenMessage;
    return undefined;
  };

  return (
    <section id="cv-content-editor" aria-label="Editar contenido del CV" className="min-w-0 space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
      <div>
        <label htmlFor={selectId} className="text-xs font-semibold">Sección del CV</label>
        <select id={selectId} className={inputClass} value={section} onChange={(event) => setSection(event.target.value)}>
          {sections.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
      </div>
      {section === 'contact' && (
        <>
          {!contactShown && visibility('personalInfo', 'los datos de contacto',
            hasCvText(...contactFields.map(([field]) => document.personal_info[field])) ? undefined : 'Todavía no hay datos de contacto para mostrar.')}
          {contactFields.map(([field, label]) => (
            <div key={field} className="space-y-1">
              <label className="block text-xs font-medium">{label}
                <input className={inputClass} value={document.personal_info[field]} onChange={(event) => onContactChange(field, event.target.value)} />
              </label>
              {contactShown && !['first_name', 'last_name'].includes(field) && hasCvText(document.personal_info[field]) && visibility(field, label.toLowerCase())}
            </div>
          ))}
        </>
      )}
      {section === 'summary' && (
        <>
          <label className="block text-xs font-medium">Sobre mí
            <textarea className={inputClass} rows={7} value={cv.professionalSummary} onChange={(event) => onChange({ professional_summary: event.target.value })} />
          </label>
          {visibility('professionalSummary', 'el resumen', hasCvText(cv.professionalSummary) ? undefined : 'Escribe un resumen para verlo en el CV.')}
        </>
      )}
      {section === 'experience' && (
        <>
          {visibility('experience', 'la sección de experiencia', recordSectionNotice(
            work, hasCvExperience, experienceShown, 'Todavía no hay experiencia para mostrar.', 'Todos los puestos están ocultos.'
          ))}
          <RecordsEditor key="experience" records={work} kind="experience" sectionShown={experienceShown} onChange={(records) => onChange({ work_experience: records })} />
        </>
      )}
      {section === 'education' && (
        <>
          {visibility('education', 'la sección de educación', recordSectionNotice(
            education, hasCvEducation, educationShown, 'Todavía no hay estudios para mostrar.', 'Todos los estudios están ocultos.'
          ))}
          <RecordsEditor key="education" records={education} kind="education" sectionShown={educationShown}
            onChange={(records) => onChange({ academic_background: records })} onSaveToProfile={onSaveToProfile} savingToProfile={savingToProfile} />
        </>
      )}
      {section === 'skills' && (
        <>
          {visibility('skillsTech', 'las habilidades técnicas', cv.technicalSkills.length || cv.certifications.length ? undefined : 'Todavía no hay habilidades técnicas ni certificaciones para mostrar.')}
          {visibility('skillsSoft', 'las habilidades blandas', cv.softSkills.length ? undefined : 'Todavía no hay habilidades blandas para mostrar.')}
          <SkillsEditor cv={cv} onChange={onChange} onSaveToProfile={onSaveToProfile} savingToProfile={savingToProfile} />
        </>
      )}
      <p className="text-xs text-slate-500 dark:text-slate-400">Los cambios se aplican a este CV. Puedes guardar estudios y habilidades también en Mi perfil.</p>
    </section>
  );
}
