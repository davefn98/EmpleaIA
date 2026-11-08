import { useState, useEffect, useRef } from 'react';
import { supabase } from '../utils/supabaseClient';
import { apiRequest } from '../utils/api';
import { loadUserSnapshot } from '../utils/userDataApi';
import { protectUnsavedChanges } from '../utils/unsavedChanges';
import { 
  User, 
  Briefcase, 
  GraduationCap, 
  Wrench, 
  Edit3, 
  CheckCircle, 
  Loader2, 
  AlertCircle,
  FileText
} from 'lucide-react';
import ProgressIndicator from '../components/common/ProgressIndicator';
import EmptyState from '../components/common/EmptyState';
import ProfileSectionTabs from '../components/common/ProfileSectionTabs';
import { useNotification } from '../components/common/notificationContext';

const personalFields = [
  { key: 'first_name', label: 'Nombres', required: true, maxLength: 300 },
  { key: 'last_name', label: 'Apellidos', required: true, maxLength: 300 },
  { key: 'contact_email', label: 'Correo de contacto', required: true, type: 'email', maxLength: 320 },
  { key: 'phone', label: 'Teléfono', required: true, type: 'tel' },
  { key: 'location', label: 'Ubicación' },
  { key: 'career', label: 'Carrera o profesión', maxLength: 300 },
  { key: 'linkedin', label: 'LinkedIn' },
];
const bioField = { key: 'bio', label: 'Perfil profesional', multiline: true, maxLength: 5000 };

function InlineProfileField({ field, value, editing, blocked, onEdit, onChange, onCancel, onSave }) {
  const { key, label, required, type, multiline, maxLength = 500 } = field;
  if (!editing) {
    return (
      <button
        type="button"
        aria-label={`Editar ${label.toLowerCase()}: ${value || 'Sin registrar'}`}
        disabled={blocked}
        onClick={() => onEdit(field, value)}
        className="group flex w-full items-start gap-2 rounded-md text-left text-sm text-slate-800 hover:text-indigo-700 focus-visible:outline-2 focus-visible:outline-indigo-500 disabled:cursor-default dark:text-slate-200 dark:hover:text-indigo-300"
      >
        <span className="min-w-0 whitespace-pre-wrap wrap-break-word">
          {value || (multiline ? 'Sin descripción profesional registrada.' : 'Sin registrar')}
        </span>
        <Edit3 aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500 group-hover:text-inherit dark:text-slate-400" />
      </button>
    );
  }

  const Input = multiline ? 'textarea' : 'input';
  return (
    <form className="space-y-2" onSubmit={onSave}>
      <Input
        aria-label={label}
        aria-invalid={Boolean(editing.error)}
        aria-describedby={editing.error ? `profile-inline-${key}-error` : undefined}
        type={type}
        rows={multiline ? 4 : undefined}
        value={editing.value}
        required={required}
        maxLength={maxLength}
        disabled={editing.saving}
        autoFocus
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:outline-2 focus:outline-indigo-500 aria-invalid:border-rose-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:aria-invalid:border-rose-500"
      />
      {editing.error && <p id={`profile-inline-${key}-error`} role="alert" className="text-xs text-rose-700 dark:text-rose-400">{editing.error}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={editing.saving || editing.value.trim() === value.trim()} className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">
          {editing.saving ? 'Guardando…' : 'Guardar'}
        </button>
        <button type="button" disabled={editing.saving} onClick={onCancel} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700 dark:border-slate-700 dark:text-slate-200">
          Cancelar
        </button>
      </div>
    </form>
  );
}

export default function ProfileView({ navigateTo, onProfileSaved }) {
  const { toast, showConfirm } = useNotification();
  const [profile, setProfile] = useState(null);
  const [academic, setAcademic] = useState([]);
  const [work, setWork] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [profileMissing, setProfileMissing] = useState(false);
  const [activeTab, setActiveTab] = useState('personal');
  const [reloadKey, setReloadKey] = useState(0);
  const [editing, setEditing] = useState(null);
  const confirmedExit = useRef(false);
  const dirty = Boolean(editing && editing.value.trim() !== editing.original.trim());
  const saving = Boolean(editing?.saving);

  useEffect(() => {
    if (!dirty) return;
    return protectUnsavedChanges(window, (path) => {
      if (confirmedExit.current) return true;
      if (saving) return false;
      showConfirm({
        title: 'Tu perfil tiene cambios sin guardar',
        message: 'Puedes seguir editando o salir sin guardar estos cambios.',
        confirmLabel: 'Salir sin guardar',
        cancelLabel: 'Seguir aquí',
        variant: 'warning',
        onConfirm: () => {
          confirmedExit.current = true;
          try {
            navigateTo(path);
            setEditing(null);
          } finally {
            confirmedExit.current = false;
          }
        },
      });
      return false;
    });
  }, [dirty, navigateTo, saving, showConfirm]);

  useEffect(() => {
    const fetchProfileData = async () => {
      setLoading(true);
      setErrorMsg('');
      setProfileMissing(false);

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setLoading(false);
        return;
      }

      const uid = session.user.id;

      try {
        // El snapshot trae perfil, educación y experiencia en una sola llamada.
        const snapshot = await loadUserSnapshot(uid);
        if (snapshot.profile) {
          setProfile({
            ...snapshot.profile,
            location: snapshot.profile.location || ''
          });
        } else {
          // Carga exitosa pero el usuario aún no tiene fila de perfil:
          // NO es un error de recuperación.
          setProfileMissing(true);
        }
        setAcademic(snapshot.academic || []);
        setWork(snapshot.work || []);

      } catch (err) {
        console.error('Error fetching profile view:', err);
        // Con sesión expirada api.js ya cerró sesión y App redirige al login;
        // no hay que pisar ese flujo con un mensaje de error de datos.
        if (err.code !== 'SESSION_EXPIRED') {
          setErrorMsg('Error al recuperar los datos del perfil.');
        }
      } finally {
        setLoading(false);
      }
    };

    fetchProfileData();
  }, [reloadKey]);

  const handleEditRedirect = () => {
    navigateTo('/profile/edit');
  };

  const saveInlineField = async (event) => {
    event.preventDefault();
    if (!dirty || saving) return;
    const { field } = editing;
    const value = editing.value.trim();
    if (field.required && !value) {
      setEditing({ ...editing, error: 'Completa este campo para guardar.' });
      return;
    }
    setEditing({ ...editing, saving: true, error: '' });
    try {
      const { profile: savedProfile } = await apiRequest(`/profile/${profile.id}`, 'PUT', { [field.key]: value });
      if (!savedProfile) throw new Error('Faltan los datos guardados.');
      setProfile(savedProfile);
      onProfileSaved(savedProfile);
      setEditing(null);
      toast.success('Perfil guardado.');
    } catch {
      setEditing({ ...editing, saving: false, error: 'No se pudo guardar este cambio. Intenta de nuevo.' });
    }
  };

  if (loading) {
    return (
      <div className="flex-1 min-h-full bg-slate-50 flex flex-col justify-center items-center font-sans">
        <Loader2 className="h-8 w-8 text-indigo-600 animate-spin mb-2" />
        <p className="text-slate-500 text-sm">Cargando perfil curricular...</p>
      </div>
    );
  }

  // Error de carga (red, servidor): mensaje + reintento, sin confundirlo con perfil vacío
  if (errorMsg) {
    return (
      <div className="flex-1 min-h-full bg-slate-50 flex flex-col justify-center items-center font-sans px-4">
        <div className="bg-rose-50 border border-rose-100 text-rose-650 text-xs rounded-xl p-4 flex items-start gap-3 mb-4 max-w-md">
          <AlertCircle className="h-4.5 w-4.5 shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
        <button
          onClick={() => setReloadKey(k => k + 1)}
          className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-5 py-2.5 rounded-xl cursor-pointer"
        >
          Reintentar
        </button>
      </div>
    );
  }

  // Carga exitosa pero sin perfil creado todavía
  if (profileMissing) {
    return (
      <div className="flex-1 min-h-full bg-slate-50 flex flex-col justify-center items-center font-sans px-4">
        <EmptyState
          icon={User}
          title="Aún no has creado tu perfil"
          description="Completa tu información profesional para empezar a generar CV, cartas y entrevistas personalizadas."
          actionText="Completar Perfil"
          onAction={() => navigateTo('/profile/edit')}
        />
      </div>
    );
  }

  // Calculate completeness percentage (20% for each section completed)
  const isPersonalInfoComplete = !!(profile?.first_name && profile?.last_name && profile?.phone && profile?.location);
  const isSummaryComplete = !!(profile?.bio && profile?.bio.trim().length > 10);
  const isExperienceComplete = work.length > 0;
  const isEducationComplete = academic.length > 0;
  const isSkillsComplete = !!((profile?.technical_skills && profile.technical_skills.length > 0) || (profile?.soft_skills && profile.soft_skills.length > 0));

  let completeness = 0;
  if (isPersonalInfoComplete) completeness += 20;
  if (isSummaryComplete) completeness += 20;
  if (isExperienceComplete) completeness += 20;
  if (isEducationComplete) completeness += 20;
  if (isSkillsComplete) completeness += 20;

  const checklistItems = [
    { label: 'Información personal', completed: isPersonalInfoComplete },
    { label: 'Perfil profesional', completed: isSummaryComplete },
    { label: 'Experiencia laboral', completed: isExperienceComplete },
    { label: 'Educación', completed: isEducationComplete },
    { label: 'Habilidades', completed: isSkillsComplete },
  ];

  const renderField = (field) => {
    let value = profile?.[field.key];
    if (field.key === 'contact_email') value = profile?.contact_email ?? profile?.email;
    if (field.key === 'linkedin') value = profile?.linkedin ?? profile?.linkedin_url;
    return (
      <InlineProfileField
        field={field}
        value={value || ''}
        editing={editing?.field.key === field.key ? editing : null}
        blocked={Boolean(editing)}
        onEdit={(nextField, currentValue) => setEditing({ field: nextField, value: currentValue, original: currentValue })}
        onChange={(nextValue) => setEditing({ ...editing, value: nextValue, error: '' })}
        onCancel={() => setEditing(null)}
        onSave={saveInlineField}
      />
    );
  };
  return (
    <div className="flex-1 min-h-full overflow-y-auto bg-slate-50 px-4 py-6 font-sans sm:px-6 lg:px-8 lg:py-8">
      <div className="mx-auto w-full max-w-[1600px]">

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/60 rounded-2xl p-4 shadow-sm mb-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <ProfileSectionTabs activeSection={activeTab} onChange={setActiveTab} />

        <button
          onClick={handleEditRedirect}
          className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 px-5 rounded-xl cursor-pointer shadow-sm shadow-indigo-600/10 text-xs flex items-center justify-center gap-1.5 transition-all shrink-0"
        >
          <Edit3 className="h-3.5 w-3.5" /> Editar perfil
        </button>
      </div>

      {/* Layout Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left main content */}
        <div className="lg:col-span-8 space-y-6">
          
          {/* Active Tab rendering */}
          {activeTab === 'personal' && (
            <div className="space-y-6">
              {/* Personal Info Card */}
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4 text-left">
                <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <User className="h-4.5 w-4.5 text-indigo-600" />
                    <h3 className="text-sm font-bold text-slate-900">Información personal</h3>
                  </div>
                </div>

                <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
                  {personalFields.map((field) => (
                    <div key={field.key} className="min-w-0">
                      <dt className="text-xs text-slate-600 dark:text-slate-400">{field.label}</dt>
                      <dd className="mt-1 font-medium">{renderField(field)}</dd>
                    </div>
                  ))}
                </dl>
              </div>

              {/* Profile Bio / Summary Card */}
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-3 text-left">
                <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4.5 w-4.5 text-indigo-600" />
                    <h3 className="text-sm font-bold text-slate-900">Perfil profesional</h3>
                  </div>
                </div>
                {renderField(bioField)}
              </div>

            </div>
          )}

          {activeTab === 'trajectory' && (
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4 text-left">
              <h3 className="text-sm font-bold text-slate-900 pb-2 border-b border-slate-100 flex items-center gap-2">
                <Briefcase className="h-4.5 w-4.5 text-indigo-650" />
                Historial de Experiencia Laboral
              </h3>
              
              <div className="space-y-4">
                {work.map((exp, idx) => (
                  <div key={idx} className="border-b border-slate-100 pb-4 last:border-0 last:pb-0 space-y-1 text-xs">
                    <div className="flex justify-between items-baseline font-bold text-slate-900">
                      <span className="text-[12px]">{exp.role}</span>
                      <span className="text-[10px] text-slate-450 font-semibold">{exp.start_date} - {exp.end_date || 'Actual'}</span>
                    </div>
                    <div className="text-[10.5px] font-bold text-indigo-600">{exp.company}</div>
                    <p className="text-slate-600 leading-relaxed whitespace-pre-wrap mt-1.5">{exp.description}</p>
                  </div>
                ))}
                {work.length === 0 && (
                  <EmptyState
                    icon={Briefcase}
                    title="Aún no hay experiencia registrada"
                    description="Agrega tus puestos anteriores o proyectos independientes."
                    actionText="Editar perfil"
                    onAction={handleEditRedirect}
                  />
                )}
              </div>
            </div>
          )}

          {activeTab === 'trajectory' && (
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4 text-left">
              <h3 className="text-sm font-bold text-slate-900 pb-2 border-b border-slate-100 flex items-center gap-2">
                <GraduationCap className="h-4.5 w-4.5 text-indigo-650" />
                Historial Académico
              </h3>
              
              <div className="space-y-4">
                {academic.map((edu, idx) => (
                  <div key={idx} className="border-b border-slate-100 pb-4 last:border-0 last:pb-0 space-y-0.5 text-xs">
                    <div className="flex justify-between items-baseline font-bold text-slate-900">
                      <span className="text-[12px]">{edu.degree}</span>
                      <span className="text-[10px] text-slate-450 font-semibold">{edu.start_date} - {edu.end_date || 'En curso'}</span>
                    </div>
                    <div className="text-[10.5px] font-bold text-slate-700">{edu.institution}</div>
                  </div>
                ))}
                {academic.length === 0 && (
                  <EmptyState
                    icon={GraduationCap}
                    title="Aún no hay educación registrada"
                    description="Registra tu formación escolar, técnica, universitaria o cursos."
                    actionText="Editar perfil"
                    onAction={handleEditRedirect}
                  />
                )}
              </div>
            </div>
          )}

          {activeTab === 'skills' && (
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6 text-left">
              <h3 className="text-sm font-bold text-slate-900 pb-2 border-b border-slate-100 flex items-center gap-2">
                <Wrench className="h-4.5 w-4.5 text-indigo-650" />
                Competencias y Habilidades
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wide">Habilidades Técnicas</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {profile?.technical_skills?.map((s) => (
                      <span key={s} className="bg-indigo-50 border border-indigo-100 text-indigo-600 px-2.5 py-1 rounded-lg text-xs font-bold">
                        {s}
                      </span>
                    ))}
                    {!profile?.technical_skills?.length && (
                      <p className="text-xs text-slate-400 italic">Ninguna cargada.</p>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wide">Habilidades Blandas</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {profile?.soft_skills?.map((s) => (
                      <span key={s} className="bg-slate-100 border border-slate-200/60 text-slate-650 px-2.5 py-1 rounded-lg text-xs font-bold">
                        {s}
                      </span>
                    ))}
                    {!profile?.soft_skills?.length && (
                      <p className="text-xs text-slate-400 italic">Ninguna cargada.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Right side status panel */}
        <div className="lg:col-span-4 space-y-6">
          
          {/* Completeness indicator card */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-5 text-left">
            <h3 className="text-xs font-bold text-slate-850 uppercase tracking-wider flex items-center gap-1.5">
              <CheckCircle className="h-4.5 w-4.5 text-indigo-600" />
              Resumen del perfil
            </h3>

            <div className="flex items-center gap-4.5">
              {/* Progress Circle SVG */}
              <ProgressIndicator type="circle" percentage={completeness} />
              
              <div className="space-y-1">
                <h4 className="text-sm font-extrabold text-slate-900 leading-tight">Perfil completo</h4>
                <p className="text-[11px] text-slate-400 leading-normal font-semibold">
                  {completeness >= 80 ? '¡Excelente trabajo! Tu perfil está listo para postular.' : '¡Buen trabajo! Completa el perfil al 100%.'}
                </p>
              </div>
            </div>

            {/* Checklist of sections */}
            <div className="border-t border-slate-100 pt-4 space-y-3 text-xs">
              <h4 className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Secciones completadas</h4>
              <div className="space-y-2.5">
                {checklistItems.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between">
                    <span className="font-semibold text-slate-700">{item.label}</span>
                    {item.completed ? (
                      <span className="h-4.5 w-4.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-150 flex items-center justify-center font-bold text-[10px]">
                        ✓
                      </span>
                    ) : (
                      <span className="h-4.5 w-4.5 rounded-full border border-slate-200 bg-white" />
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

      </div>
      </div>
    </div>
  );
}
