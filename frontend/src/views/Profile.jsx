import { useState, useEffect } from 'react';
import { supabase } from '../utils/supabaseClient';
import { loadUserSnapshot } from '../utils/userDataApi';
import { apiRequest } from '../utils/api';
import { completeImportedExperience, mergeImportedPersonal } from '../utils/cvImport';
import { AlertCircle, CheckCircle2, Sparkles, Upload, Loader2, ClipboardList } from 'lucide-react';
import ProgressIndicator from '../components/common/ProgressIndicator';
import LoadingOverlay from '../components/common/LoadingOverlay';

// Wizard Steps Components
import PersonalInfoForm from '../components/profile/PersonalInfoForm';
import ExperienceSection from '../components/profile/ExperienceSection';
import EducationSection from '../components/profile/EducationSection';
import SkillsSection from '../components/profile/SkillsSection';
import ProfileSummary from '../components/profile/ProfileSummary';

export default function Profile({ navigateTo }) {
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState(null);

  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // File Import States
  const [importing, setImporting] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);

  // Import por texto pegado (HU05 — LinkedIn/texto)
  const [showPaste, setShowPaste] = useState(false);
  const [linkedinText, setLinkedinText] = useState('');
  const [importingText, setImportingText] = useState(false);

  // Form Data States
  const [personalInfo, setPersonalInfo] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    location: '',
    career: '',
    target_role: '',
    target_job_description: '',
    bio: ''
  });

  const [experienceList, setExperienceList] = useState([]);
  const [educationList, setEducationList] = useState([]);
  const [techSkills, setTechSkills] = useState([]);
  const [softSkills, setSoftSkills] = useState([]);

  const steps = [
    { title: 'Información personal', subtitle: 'Completa tus datos básicos' },
    { title: 'Experiencia laboral', subtitle: 'Describe tu experiencia' },
    { title: 'Educación', subtitle: 'Agrega tu formación' },
    { title: 'Habilidades', subtitle: 'Selecciona tus habilidades' },
    { title: 'Resumen', subtitle: 'Revisa y guarda tu perfil' }
  ];

  useEffect(() => {
    const fetchProfile = async () => {
      setLoading(true);
      setErrorMsg('');

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const uid = session.user.id;
      setUserId(uid);

      try {
        // GET /api/profile/{userId}
        const token = session?.access_token;
        const headers = {};
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }
        const response = await fetch(`http://localhost:5000/api/profile/${uid}`, { headers });
        const data = await response.json();

        if (response.ok && data.profile) {
          const p = data.profile;
          setPersonalInfo({
            first_name: p.first_name || '',
            last_name: p.last_name || '',
            email: p.email || session.user.email || '',
            phone: p.phone || '',
            location: p.location || '',
            career: p.career || '',
            target_role: p.target_role || '',
            target_job_description: p.target_job_description || '',
            bio: p.bio || ''
          });
          setTechSkills(p.technical_skills || []);
          setSoftSkills(p.soft_skills || []);
        } else {
          setPersonalInfo(prev => ({
            ...prev,
            email: session.user.email || ''
          }));
        }

        // Cargar Educación
        const snapshot = await loadUserSnapshot(uid);
        setEducationList(snapshot.academic || []);
        setExperienceList(snapshot.work || []);

      } catch (err) {
        console.error('Error cargando perfil:', err);
        setErrorMsg('Error al conectar con la base de datos para cargar tu perfil.');
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, []);

  const handlePersonalInfoChange = (field, value) => {
    setPersonalInfo(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // Experiencia Laboral Dinámica
  const handleAddExperience = () => {
    setExperienceList(prev => [
      ...prev,
      { company: '', role: '', start_date: '', end_date: '', description: '' }
    ]);
  };

  const handleRemoveExperience = (index) => {
    setExperienceList(prev => prev.filter((_, i) => i !== index));
  };

  const handleExperienceChange = (index, field, value) => {
    setExperienceList(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  // Educación Dinámica
  const handleAddEducation = () => {
    setEducationList(prev => [
      ...prev,
      { institution: '', degree: '', start_date: '', end_date: '' }
    ]);
  };

  const handleRemoveEducation = (index) => {
    setEducationList(prev => prev.filter((_, i) => i !== index));
  };

  const handleEducationChange = (index, field, value) => {
    setEducationList(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  // Habilidades Chips
  const handleAddTechSkill = (skill) => {
    if (skill && !techSkills.includes(skill)) {
      setTechSkills(prev => [...prev, skill]);
    }
  };

  const handleRemoveTechSkill = (skill) => {
    setTechSkills(prev => prev.filter(s => s !== skill));
  };

  const handleAddSoftSkill = (skill) => {
    if (skill && !softSkills.includes(skill)) {
      setSoftSkills(prev => [...prev, skill]);
    }
  };

  const handleRemoveSoftSkill = (skill) => {
    setSoftSkills(prev => prev.filter(s => s !== skill));
  };

  // Mapea la data extraída (mismo formato que import-cv / import-text) al wizard
  const applyExtracted = (ext) => {
    if (!ext) return;
    setPersonalInfo(prev => mergeImportedPersonal(prev, {
      first_name: ext.first_name || '', last_name: ext.last_name || '',
      phone: ext.phone, location: ext.location, career: ext.career,
      target_role: ext.target_position, target_job_description: ext.target_job_description,
      bio: ext.professional_summary,
    }));
    if (ext.technical_skills?.length) setTechSkills(ext.technical_skills);
    if (ext.soft_skills?.length) setSoftSkills(ext.soft_skills);
    if (ext.education?.length) setEducationList(ext.education);
    if (ext.experience?.length) setExperienceList(ext.experience.map(completeImportedExperience));
  };

  // HU05: importar desde texto pegado (perfil de LinkedIn u otro)
  const handleImportText = async () => {
    if (!linkedinText || linkedinText.trim().length < 50) {
      setErrorMsg('Pega el texto de tu perfil (al menos ~50 caracteres).');
      return;
    }
    setImportingText(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const data = await apiRequest('/profile/import-text', 'POST', { cvText: linkedinText });
      applyExtracted(data.data);
      setSuccessMsg('¡Perfil importado desde el texto! Revisa y ajusta los campos antes de guardar.');
      setLinkedinText('');
      setShowPaste(false);
    } catch (err) {
      setErrorMsg(err.message || 'No se pudo importar el texto.');
    } finally {
      setImportingText(false);
    }
  };

  // Importar CV con IA
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const extension = file.name.split('.').pop().toLowerCase();
    if (file.type !== 'application/pdf' && extension !== 'pdf') {
      setErrorMsg('Solo se permite importar archivos en formato PDF.');
      setSelectedFile(null);
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setErrorMsg('El tamaño del archivo supera el límite de 5 MB.');
      setSelectedFile(null);
      return;
    }

    setErrorMsg('');
    setSuccessMsg('');
    setSelectedFile(file);
  };

  const handleImportCV = async () => {
    if (!selectedFile) return;
    setImporting(true);
    setErrorMsg('');
    setSuccessMsg('');

    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const headers = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch('http://localhost:5000/api/profile/import-cv', {
        method: 'POST',
        headers,
        body: formData
      });
      const resData = await response.json();

      if (!response.ok) {
        throw new Error(resData.error || 'Error en la extracción del archivo PDF.');
      }

      applyExtracted(resData.data);

      setSuccessMsg('CV importado para revisión. Se conservaron el puesto y la vacante existentes. Revisa las responsabilidades completas y las fechas antes de guardar el perfil.');
      setSelectedFile(null);
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message || 'No se pudo leer el archivo o el servicio falló.');
    } finally {
      setImporting(false);
    }
  };

  // Guardar todo el perfil profesional
  const handleSaveProfile = async () => {
    setSaving(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const profilePayload = {
        first_name: personalInfo.first_name,
        last_name: personalInfo.last_name,
        email: personalInfo.email,
        phone: personalInfo.phone,
        location: personalInfo.location || '',
        career: personalInfo.career || personalInfo.target_role || '',
        target_role: personalInfo.target_role || personalInfo.career || '',
        target_job_description: personalInfo.target_job_description || '',
        bio: personalInfo.bio || '',
        technical_skills: techSkills,
        soft_skills: softSkills
      };

      await apiRequest(`/profile/${userId}/full`, 'PUT', {
        profile: profilePayload,
        academic_background: educationList.map(edu => ({ institution: edu.institution, degree: edu.degree, start_date: edu.start_date || '', end_date: edu.end_date || null, description: edu.description || null })),
        work_experience: experienceList.map(exp => ({ company: exp.company, role: exp.role, start_date: exp.start_date || '', end_date: exp.end_date || null, description: exp.description || '', achievements: exp.achievements || [] })),
      });

      setSuccessMsg('¡Perfil profesional completado y guardado exitosamente!');
      setTimeout(() => {
        navigateTo('/profile/view'); // Redirigir al dashboard de perfil profesional
      }, 1500);

    } catch (err) {
      console.error(err);
      setErrorMsg(err.message || 'Error guardando datos en Supabase.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 min-h-full bg-slate-50 flex flex-col justify-center items-center font-sans">
        <Loader2 className="h-8 w-8 text-indigo-600 animate-spin mb-2" />
        <p className="text-slate-500 text-sm">Cargando perfil profesional...</p>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-full overflow-y-auto bg-slate-50 px-4 py-6 font-sans sm:px-6 lg:px-8 lg:py-8">
      {importing && <LoadingOverlay message="Procesando currículum..." submessage="La IA está analizando tu CV para rellenar los datos automáticamente." />}

      <div className="mx-auto w-full max-w-[1600px] space-y-8">
        {/* Cabecera */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-black text-slate-900 leading-tight">1. Completar o importar perfil (HU05)</h2>
            <p className="text-slate-400 text-xs mt-1">
              Completa tu información profesional o importa tu CV para empezar a generar documentos personalizados.
            </p>
          </div>

          {/* Botón de importación rápida */}
          <div className="flex items-center gap-2">
            <label className="bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-bold px-4 py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-sm cursor-pointer transition-all">
              <Upload className="h-4 w-4 text-slate-500" />
              {selectedFile ? selectedFile.name.slice(0, 15) + '...' : 'Seleccionar PDF'}
              <input type="file" accept=".pdf" onChange={handleFileChange} className="hidden" />
            </label>
            {selectedFile && (
              <button
                onClick={handleImportCV}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-4 py-2.5 rounded-xl text-xs shadow-md shadow-indigo-600/10 cursor-pointer transition-all"
              >
                Importar CV con IA
              </button>
            )}
            <button
              onClick={() => setShowPaste(v => !v)}
              className="bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-bold px-4 py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-sm cursor-pointer transition-all"
            >
              <ClipboardList className="h-4 w-4 text-indigo-600" />
              Desde LinkedIn / texto
            </button>
          </div>
        </div>

        {/* HU05: importar pegando el texto del perfil (LinkedIn u otro) */}
        {showPaste && (
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-3">
            <div className="flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-indigo-600" />
              <h3 className="text-sm font-bold text-slate-900">Importar desde LinkedIn o texto</h3>
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Abre tu perfil de LinkedIn, selecciona todo el contenido (Ctrl+A), cópialo (Ctrl+C) y pégalo aquí. La IA extraerá tus datos y pre-rellenará el formulario.
            </p>
            <textarea
              value={linkedinText}
              onChange={e => setLinkedinText(e.target.value)}
              rows={6}
              placeholder="Pega aquí el texto de tu perfil de LinkedIn…"
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs focus:border-indigo-400 outline-none leading-relaxed"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setShowPaste(false); setLinkedinText(''); }}
                disabled={importingText}
                className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-700 rounded-xl cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleImportText}
                disabled={importingText}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-4 py-2 rounded-xl text-xs shadow-sm cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
              >
                {importingText ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Importar con IA
              </button>
            </div>
          </div>
        )}

        {/* Alertas */}
        {errorMsg && (
          <div className="bg-rose-50 border border-rose-100 text-rose-650 text-xs rounded-xl p-4 flex items-start gap-3">
            <AlertCircle className="h-4.5 w-4.5 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="bg-emerald-50 border border-emerald-100 text-emerald-650 text-xs rounded-xl p-4 flex items-start gap-3">
            <CheckCircle2 className="h-4.5 w-4.5 shrink-0 mt-0.5 text-emerald-600" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Wizard Progress Indicator */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
          <ProgressIndicator type="wizard" currentStep={currentStep} steps={steps} />
        </div>

        {/* Active Wizard Step Form */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
          {currentStep === 1 && (
            <PersonalInfoForm
              data={personalInfo}
              onChange={handlePersonalInfoChange}
              onNext={() => setCurrentStep(2)}
            />
          )}

          {currentStep === 2 && (
            <ExperienceSection
              list={experienceList}
              onAdd={handleAddExperience}
              onRemove={handleRemoveExperience}
              onChange={handleExperienceChange}
              onNext={() => setCurrentStep(3)}
              onPrev={() => setCurrentStep(1)}
            />
          )}

          {currentStep === 3 && (
            <EducationSection
              list={educationList}
              onAdd={handleAddEducation}
              onRemove={handleRemoveEducation}
              onChange={handleEducationChange}
              onNext={() => setCurrentStep(4)}
              onPrev={() => setCurrentStep(2)}
            />
          )}

          {currentStep === 4 && (
            <SkillsSection
              techSkills={techSkills}
              softSkills={softSkills}
              onAddTech={handleAddTechSkill}
              onRemoveTech={handleRemoveTechSkill}
              onAddSoft={handleAddSoftSkill}
              onRemoveSoft={handleRemoveSoftSkill}
              onNext={() => setCurrentStep(5)}
              onPrev={() => setCurrentStep(3)}
            />
          )}

          {currentStep === 5 && (
            <ProfileSummary
              data={personalInfo}
              experienceList={experienceList}
              educationList={educationList}
              techSkills={techSkills}
              softSkills={softSkills}
              onPrev={() => setCurrentStep(4)}
              onSave={handleSaveProfile}
              saving={saving}
            />
          )}
        </div>
      </div>
    </div>
  );
}
