import { useState, useEffect } from 'react';
import { supabase } from '../utils/supabaseClient';
import { loadUserSnapshot } from '../utils/userDataApi';
import { apiRequest } from '../utils/api';
import { useNotification } from '../components/common/notificationContext';
import { mapError } from '../utils/errorMapper';
import { 
  FileText, 
  Mail, 
  ChevronRight, 
  ChevronLeft, 
  Plus, 
  Trash2, 
  Sparkles, 
  Download, 
  CheckCircle, 
  Loader2, 
  AlertCircle,
  Copy,
  Check,
  Sliders,
  User,
  Settings,
  Briefcase,
  GraduationCap,
  Wrench
} from 'lucide-react';
import CVPreview from '../components/cv/CVPreview';
import ImportCvModal from '../components/documents/ImportCvModal';
import { completeImportedExperience, mergeImportedPersonal } from '../utils/cvImport';
import TemplateSelector from '../components/cv/TemplateSelector';
import ColorSelector from '../components/cv/ColorSelector';
import FontSelector from '../components/cv/FontSelector';
import SectionToggle from '../components/cv/SectionToggle';

const ensureItemIds = (items, prefix) => (items || []).map((item, index) => ({
  ...item,
  id: item.id || `${prefix}-temp-${index}-${Date.now()}-${Math.random()}`
}));

const normalizeSkillList = (skills) => {
  if (Array.isArray(skills)) return skills.filter((skill) => typeof skill === 'string');
  if (!skills || typeof skills !== 'object') return [];
  return Object.values(skills)
    .filter(Array.isArray)
    .flat()
    .filter((skill) => typeof skill === 'string');
};

const experienceIdentity = (experience) => JSON.stringify([
  experience.company || '',
  experience.role || '',
  experience.start_date || '',
  experience.end_date || '',
  experience.description || ''
]);

export default function Documents({ initialDocType = 'select', navigateTo }) {
  const { toast, showConfirm } = useNotification();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  // Error al CARGAR los datos del wizard (red/servidor), distinto de "perfil incompleto"
  const [loadError, setLoadError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [successMsg, setSuccessMsg] = useState('');

  // Estados de Tipo de Documento: 'select' | 'cv' | 'letter'
  const [docType, setDocType] = useState(initialDocType);

  useEffect(() => {
    setDocType(initialDocType);
  }, [initialDocType]);

  // ==========================================
  // ESTADOS DEL WIZARD DE CV (Figura 12)
  // ==========================================
  // Pasos: 1 (Información), 2 (Experiencia), 3 (Habilidades), 4 (Vista previa), 5 (Éxito)
  const [cvStep, setCvStep] = useState(1);
  const [cvFirstName, setCvFirstName] = useState('');
  const [cvLastName, setCvLastName] = useState('');
  const [cvEmail, setCvEmail] = useState('');
  const [cvPhone, setCvPhone] = useState('');
  const [cvLocation, setCvLocation] = useState('');
  const [cvLinkedin, setCvLinkedin] = useState('');
  const [cvCareer, setCvCareer] = useState('');
  const [cvTargetRole, setCvTargetRole] = useState('');
  const [cvTargetJobDescription, setCvTargetJobDescription] = useState('');
  const [cvBio, setCvBio] = useState('');

  const [cvExperience, setCvExperience] = useState([]);
  const [cvEducation, setCvEducation] = useState([]);
  const [cvTechSkills, setCvTechSkills] = useState([]);
  const [cvSoftSkills, setCvSoftSkills] = useState([]);
  const [newTech, setNewTech] = useState('');
  const [newSoft, setNewSoft] = useState('');

  const [activeEditorTab, setActiveEditorTab] = useState('personal');
  const [savingProfileData, setSavingProfileData] = useState(false);

  // Estados de Personalización del CV (evitar duplicar perfil)
  const [cvFocus, setCvFocus] = useState('ATS');
  const [updateProfileTargetRole, setUpdateProfileTargetRole] = useState(false);
  const [excludedExperienceIds, setExcludedExperienceIds] = useState([]);
  const [excludedSkills, setExcludedSkills] = useState([]);

  // Estados de Estilo de Plantilla y Diseño del CV
  const [template, setTemplate] = useState(() => localStorage.getItem('empleaia_cv_theme_template') || 'classic');
  const [color, setColor] = useState(() => localStorage.getItem('empleaia_cv_theme_color') || 'purple');
  const [font, setFont] = useState(() => localStorage.getItem('empleaia_cv_theme_font') || 'inter');
  const [fontSize, setFontSize] = useState(() => localStorage.getItem('empleaia_cv_theme_fontSize') || 'normal');
  const [spacing, setSpacing] = useState(() => localStorage.getItem('empleaia_cv_theme_spacing') || 'normal');
  const [headerStyle, setHeaderStyle] = useState(() => localStorage.getItem('empleaia_cv_theme_headerStyle') || 'centered');
  const [visibleSections, setVisibleSections] = useState(() => {
    const saved = localStorage.getItem('empleaia_cv_theme_visibleSections');
    return saved ? JSON.parse(saved) : {
      personalInfo: true,
      phone: true,
      email: true,
      location: true,
      linkedin: true,
      portfolio: true,
      skillsSoft: true,
      skillsTech: true,
      professionalSummary: true,
      experience: true,
      education: true,
      projects: true
    };
  });
  const [sectionOrder, setSectionOrder] = useState(() => {
    const saved = localStorage.getItem('empleaia_cv_theme_sectionOrder');
    return saved ? JSON.parse(saved) : ['summary', 'experience', 'education', 'projects', 'skills'];
  });

  // IA y PDF
  const [generatingCv, setGeneratingCv] = useState(false);
  const [cvProgressStep, setCvProgressStep] = useState('');
  const [downloadingCv, setDownloadingCv] = useState(false);
  const [finalCvData, setFinalCvData] = useState(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [cvId, setCvId] = useState(null);
  const [letterProgressStep, setLetterProgressStep] = useState('');

  // Estados de Autoguardado
  const [lastSavedSnapshot, setLastSavedSnapshot] = useState(null);
  const [isSavingProfileSection, setIsSavingProfileSection] = useState(false);
  const [saveStatusText, setSaveStatusText] = useState('');
  const [isTemporaryCvData, setIsTemporaryCvData] = useState(false);

  // ==========================================
  // ESTADOS DE CARTA DE PRESENTACIÓN
  // ==========================================
  const [jobOfferText, setJobOfferText] = useState('');
  const [company, setCompany] = useState('');
  const [targetRole, setTargetRole] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [tone, setTone] = useState('profesional');
  const [letterContent, setLetterContent] = useState('');
  const [generatingLetter, setGeneratingLetter] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pastLetters, setPastLetters] = useState([]);
  const [downloadingLetter, setDownloadingLetter] = useState(false);
  const [letterId, setLetterId] = useState(null);



  useEffect(() => {
    const loadWizardData = async () => {
      setLoading(true);
      setErrorMsg('');
      setLoadError('');

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setLoading(false);
        return;
      }

      const uid = session.user.id;

      try {
        // Cargar Perfil
        const snapshot = await loadUserSnapshot(uid);
        // Solo tras una carga exitosa se evalúa la completitud del perfil;
        // un fallo de red/servidor cae en el catch como error de carga.
        if (!snapshot.profile || !snapshot.profile.first_name || !snapshot.profile.career) {
          setErrorMsg('Por favor completa tu perfil en "Mi perfil" antes de generar documentos.');
        }
        const pData = { ...snapshot.profile, academic_background: snapshot.academic || [], work_experience: snapshot.work || [] };
        
        if (pData) {
          setIsTemporaryCvData(false);
          setProfile(pData);
          setCvFirstName(pData.first_name || '');
          setCvLastName(pData.last_name || '');
          setCvEmail(pData.email || '');
          setCvPhone(pData.phone || '');
          setCvLocation(pData.location || '');
          setCvLinkedin(pData.linkedin || pData.linkedIn || pData.linkedin_url || pData.linkedInUrl || '');
          setCvCareer(pData.career || '');
          setCvTargetRole(pData.target_role || '');
          setCvTargetJobDescription(pData.target_job_description ?? '');
          setCvBio(pData.bio || '');
          setCvTechSkills(pData.technical_skills || []);
          setCvSoftSkills(pData.soft_skills || []);
          setCvExperience(ensureItemIds(pData.work_experience, 'exp'));
          setCvEducation(ensureItemIds(pData.academic_background, 'edu'));

          setLastSavedSnapshot({
            first_name: pData.first_name || '',
            last_name: pData.last_name || '',
            phone: pData.phone || '',
            location: pData.location || '',
            career: pData.career || '',
            target_role: pData.target_role || '',
            target_job_description: pData.target_job_description ?? '',
            bio: pData.bio || '',
            technical_skills: pData.technical_skills || [],
            soft_skills: pData.soft_skills || [],
            work_experience: pData.work_experience || [],
            academic_background: pData.academic_background || []
          });
        }

        // Cargar datos históricos de CV si existen en localStorage
        const histCvDataStr = localStorage.getItem('empleaia_historical_cv_data');
        if (histCvDataStr) {
          localStorage.removeItem('empleaia_historical_cv_data');
          try {
            const histCv = JSON.parse(histCvDataStr);
            if (histCv) {
              if (histCv.first_name !== undefined || histCv.firstName !== undefined) setCvFirstName(histCv.first_name || histCv.firstName || '');
              if (histCv.last_name !== undefined || histCv.lastName !== undefined) setCvLastName(histCv.last_name || histCv.lastName || '');
              if (histCv.email !== undefined) setCvEmail(histCv.email || '');
              if (histCv.phone !== undefined) setCvPhone(histCv.phone || '');
              if (histCv.location !== undefined || histCv.ubicacion !== undefined || histCv.address !== undefined || histCv.city !== undefined) setCvLocation(histCv.location || histCv.ubicacion || histCv.address || histCv.city || '');
              if (histCv.linkedin !== undefined || histCv.linkedIn !== undefined || histCv.linkedin_url !== undefined || histCv.linkedInUrl !== undefined) setCvLinkedin(histCv.linkedin || histCv.linkedIn || histCv.linkedin_url || histCv.linkedInUrl || '');
              if (histCv.career !== undefined) setCvCareer(histCv.career || '');
              if (histCv.target_role !== undefined || histCv.targetRole !== undefined) setCvTargetRole(histCv.target_role || histCv.targetRole || '');
              if (histCv.target_job_description !== undefined) setCvTargetJobDescription(histCv.target_job_description || '');
              if (histCv.bio !== undefined || histCv.professional_summary !== undefined || histCv.profile_summary !== undefined || histCv.summary !== undefined) setCvBio(histCv.bio || histCv.professional_summary || histCv.profile_summary || histCv.summary || '');
              if (histCv.technical_skills !== undefined || histCv.techSkills !== undefined) setCvTechSkills(normalizeSkillList(histCv.technical_skills || histCv.techSkills));
              if (histCv.soft_skills !== undefined || histCv.softSkills !== undefined) setCvSoftSkills(histCv.soft_skills || histCv.softSkills || []);
              if (histCv.work_experience !== undefined || histCv.experience !== undefined) setCvExperience(ensureItemIds(histCv.work_experience || histCv.experience, 'exp'));
              if (histCv.academic_background !== undefined || histCv.education !== undefined) setCvEducation(ensureItemIds(histCv.academic_background || histCv.education, 'edu'));
              setIsTemporaryCvData(true);
            }
          } catch (e) {
            console.error('Error parseando historial de CV:', e);
          }
        }

        // Cargar Cartas de Presentación previas
        const letters = snapshot.letters || [];
        setPastLetters(letters);

        // Cargar si hay una carta seleccionada para edición desde borradores
        const editLetterId = localStorage.getItem('empleaia_edit_letter_id');
        if (editLetterId) {
          localStorage.removeItem('empleaia_edit_letter_id');
          const selLetter = letters.find((letter) => letter.id === editLetterId);
          
          if (selLetter) {
            setLetterContent(selLetter.letter_content);
            setLetterId(selLetter.id);
            // Intentar desglosar la oferta si tiene formato estructurado
            const lines = selLetter.job_offer_text.split('\n');
            let parsedCompany = '';
            let parsedRole = '';
            let parsedDesc = selLetter.job_offer_text;
            lines.forEach(l => {
              if (l.startsWith('Empresa:')) parsedCompany = l.replace('Empresa:', '').trim();
              if (l.startsWith('Puesto Objetivo:')) parsedRole = l.replace('Puesto Objetivo:', '').trim();
              if (l.startsWith('Descripción de la Vacante:')) parsedDesc = l.replace('Descripción de la Vacante:', '').trim();
            });
            setCompany(parsedCompany);
            setTargetRole(parsedRole);
            setJobDescription(parsedDesc);
            setJobOfferText(selLetter.job_offer_text);
          }
        }

        // Cargar si hay un CV seleccionado para edición
        const editCvId = localStorage.getItem('empleaia_edit_cv_id');
        const cvList = await apiRequest(`/documents/cvs/${uid}`, 'GET');
        let cvs = cvList.cvs || [];
        if (editCvId) {
          cvs = cvs.filter((cv) => cv.id === editCvId);
          localStorage.removeItem('empleaia_edit_cv_id');
        } else {
          cvs = cvs.slice(0, 1);
        }

        if (cvs && cvs.length > 0) {
          const loadedCv = cvs[0];
          setFinalCvData(loadedCv.cv_data);
          setCvId(loadedCv.id);

          // Si es edición explícita de un borrador, restauramos todo el contenido al wizard
          if (editCvId && loadedCv.cv_data) {
            const d = loadedCv.cv_data;
            if (d.first_name !== undefined) setCvFirstName(d.first_name || '');
            if (d.last_name !== undefined) setCvLastName(d.last_name || '');
            if (d.email !== undefined) setCvEmail(d.email || '');
            if (d.phone !== undefined) setCvPhone(d.phone || '');
            if (d.location !== undefined) setCvLocation(d.location || '');
            if (d.linkedin !== undefined) setCvLinkedin(d.linkedin || '');
            if (d.career !== undefined) setCvCareer(d.career || '');
            if (d.target_role !== undefined) setCvTargetRole(d.target_role || '');
            if (d.target_job_description !== undefined) setCvTargetJobDescription(d.target_job_description || '');
            if (d.bio !== undefined || d.professional_summary !== undefined) setCvBio(d.bio || d.professional_summary || '');
            if (d.technical_skills !== undefined) setCvTechSkills(normalizeSkillList(d.technical_skills));
            if (d.soft_skills !== undefined) setCvSoftSkills(d.soft_skills || []);
            if (d.work_experience !== undefined) setCvExperience(ensureItemIds(d.work_experience, 'exp'));
            if (d.academic_background !== undefined) setCvEducation(ensureItemIds(d.academic_background, 'edu'));
            setIsTemporaryCvData(true);
            
            // Si tiene estilos guardados en cv_style, los restauramos
            if (loadedCv.cv_style) {
              const s = loadedCv.cv_style;
              if (s.template) setTemplate(s.template);
              if (s.primaryColor) setColor(s.primaryColor);
              if (s.fontFamily) setFont(s.fontFamily);
              if (s.fontSize) setFontSize(s.fontSize);
              if (s.spacing) setSpacing(s.spacing);
              if (s.headerStyle) setHeaderStyle(s.headerStyle);
              if (s.visibleSections) setVisibleSections(s.visibleSections);
              if (s.sectionOrder) setSectionOrder(s.sectionOrder);
            }
            
            // Además, ponemos el wizard en el paso de visualización (Paso 4)
            setCvStep(4);

            setLastSavedSnapshot({
              first_name: d.first_name || '',
              last_name: d.last_name || '',
              phone: d.phone || '',
              location: d.location || '',
              career: d.career || '',
              target_role: d.target_role || '',
              target_job_description: d.target_job_description ?? pData.target_job_description ?? '',
              bio: d.bio || '',
              technical_skills: d.technical_skills || [],
              soft_skills: d.soft_skills || [],
              work_experience: d.work_experience || [],
              academic_background: d.academic_background || []
            });
          }
        }

      } catch (err) {
        console.error('Error cargando wizard:', err);
        // Con sesión expirada api.js ya cerró sesión y App redirige al login.
        if (err.code !== 'SESSION_EXPIRED') {
          setLoadError(mapError(err));
        }
      } finally {
        setLoading(false);
      }
    };

    loadWizardData();
  }, [docType, reloadKey]);

  // Sincronizar estilo en localStorage y logs de control
  useEffect(() => {
    localStorage.setItem('empleaia_cv_theme_template', template);
    console.log("Template seleccionado:", template);
  }, [template]);

  useEffect(() => {
    localStorage.setItem('empleaia_cv_theme_font', font);
    console.log("Fuente seleccionada:", font);
  }, [font]);

  useEffect(() => {
    localStorage.setItem('empleaia_cv_theme_color', color);
    console.log("Color seleccionado:", color);
  }, [color]);

  useEffect(() => {
    localStorage.setItem('empleaia_cv_theme_fontSize', fontSize);
  }, [fontSize]);

  useEffect(() => {
    localStorage.setItem('empleaia_cv_theme_spacing', spacing);
  }, [spacing]);

  useEffect(() => {
    localStorage.setItem('empleaia_cv_theme_headerStyle', headerStyle);
  }, [headerStyle]);

  useEffect(() => {
    localStorage.setItem('empleaia_cv_theme_visibleSections', JSON.stringify(visibleSections));
  }, [visibleSections]);

  useEffect(() => {
    localStorage.setItem('empleaia_cv_theme_sectionOrder', JSON.stringify(sectionOrder));
  }, [sectionOrder]);

  // ==========================================
  // FUNCIONES DE CONTROL DEL WIZARD DE CV
  // ==========================================
  const nextStep = () => setCvStep(prev => Math.min(prev + 1, 5));
  const prevStep = () => setCvStep(prev => Math.max(prev - 1, 1));

  const handleSectionToggleChange = (key, value) => {
    setVisibleSections(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const moveSection = (index, direction) => {
    const newOrder = [...sectionOrder];
    const targetIndex = index + direction;
    if (targetIndex >= 0 && targetIndex < newOrder.length) {
      const temp = newOrder[index];
      newOrder[index] = newOrder[targetIndex];
      newOrder[targetIndex] = temp;
      setSectionOrder(newOrder);
    }
  };

  const getSectionLabel = (secId) => {
    const labels = {
      summary: 'Perfil Profesional',
      experience: 'Experiencia Laboral',
      education: 'Educación',
      projects: 'Proyectos Destacados',
      skills: 'Habilidades'
    };
    return labels[secId] || secId;
  };

  const persistProfileData = async ({ persistTargetRole = true } = {}) => {
    if (!profile?.id) throw new Error('No se encontró ID de perfil válido.');
    if (cvEducation.some((education) => !education.start_date) || cvExperience.some((experience) => !experience.start_date)) {
      throw new Error('Completa las fechas de inicio antes de guardar estos datos en el perfil maestro.');
    }

    const excludedCounts = new Map();
    cvExperience
      .filter((experience) => excludedExperienceIds.includes(experience.id))
      .forEach((experience) => {
        const key = experienceIdentity(experience);
        excludedCounts.set(key, (excludedCounts.get(key) || 0) + 1);
      });

    const profilePayload = {
      first_name: cvFirstName,
      last_name: cvLastName,
      phone: cvPhone,
      location: cvLocation,
      career: cvCareer,
      target_role: persistTargetRole ? cvTargetRole : profile.target_role,
      target_job_description: cvTargetJobDescription,
      bio: cvBio,
      technical_skills: cvTechSkills,
      soft_skills: cvSoftSkills
    };

    await apiRequest(`/profile/${profile.id}/full`, 'PUT', {
      profile: profilePayload,
      academic_background: cvEducation.map((education) => ({
        institution: education.institution,
        degree: education.degree,
        start_date: education.start_date,
        end_date: education.end_date || null,
        description: education.description || null
      })),
      work_experience: cvExperience.map((experience) => ({
        company: experience.company,
        role: experience.role,
        start_date: experience.start_date,
        end_date: experience.end_date || null,
        description: experience.description || '',
        achievements: experience.achievements || experience.bullets || []
      }))
    });

    const refreshed = await loadUserSnapshot(profile.id);
    const refreshedExperience = ensureItemIds(refreshed.work, 'exp');
    const refreshedEducation = ensureItemIds(refreshed.academic, 'edu');
    const refreshedExcludedIds = refreshedExperience.reduce((ids, experience) => {
      const key = experienceIdentity(experience);
      const remaining = excludedCounts.get(key) || 0;
      if (remaining > 0) {
        ids.push(experience.id);
        excludedCounts.set(key, remaining - 1);
      }
      return ids;
    }, []);

    setProfile({
      ...refreshed.profile,
      work_experience: refreshedExperience,
      academic_background: refreshedEducation
    });
    setCvExperience(refreshedExperience);
    setCvEducation(refreshedEducation);
    setExcludedExperienceIds(refreshedExcludedIds);
    setIsTemporaryCvData(false);
    setLastSavedSnapshot({
      first_name: cvFirstName,
      last_name: cvLastName,
      phone: cvPhone,
      location: cvLocation,
      career: cvCareer,
      target_role: cvTargetRole,
      target_job_description: cvTargetJobDescription,
      bio: cvBio,
      technical_skills: cvTechSkills,
      soft_skills: cvSoftSkills,
      work_experience: refreshedExperience,
      academic_background: refreshedEducation
    });

    return { refreshedExcludedIds };
  };

  const handleSaveProfileData = async (advance = false) => {
    if (!profile?.id) {
      toast.error("No se encontró ID de perfil válido.");
      return;
    }
    setSavingProfileData(true);
    try {
      await persistProfileData();

      toast.success("¡Datos del perfil profesional guardados con éxito!");
      if (advance) {
        setCvStep(2);
      }
    } catch (err) {
      console.error(err);
      toast.error(err.message || "Error al sincronizar datos en la base de datos.");
    } finally {
      setSavingProfileData(false);
    }
  };

  const hasChanges = () => {
    if (!lastSavedSnapshot) return false;
    const current = {
      first_name: cvFirstName,
      last_name: cvLastName,
      phone: cvPhone,
      location: cvLocation,
      career: cvCareer,
      target_role: cvTargetRole,
      target_job_description: cvTargetJobDescription,
      bio: cvBio,
      technical_skills: cvTechSkills,
      soft_skills: cvSoftSkills,
      work_experience: cvExperience,
      academic_background: cvEducation
    };
    return JSON.stringify(current) !== JSON.stringify(lastSavedSnapshot);
  };

  const handleEditorTabChange = async (newTabId) => {
    if (isTemporaryCvData || !hasChanges() || isSavingProfileSection) {
      setActiveEditorTab(newTabId);
      return;
    }

    setIsSavingProfileSection(true);
    setSaveStatusText('Guardando...');

    try {
      await persistProfileData();
      setSaveStatusText('Cambios guardados');
      setTimeout(() => {
        setSaveStatusText('');
      }, 2000);
    } catch (err) {
      console.error('[Autoguardado] Error al guardar perfil:', err);
      setSaveStatusText('Error al guardar cambios');
      setTimeout(() => {
        setSaveStatusText('');
      }, 3000);
    } finally {
      setIsSavingProfileSection(false);
      setActiveEditorTab(newTabId);
    }
  };

  const addExperienceItem = () => {
    setCvExperience([...cvExperience, { id: `exp-temp-${Date.now()}-${Math.random()}`, company: '', role: '', start_date: '', end_date: '', description: '', achievements: [] }]);
  };

  const removeExperienceItem = (index) => {
    setCvExperience(cvExperience.filter((_, i) => i !== index));
  };

  const handleExperienceItemChange = (index, field, value) => {
    const updated = [...cvExperience];
    updated[index][field] = value;
    setCvExperience(updated);
  };

  const addEducationItem = () => {
    setCvEducation([...cvEducation, { id: `edu-temp-${Date.now()}-${Math.random()}`, institution: '', degree: '', start_date: '', end_date: '' }]);
  };

  const removeEducationItem = (index) => {
    setCvEducation(cvEducation.filter((_, i) => i !== index));
  };

  const handleEducationItemChange = (index, field, value) => {
    const updated = [...cvEducation];
    updated[index][field] = value;
    setCvEducation(updated);
  };

  const addSkill = (type) => {
    if (type === 'tech' && newTech.trim() && !cvTechSkills.includes(newTech.trim())) {
      setCvTechSkills([...cvTechSkills, newTech.trim()]);
      setNewTech('');
    } else if (type === 'soft' && newSoft.trim() && !cvSoftSkills.includes(newSoft.trim())) {
      setCvSoftSkills([...cvSoftSkills, newSoft.trim()]);
      setNewSoft('');
    }
  };

  const removeSkill = (type, skill) => {
    if (type === 'tech') setCvTechSkills(cvTechSkills.filter(s => s !== skill));
    else setCvSoftSkills(cvSoftSkills.filter(s => s !== skill));
  };

  // GENERAR CV POR IA LLAMANDO A NUESTRO SERVIDOR NODE/EXPRESS (Backend)
  const handleGenerateCvAi = async () => {
    if (generatingCv) return;
    setGeneratingCv(true);
    setCvProgressStep('Analizando perfil...');
    setErrorMsg('');

    const steps = [
      { text: 'Analizando perfil...', delay: 1000 },
      { text: 'Generando contenido con IA...', delay: 3000 },
      { text: 'Optimizando formato...', delay: 2000 },
      { text: 'Finalizando...', delay: 1500 }
    ];
    let stepIndex = 0;
    const progressInterval = setInterval(() => {
      if (stepIndex < steps.length - 1) {
        stepIndex++;
        setCvProgressStep(steps[stepIndex].text);
      }
    }, 2500);

    try {
      if (updateProfileTargetRole) {
        await apiRequest(`/profile/${profile.id}`, 'PUT', { target_role: cvTargetRole });
      }

      // Invocar a la Capa de Negocio (Backend en Puerto 5000)
      const themeConfig = {
        template,
        fontFamily: font,
        primaryColor: color,
        fontSize,
        spacing,
        headerStyle,
        visibleSections,
        sectionOrder
      };

      const data = await apiRequest('/cv-generate', 'POST', { 
        profileId: profile.id,
        cv_style: themeConfig,
        custom_target_role: cvTargetRole,
        target_job_description: cvTargetJobDescription,
        cv_focus: cvFocus,
        excluded_experience_ids: excludedExperienceIds,
        excluded_skills: excludedSkills,
        candidate_data: {
          personal_info: {
            career: cvCareer,
            target_role: cvTargetRole,
            bio: cvBio
          },
          skills: {
            technical: cvTechSkills,
            soft: cvSoftSkills
          },
          academic_background: cvEducation.map((education) => ({
            id: education.id,
            institution: education.institution || '',
            degree: education.degree || '',
            start_date: education.start_date || '',
            end_date: education.end_date || null,
            description: education.description || ''
          })),
          work_experience: cvExperience.map((experience) => ({
            id: experience.id,
            company: experience.company || '',
            role: experience.role || '',
            start_date: experience.start_date || '',
            end_date: experience.end_date || null,
            description: experience.description || '',
            achievements: experience.achievements || experience.bullets || []
          }))
        }
      });

      if (data.success) {
        setFinalCvData(data.cvData);
        setCvId(data.cvId);
        setCvStep(5); // Avanzar a Éxito (Paso 5)
      } else {
        throw new Error(data.error || 'Error generando CV con la IA');
      }

    } catch (err) {
      console.error('Error generando CV en wizard:', err);
      setErrorMsg(mapError(err));
    } finally {
      clearInterval(progressInterval);
      setGeneratingCv(false);
      setCvProgressStep('');
    }
  };

  // AUTOCOMPLETAR EL WIZARD CON LOS DATOS EXTRAÍDOS POR EL MODAL DE IMPORTACIÓN
  // (solo llena el CV actual; el perfil del usuario no se modifica)
  const applyParsedCv = (parsed) => {
    setErrorMsg('');
    const merged = mergeImportedPersonal({
      first_name: cvFirstName, last_name: cvLastName, phone: cvPhone,
      location: cvLocation, linkedin: cvLinkedin, career: cvCareer,
      target_role: cvTargetRole, target_job_description: cvTargetJobDescription, bio: cvBio,
    }, parsed);
    setCvFirstName(merged.first_name);
    setCvLastName(merged.last_name);
    // The authenticated email is immutable during import.
    setCvPhone(merged.phone);
    setCvLocation(merged.location);
    setCvLinkedin(merged.linkedin);
    setCvCareer(merged.career);
    setCvTargetRole(merged.target_role);
    setCvTargetJobDescription(merged.target_job_description);
    setCvBio(merged.bio);
    if (parsed.technical_skills?.length) setCvTechSkills(normalizeSkillList(parsed.technical_skills));
    if (parsed.soft_skills?.length) setCvSoftSkills(parsed.soft_skills);
    if (parsed.work_experience?.length) {
      setCvExperience(ensureItemIds(parsed.work_experience.map(completeImportedExperience), 'exp'));
    }
    if (parsed.academic_background?.length) setCvEducation(ensureItemIds(parsed.academic_background, 'edu'));
    setIsTemporaryCvData(true);
    setSuccessMsg('Datos del CV importados para revisión. Se conservaron el puesto y la vacante existentes. Tu perfil de entrevistas no cambió; para actualizarlo importa y guarda desde Mi perfil.');
  };

  // DESCARGAR PDF USANDO UTILIDAD UNIFICADA
  const handleDownloadPdf = async () => {
    if (downloadingCv) return;
    setDownloadingCv(true);
    setErrorMsg('');
    try {
      const { exportToPdf } = await import('../utils/exportToPdf');
      const rawFileName = `CV_${cvFirstName || 'Usuario'}_${cvLastName || ''}.pdf`;
      const fileName = rawFileName
        .replace(/\s+/g, '_')
        .replace(/[^\w.-]/g, '');

      await exportToPdf('cv-sheet-a4-canvas', fileName);

      // Actualizar estado a 'downloaded' en la BD
      if (cvId) {
        await apiRequest(`/cv/${cvId}`, 'PUT', { status: 'downloaded' });
      }
    } catch (err) {
      console.error('Error descargando PDF:', err);
      const errMsg = err.code === 'DOM_NOT_FOUND'
        ? 'Error: El elemento visual del CV no se encuentra renderizado en el DOM.'
        : 'Error compilando el archivo PDF local. Por favor, vuelve a intentarlo.';
      setErrorMsg(errMsg);
    } finally {
      setDownloadingCv(false);
    }
  };

  // ==========================================
  // LÓGICA DE CARTAS DE PRESENTACIÓN
  // ==========================================
  const handleGenerateLetterAi = async () => {
    if (!jobDescription.trim() || generatingLetter) return;
    setGeneratingLetter(true);
    setLetterProgressStep('Analizando perfil y vacante...');
    setErrorMsg('');
    setLetterContent('');
    setCopied(false);

    const steps = [
      { text: 'Analizando perfil y vacante...', delay: 1000 },
      { text: 'Alineando competencias con la oferta...', delay: 2500 },
      { text: 'Redactando contenido formal con IA...', delay: 2000 },
      { text: 'Optimizando tono y formato...', delay: 1500 }
    ];
    let stepIndex = 0;
    const progressInterval = setInterval(() => {
      if (stepIndex < steps.length - 1) {
        stepIndex++;
        setLetterProgressStep(steps[stepIndex].text);
      }
    }, 2000);

    try {
      const data = await apiRequest('/letter-generate', 'POST', {
        profileId: profile.id,
        company,
        targetRole,
        jobDescription,
        tone
      });

      if (data.success) {
        setLetterContent(data.letterContent);
        setLetterId(data.letterId);

        if (data.warning) {
          setErrorMsg(data.warning);
        }

        // Recargar historial si se guardó con éxito
        if (data.letterId) {
          const refreshed = await loadUserSnapshot(profile.id);
          setPastLetters(refreshed.letters || []);
        }
      }
    } catch (err) {
      console.error('Error redactando carta:', err);
      if (err.code === 'LETTER_SAVE_FAILED' || err.code === 'DB_SCHEMA_MISMATCH') {
        setErrorMsg('No se pudo guardar la carta. Verifica que la base de datos tenga las columnas requeridas.');
      } else if (err.code === 'PROFILE_REQUIRED') {
        setErrorMsg('No se encontró un perfil profesional para guardar la carta.');
      } else {
        setErrorMsg(mapError(err));
      }
    } finally {
      clearInterval(progressInterval);
      setGeneratingLetter(false);
      setLetterProgressStep('');
    }
  };

  const handleCopyLetter = () => {
    navigator.clipboard.writeText(letterContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadLetterPdf = async () => {
    if (!letterContent || downloadingLetter) return;
    setDownloadingLetter(true);
    setErrorMsg('');
    try {
      const { exportToPdf } = await import('../utils/exportToPdf');
      const rawFileName = `Carta_Presentacion_${cvFirstName || 'Usuario'}_${cvLastName || ''}.pdf`;
      const fileName = rawFileName
        .replace(/\s+/g, '_')
        .replace(/[^\w.-]/g, '');

      await exportToPdf('letter-sheet-a4-canvas', fileName);

      // Actualizar estado a 'downloaded' en la BD
      if (letterId) {
        await apiRequest(`/letter/${letterId}`, 'PUT', { status: 'downloaded' });
      }
    } catch (err) {
      console.error('Error descargando PDF de carta:', err);
      const errMsg = err.code === 'DOM_NOT_FOUND'
        ? 'Error: El elemento visual de la carta no se encuentra renderizado en el DOM.'
        : 'Error compilando la carta en PDF local. Por favor, vuelve a intentarlo.';
      setErrorMsg(errMsg);
    } finally {
      setDownloadingLetter(false);
    }
  };

  // PERSISTENCIA DE BORRADORES
  const handleSaveCvDraft = async () => {
    if (!cvId) return;
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const data = await apiRequest(`/cv/${cvId}`, 'PUT', { status: 'draft' });
      if (data.success) {
        setSuccessMsg('¡CV guardado como borrador en la base de datos!');
      } else {
        throw new Error(data.error || 'No se pudo actualizar el estado del CV.');
      }
    } catch (err) {
      console.error(err);
      setErrorMsg(mapError(err));
    }
  };

  const handleSaveLetterDraft = async () => {
    setErrorMsg('');
    setSuccessMsg('');
    try {
      if (letterId) {
        const data = await apiRequest(`/letter/${letterId}`, 'PUT', { 
          status: 'draft',
          letter_content: letterContent
        });
        if (data.success) {
          setSuccessMsg('¡Carta de presentación guardada como borrador en la base de datos!');
        } else {
          throw new Error(data.error || 'No se pudo actualizar el estado de la carta.');
        }
      } else {
        // Fallback: Crear el registro en la base de datos como borrador (Tarea 9)
        const defaultTitle = `Carta para ${company || targetRole || 'Vacante'}`;
        const data = await apiRequest('/letter-save', 'POST', {
          profileId: profile.id,
          jobOfferText: jobOfferText || `Empresa: ${company || 'No especificada'}\nPuesto Objetivo: ${targetRole || 'No especificado'}\nDescripción de la Vacante: ${jobDescription}\nTono deseado: ${tone || 'profesional'}`,
          letterContent: letterContent,
          documentTitle: defaultTitle,
          status: 'draft',
          company: company || null,
          targetRole: targetRole || null,
          jobDescription: jobDescription || null,
          tone: tone || null
        });

        if (data.success && data.letterId) {
          setLetterId(data.letterId);
          setSuccessMsg('¡Carta de presentación guardada como borrador en la base de datos!');
          
          // Recargar historial
          const refreshed = await loadUserSnapshot(profile.id);
          setPastLetters(refreshed.letters || []);
        } else {
          throw new Error(data.error || 'No se pudo guardar la carta como borrador.');
        }
      }
    } catch (err) {
      console.error(err);
      if (err.code === 'LETTER_SAVE_FAILED' || err.code === 'DB_SCHEMA_MISMATCH') {
        setErrorMsg('No se pudo guardar la carta. Verifica que la base de datos tenga las columnas requeridas.');
      } else if (err.code === 'PROFILE_REQUIRED') {
        setErrorMsg('No se encontró un perfil profesional para guardar la carta.');
      } else {
        setErrorMsg(mapError(err));
      }
    }
  };

  const renderLetterCanvas = () => {
    return (
      <div 
        id="letter-sheet-a4-canvas" 
        className="bg-white text-slate-900 shadow-lg p-12 font-serif text-left shrink-0 text-justify"
        style={{
          fontFamily: 'Georgia, Cambria, "Times New Roman", Times, serif',
          // Ancho A4 real (210mm): html2pdf exporta dentro de un contenedor de
          // 210mm y un ancho menor deja franja blanca a la derecha del PDF.
          width: '210mm',
          minHeight: '277mm',
          boxSizing: 'border-box',
          lineHeight: '1.6',
          fontSize: '13px'
        }}
      >
        <div className="whitespace-pre-wrap">
          {letterContent}
        </div>
      </div>
    );
  };

  const handleDeleteLetter = (id) => {
    showConfirm({
      title: '¿Eliminar carta de presentación?',
      message: '¿Estás seguro de que deseas eliminar esta carta de presentación permanentemente?',
      onConfirm: async () => {
        try {
          await apiRequest(`/letter/${id}`, 'DELETE');
          
          toast.success('Carta de presentación eliminada correctamente.');
          setPastLetters(pastLetters.filter(l => l.id !== id));
          setLetterContent('');
          setJobOfferText('');
        } catch (err) {
          console.error('Error al eliminar carta:', err);
          toast.error(mapError(err));
        }
      }
    });
  };

  if (loading) {
    return (
      <div className="flex-1 min-h-full bg-slate-50 flex flex-col justify-center items-center font-sans">
        <Loader2 className="h-8 w-8 text-indigo-650 animate-spin mb-2" />
        <p className="text-slate-500 text-sm">Preparando generador de documentos...</p>
      </div>
    );
  }

  // No se pudieron cargar los datos del wizard: error real de red/servidor
  if (loadError) {
    return (
      <div className="flex-1 min-h-full bg-slate-50 flex flex-col justify-center items-center font-sans px-4">
        <div className="bg-rose-50 border border-rose-100 text-rose-650 text-xs rounded-xl p-4 flex items-start gap-3 mb-4 max-w-md">
          <AlertCircle className="h-4.5 w-4.5 shrink-0 mt-0.5" />
          <span>{loadError}</span>
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

  const liveCvData = {
    headline: cvTargetRole,
    professional_summary: cvBio,
    work_experience: cvExperience.filter(w => !excludedExperienceIds.includes(w.id)),
    academic_background: cvEducation,
    skills_categories: {
      languages_and_frameworks: cvTechSkills.filter(s => !excludedSkills.includes(s)),
      tools_and_databases: [],
      methodologies_and_soft_skills: cvSoftSkills.filter(s => !excludedSkills.includes(s))
    },
    soft_skills: cvSoftSkills.filter(s => !excludedSkills.includes(s))
  };
  const liveProfile = {
    ...profile,
    first_name: cvFirstName,
    last_name: cvLastName,
    email: cvEmail,
    phone: cvPhone,
    location: cvLocation,
    linkedin: cvLinkedin,
    portfolio: profile?.portfolio,
    career: cvCareer,
    target_role: cvTargetRole,
    target_job_description: cvTargetJobDescription,
    bio: cvBio,
    technical_skills: cvTechSkills,
    soft_skills: cvSoftSkills,
    work_experience: cvExperience,
    academic_background: cvEducation
  };
  const cvTheme = {
    template,
    fontFamily: font,
    primaryColor: color,
    fontSize,
    spacing,
    headerStyle,
    visibleSections,
    sectionOrder
  };
  const livePreviewPanel = (
    <div className="lg:col-span-7 bg-slate-100 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex justify-center overflow-x-auto shadow-inner min-h-[520px]">
      <CVPreview
        profile={liveProfile}
        cvData={liveCvData}
        theme={cvTheme}
        sections={visibleSections}
        sectionOrder={sectionOrder}
      />
    </div>
  );

  return (
    <div className="flex-1 min-h-full overflow-y-auto bg-slate-50 px-4 py-6 font-sans sm:px-6 lg:px-8 lg:py-8">
      
      {errorMsg && (
        <div className="bg-rose-50 border border-rose-100 text-rose-650 text-xs rounded-xl p-4 flex items-start gap-3 mb-6">
          <AlertCircle className="h-4.5 w-4.5 shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div className="bg-emerald-50 border border-emerald-100 text-emerald-650 text-xs rounded-xl p-4 flex items-start gap-3 mb-6 animate-fade-in">
          <CheckCircle className="h-4.5 w-4.5 shrink-0 mt-0.5 text-emerald-650" />
          <span>{successMsg}</span>
        </div>
      )}

      {docType === 'select' ? (
        /* ========================================================= */
        /* SELECTOR INICIAL (FIGURA 12 - IZQUIERDA) */
        /* ========================================================= */
        <div className="mx-auto w-full max-w-[1600px] space-y-6">
          <div className="mb-4">
            <h2 className="text-2xl font-black text-slate-900 leading-tight">Generar documentos</h2>
            <p className="text-slate-400 text-xs mt-1">¿Qué documento deseas generar el día de hoy?</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
            
            {/* Botón Currículum Vitae */}
            <button 
              onClick={() => {
                if (typeof navigateTo === 'function') {
                  navigateTo('/documents/cv');
                } else {
                  setDocType('cv');
                  setCvStep(1);
                }
              }}
              className="bg-white border border-slate-200 hover:border-indigo-500 hover:shadow-md rounded-2xl p-8 text-center space-y-4 transition-all duration-300 group cursor-pointer"
            >
              <div className="bg-indigo-50 text-indigo-650 h-16 w-16 rounded-full border border-indigo-100 flex items-center justify-center mx-auto group-hover:scale-105 transition-transform shadow-inner">
                <FileText className="h-8 w-8" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Currículum Vitae</h3>
                <p className="text-xs text-slate-400">Crea un CV profesional en minutos</p>
              </div>
            </button>

            <button 
              onClick={() => {
                if (typeof navigateTo === 'function') {
                  navigateTo('/documents/cover-letter');
                } else {
                  setDocType('letter');
                }
              }}
              className="bg-white border border-slate-200 hover:border-indigo-500 hover:shadow-md rounded-2xl p-8 text-center space-y-4 transition-all duration-300 group cursor-pointer"
            >
              <div className="bg-indigo-50 text-indigo-650 h-16 w-16 rounded-full border border-indigo-100 flex items-center justify-center mx-auto group-hover:scale-105 transition-transform shadow-inner">
                <Mail className="h-8 w-8" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Carta de presentación</h3>
                <p className="text-xs text-slate-400">Personalizada para la oferta laboral</p>
              </div>
            </button>

          </div>
        </div>
      ) : docType === 'cv' ? (
        /* ========================================================= */
        /* WIZARD DE CURRICULUM VITAE (CONSOLIDADO DE 4 PASOS) */
        /* ========================================================= */
        <div className="mx-auto w-full max-w-[1600px] space-y-6">
          
          {/* Cabecera / Barra de Pasos */}
          <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm flex flex-col gap-4 xl:flex-row xl:justify-between xl:items-center">
            {/* Pasos del wizard como tabs segmentados (estándar de Mi Perfil / Mis Borradores) */}
            <div className="flex gap-1 overflow-x-auto rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-1 w-full xl:w-auto">
              {[
                { n: 1, label: '1. Datos Base' },
                { n: 2, label: '2. Personalización' },
                { n: 3, label: '3. Plantilla & Diseño' },
                { n: 4, label: '4. Preview & Generación' }
              ].map((step) => {
                const isActive = step.n === 4 ? cvStep >= 4 : cvStep === step.n;
                return (
                  <button
                    key={step.n}
                    type="button"
                    onClick={() => setCvStep(step.n)}
                    className={`px-3 py-2 rounded-lg text-[11px] font-bold whitespace-nowrap cursor-pointer transition-all ${
                      isActive
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-white/70 dark:hover:bg-slate-800/70'
                    }`}
                  >
                    {step.label}
                  </button>
                );
              })}
            </div>
            <div className="flex flex-col sm:flex-row gap-2 sm:items-center xl:justify-end">
              {cvStep < 5 && (
                <>
                  {cvStep >= 2 && (
                    <button
                      type="button"
                      onClick={prevStep}
                      disabled={generatingCv}
                      className="border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-650 dark:text-slate-300 font-bold px-4 py-2 rounded-xl text-xs flex items-center justify-center gap-1 cursor-pointer transition-colors disabled:opacity-50"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                      Atrás
                    </button>
                  )}
                  {cvStep <= 3 && (
                    <button
                      type="button"
                      onClick={cvStep === 1 ? () => handleSaveProfileData(true) : nextStep}
                      disabled={savingProfileData}
                      className="bg-indigo-650 hover:bg-indigo-700 text-white font-bold px-4 py-2 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-sm shadow-indigo-600/10 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {savingProfileData ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Guardando...
                        </>
                      ) : (
                        <>
                          Siguiente
                          <ChevronRight className="h-3.5 w-3.5" />
                        </>
                      )}
                    </button>
                  )}
                </>
              )}
              <button
                type="button"
                onClick={() => setShowImportModal(true)}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-4 py-2 rounded-xl text-[10px] cursor-pointer shadow-sm text-center transition-all shrink-0 flex items-center justify-center gap-1.5"
              >
                <Sparkles className="h-3.5 w-3.5" />
                Importar CV con IA
              </button>
            </div>
          </div>

          <ImportCvModal
            open={showImportModal}
            onClose={() => setShowImportModal(false)}
            onParsed={applyParsedCv}
          />

          {/* CUERPO DEL WIZARD SEGÚN PASO */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm min-h-[350px] flex flex-col justify-between">
            
            <div>
              {/* PASO 1: DATOS BASE */}
              {cvStep === 1 && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start text-left">
                  <div className="lg:col-span-5 space-y-6">
                  
                  {/* Horizontal Tabs Menu */}
                  <div className="border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4 pb-2">
                    <div className="flex gap-4 overflow-x-auto text-xs font-bold text-slate-450 dark:text-slate-400">
                      {[
                        { id: 'personal', name: 'Información Personal', icon: User },
                        { id: 'summary', name: 'Perfil Profesional', icon: FileText },
                        { id: 'experience', name: 'Experiencia Laboral', icon: Briefcase },
                        { id: 'education', name: 'Educación', icon: GraduationCap },
                        { id: 'skills', name: 'Habilidades', icon: Wrench }
                      ].map((tab) => {
                        const Icon = tab.icon;
                        return (
                          <button
                            key={tab.id}
                            type="button"
                            onClick={() => handleEditorTabChange(tab.id)}
                            className={`pb-2 border-b-2 flex items-center gap-1.5 cursor-pointer transition-all whitespace-nowrap ${
                              activeEditorTab === tab.id
                                ? 'border-indigo-650 text-indigo-650 dark:text-indigo-400 dark:border-indigo-400'
                                : 'border-transparent hover:text-slate-750 dark:hover:text-slate-200'
                            }`}
                          >
                            <Icon className="h-3.5 w-3.5" />
                            {tab.name}
                          </button>
                        );
                      })}
                    </div>
                    {saveStatusText && (
                      <span className={`text-[9px] font-extrabold uppercase px-2 py-0.5 rounded transition-all animate-pulse shrink-0 ${
                        saveStatusText.includes('Error') 
                          ? 'text-red-600 bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/40' 
                          : saveStatusText.includes('guardados') 
                            ? 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/40' 
                            : 'text-indigo-600 bg-indigo-50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/40'
                      }`}>
                        {saveStatusText}
                      </span>
                    )}
                  </div>

                  {/* Tab Contents */}
                  <div className="mt-4">
                    {/* Tab 1: Personal Info */}
                    {activeEditorTab === 'personal' && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-slate-505 dark:text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1">Nombres</label>
                          <input 
                            type="text" 
                            value={cvFirstName} 
                            onChange={(e) => setCvFirstName(e.target.value)}
                            className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl px-4 py-2.5 text-xs focus:outline-none focus:border-indigo-500 focus:bg-white dark:focus:bg-slate-800"
                          />
                        </div>
                        <div>
                          <label className="block text-slate-505 dark:text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1">Apellidos</label>
                          <input 
                            type="text" 
                            value={cvLastName} 
                            onChange={(e) => setCvLastName(e.target.value)}
                            className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl px-4 py-2.5 text-xs focus:outline-none focus:border-indigo-500 focus:bg-white dark:focus:bg-slate-800"
                          />
                        </div>
                        <div>
                          <label className="block text-slate-505 dark:text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1">Teléfono</label>
                          <input 
                            type="text" 
                            value={cvPhone} 
                            onChange={(e) => setCvPhone(e.target.value)}
                            className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl px-4 py-2.5 text-xs focus:outline-none focus:border-indigo-500 focus:bg-white dark:focus:bg-slate-800"
                          />
                        </div>
                        <div>
                          <label className="block text-slate-505 dark:text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1">Ubicación (Ciudad, País)</label>
                          <input 
                            type="text" 
                            value={cvLocation} 
                            onChange={(e) => setCvLocation(e.target.value)}
                            placeholder="Ej: Madrid, España"
                            className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl px-4 py-2.5 text-xs focus:outline-none focus:border-indigo-500 focus:bg-white dark:focus:bg-slate-800"
                          />
                        </div>
                        <div>
                          <label className="block text-slate-505 dark:text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1">Correo electrónico</label>
                          <input 
                            type="email" 
                            value={cvEmail} 
                            disabled
                            className="w-full bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-750 text-slate-500 dark:text-slate-400 rounded-xl px-4 py-2.5 text-xs outline-none cursor-not-allowed"
                          />
                        </div>
                        <div>
                          <label className="block text-slate-505 dark:text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1">LinkedIn</label>
                          <input 
                            type="url" 
                            value={cvLinkedin} 
                            onChange={(e) => setCvLinkedin(e.target.value)}
                            placeholder="https://www.linkedin.com/in/usuario"
                            className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl px-4 py-2.5 text-xs focus:outline-none focus:border-indigo-500 focus:bg-white dark:focus:bg-slate-800"
                          />
                        </div>
                        <div>
                          <label className="block text-slate-505 dark:text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1">Carrera / Profesión principal</label>
                          <input 
                            type="text" 
                            value={cvCareer} 
                            onChange={(e) => setCvCareer(e.target.value)}
                            placeholder="Ej: Ingeniero de Software"
                            className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl px-4 py-2.5 text-xs focus:outline-none focus:border-indigo-500 focus:bg-white dark:focus:bg-slate-800"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="block text-slate-505 dark:text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1">Puesto objetivo predeterminado</label>
                          <input 
                            type="text" 
                            value={cvTargetRole} 
                            onChange={(e) => setCvTargetRole(e.target.value)}
                            placeholder="Ej: Senior React Developer"
                            className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl px-4 py-2.5 text-xs focus:outline-none focus:border-indigo-500 focus:bg-white dark:focus:bg-slate-800"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label htmlFor="target-job-description" className="block text-slate-505 dark:text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1">Descripción del puesto objetivo</label>
                          <textarea
                            id="target-job-description"
                            rows={5}
                            value={cvTargetJobDescription}
                            onChange={(e) => setCvTargetJobDescription(e.target.value)}
                            placeholder="Pega aquí las funciones, responsabilidades, requisitos y tecnologías solicitadas en la oferta laboral."
                            className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl p-3 text-xs focus:outline-none focus:border-indigo-500 focus:bg-white dark:focus:bg-slate-800 leading-relaxed whitespace-pre-wrap resize-y"
                          />
                        </div>
                      </div>
                    )}

                    {/* Tab 2: Profile Summary (Bio) */}
                    {activeEditorTab === 'summary' && (
                      <div className="space-y-2">
                        <label className="block text-slate-505 dark:text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1">Perfil Profesional / Biografía</label>
                        <textarea
                          rows={6}
                          value={cvBio}
                          onChange={(e) => setCvBio(e.target.value)}
                          placeholder="Describe brevemente tus logros principales, experiencia destacada y qué aportas a una organización..."
                          className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl p-3 text-xs focus:outline-none focus:border-indigo-500 focus:bg-white dark:focus:bg-slate-800 leading-relaxed text-justify whitespace-pre-wrap"
                        />
                      </div>
                    )}

                    {/* Tab 3: Work Experience */}
                    {activeEditorTab === 'experience' && (
                      <div className="space-y-4">
                        <div className="flex justify-between items-center pb-2 border-b border-slate-100 dark:border-slate-800">
                          <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Historial de Experiencias Laborales</h4>
                          <button
                            type="button"
                            onClick={addExperienceItem}
                            className="bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/40 text-indigo-650 dark:text-indigo-400 text-[10px] font-bold px-3 py-1.5 rounded-xl cursor-pointer transition-all flex items-center gap-1"
                          >
                            <Plus className="h-3.5 w-3.5" /> Agregar puesto
                          </button>
                        </div>

                        <div className="space-y-4 max-h-[400px] overflow-y-auto pr-1">
                          {cvExperience.map((exp, index) => (
                            <div key={index} className="bg-slate-50/50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3 relative">
                              <button
                                type="button"
                                onClick={() => removeExperienceItem(index)}
                                className="absolute right-3 top-3 text-slate-400 hover:text-red-500 cursor-pointer"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>

                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                  <label className="block text-slate-500 dark:text-slate-455 text-[9px] font-bold uppercase mb-0.5">Empresa</label>
                                  <input 
                                    type="text" 
                                    value={exp.company} 
                                    onChange={(e) => handleExperienceItemChange(index, 'company', e.target.value)}
                                    className="w-full bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-indigo-400"
                                  />
                                </div>
                                <div>
                                  <label className="block text-slate-500 dark:text-slate-455 text-[9px] font-bold uppercase mb-0.5">Cargo / Puesto</label>
                                  <input 
                                    type="text" 
                                    value={exp.role} 
                                    onChange={(e) => handleExperienceItemChange(index, 'role', e.target.value)}
                                    className="w-full bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-indigo-400"
                                  />
                                </div>
                                <div>
                                  <label className="block text-slate-500 dark:text-slate-455 text-[9px] font-bold uppercase mb-0.5">Fecha Inicio</label>
                                  <input 
                                    type="text" 
                                    value={exp.start_date} 
                                    onChange={(e) => handleExperienceItemChange(index, 'start_date', e.target.value)}
                                    placeholder="AAAA-MM-DD o Mes AAAA"
                                    className="w-full bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-indigo-400"
                                  />
                                </div>
                                <div>
                                  <label className="block text-slate-500 dark:text-slate-455 text-[9px] font-bold uppercase mb-0.5">Fecha Fin (Vacio si es actual)</label>
                                  <input 
                                    type="text" 
                                    value={exp.end_date || ''} 
                                    onChange={(e) => handleExperienceItemChange(index, 'end_date', e.target.value)}
                                    placeholder="AAAA-MM-DD o Presente"
                                    className="w-full bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-indigo-400"
                                  />
                                </div>
                                <div className="sm:col-span-2">
                                  <label className="block text-slate-500 dark:text-slate-455 text-[9px] font-bold uppercase mb-0.5">Descripción de responsabilidades</label>
                                  <textarea 
                                    rows={6}
                                    value={exp.description || ''} 
                                    onChange={(e) => handleExperienceItemChange(index, 'description', e.target.value)}
                                    className="w-full bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-indigo-400"
                                  />
                                </div>
                              </div>
                            </div>
                          ))}

                          {cvExperience.length === 0 && (
                            <p className="text-xs text-slate-400 italic py-6 text-center">No has agregado experiencias laborales.</p>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Tab 4: Education */}
                    {activeEditorTab === 'education' && (
                      <div className="space-y-4">
                        <div className="flex justify-between items-center pb-2 border-b border-slate-100 dark:border-slate-800">
                          <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Historial Académico / Estudios</h4>
                          <button
                            type="button"
                            onClick={addEducationItem}
                            className="bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/40 text-indigo-650 dark:text-indigo-400 text-[10px] font-bold px-3 py-1.5 rounded-xl cursor-pointer transition-all flex items-center gap-1"
                          >
                            <Plus className="h-3.5 w-3.5" /> Agregar título
                          </button>
                        </div>

                        <div className="space-y-4 max-h-[400px] overflow-y-auto pr-1">
                          {cvEducation.map((edu, index) => (
                            <div key={index} className="bg-slate-50/50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3 relative">
                              <button
                                type="button"
                                onClick={() => removeEducationItem(index)}
                                className="absolute right-3 top-3 text-slate-400 hover:text-red-500 cursor-pointer"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>

                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                  <label className="block text-slate-500 dark:text-slate-455 text-[9px] font-bold uppercase mb-0.5">Institución académica</label>
                                  <input 
                                    type="text" 
                                    value={edu.institution} 
                                    onChange={(e) => handleEducationItemChange(index, 'institution', e.target.value)}
                                    className="w-full bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-indigo-400"
                                  />
                                </div>
                                <div>
                                  <label className="block text-slate-500 dark:text-slate-455 text-[9px] font-bold uppercase mb-0.5">Título / Grado obtenido</label>
                                  <input 
                                    type="text" 
                                    value={edu.degree} 
                                    onChange={(e) => handleEducationItemChange(index, 'degree', e.target.value)}
                                    className="w-full bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-indigo-400"
                                  />
                                </div>
                                <div>
                                  <label className="block text-slate-500 dark:text-slate-455 text-[9px] font-bold uppercase mb-0.5">Fecha Inicio</label>
                                  <input 
                                    type="text" 
                                    value={edu.start_date} 
                                    onChange={(e) => handleEducationItemChange(index, 'start_date', e.target.value)}
                                    placeholder="AAAA-MM-DD o Año"
                                    className="w-full bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-indigo-400"
                                  />
                                </div>
                                <div>
                                  <label className="block text-slate-500 dark:text-slate-455 text-[9px] font-bold uppercase mb-0.5">Fecha Fin (Vacio si continúa)</label>
                                  <input 
                                    type="text" 
                                    value={edu.end_date || ''} 
                                    onChange={(e) => handleEducationItemChange(index, 'end_date', e.target.value)}
                                    placeholder="AAAA-MM-DD o Año"
                                    className="w-full bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-indigo-400"
                                  />
                                </div>
                              </div>
                            </div>
                          ))}

                          {cvEducation.length === 0 && (
                            <p className="text-xs text-slate-400 italic py-6 text-center">No has agregado títulos o formación académica.</p>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Tab 5: Skills */}
                    {activeEditorTab === 'skills' && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-4">
                          <label className="block text-slate-505 dark:text-slate-400 text-[10px] font-bold uppercase tracking-wider pb-1 border-b border-slate-100 dark:border-slate-800">Habilidades Técnicas / Hard Skills</label>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={newTech}
                              onChange={(e) => setNewTech(e.target.value)}
                              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addSkill('tech'))}
                              placeholder="Ej: React, Python, Docker..."
                              className="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-indigo-500"
                            />
                            <button
                              type="button"
                              onClick={() => addSkill('tech')}
                              className="bg-indigo-650 hover:bg-indigo-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg cursor-pointer"
                            >
                              Agregar
                            </button>
                          </div>

                          <div className="flex flex-wrap gap-1.5 max-h-[220px] overflow-y-auto pr-1">
                            {cvTechSkills.map((skill) => (
                              <span
                                key={skill}
                                className="inline-flex items-center gap-1.5 bg-indigo-55/70 dark:bg-indigo-950/40 border border-indigo-100/60 dark:border-indigo-900/60 text-indigo-650 dark:text-indigo-400 px-2.5 py-1 rounded-xl text-xs font-semibold"
                              >
                                {skill}
                                <button
                                  type="button"
                                  onClick={() => removeSkill('tech', skill)}
                                  className="text-indigo-400 hover:text-indigo-600 font-black cursor-pointer text-[10px]"
                                >
                                  ×
                                </button>
                              </span>
                            ))}
                            {cvTechSkills.length === 0 && (
                              <p className="text-xs text-slate-400 italic">No has agregado habilidades técnicas.</p>
                            )}
                          </div>
                        </div>

                        <div className="space-y-4">
                          <label className="block text-slate-505 dark:text-slate-400 text-[10px] font-bold uppercase tracking-wider pb-1 border-b border-slate-100 dark:border-slate-800">Habilidades Blandas / Soft Skills</label>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={newSoft}
                              onChange={(e) => setNewSoft(e.target.value)}
                              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addSkill('soft'))}
                              placeholder="Ej: Liderazgo, Comunicación..."
                              className="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-indigo-500"
                            />
                            <button
                              type="button"
                              onClick={() => addSkill('soft')}
                              className="bg-indigo-650 hover:bg-indigo-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg cursor-pointer"
                            >
                              Agregar
                            </button>
                          </div>

                          <div className="flex flex-wrap gap-1.5 max-h-[220px] overflow-y-auto pr-1">
                            {cvSoftSkills.map((skill) => (
                              <span
                                key={skill}
                                className="inline-flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 text-slate-650 dark:text-slate-300 px-2.5 py-1 rounded-xl text-xs font-semibold"
                              >
                                {skill}
                                <button
                                  type="button"
                                  onClick={() => removeSkill('soft', skill)}
                                  className="text-slate-400 hover:text-slate-600 font-black cursor-pointer text-[10px]"
                                >
                                  ×
                                </button>
                              </span>
                            ))}
                            {cvSoftSkills.length === 0 && (
                              <p className="text-xs text-slate-400 italic">No has agregado habilidades blandas.</p>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Secondary Save Actions inside Paso 1 */}
                  <div className="flex justify-end pt-4 border-t border-slate-100 dark:border-slate-800">
                    <button
                      type="button"
                      disabled={savingProfileData}
                      onClick={() => handleSaveProfileData(false)}
                      className="bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      {savingProfileData && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      Guardar cambios de perfil
                    </button>
                  </div>
                  </div>
                  {livePreviewPanel}
                </div>
              )}

              {/* PASO 2: PERSONALIZACIÓN */}
              {cvStep === 2 && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start text-left">
                  <div className="lg:col-span-5 space-y-6">
                  
                  <div className="pb-3 border-b border-slate-100 dark:border-slate-800">
                    <h3 className="text-xs font-black uppercase text-slate-900 dark:text-white tracking-wider">Ajustes de personalización para el CV</h3>
                    <p className="text-[10px] text-slate-400 mt-1">Configura parámetros específicos que cambiarán el contenido del currículum generado por Inteligencia Artificial.</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div>
                      <label className="block text-slate-500 dark:text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1.5">Puesto Objetivo para este CV</label>
                      <input 
                        type="text" 
                        value={cvTargetRole} 
                        onChange={(e) => setCvTargetRole(e.target.value)}
                        placeholder="Ej: React Developer Junior"
                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl px-4 py-2.5 text-xs focus:outline-none focus:border-indigo-500 focus:bg-white"
                      />
                      <label className="flex items-center gap-2 mt-2 cursor-pointer text-[10px] font-semibold text-slate-500">
                        <input 
                          type="checkbox" 
                          checked={updateProfileTargetRole}
                          onChange={(e) => setUpdateProfileTargetRole(e.target.checked)}
                          className="rounded border-slate-300 dark:border-slate-700 focus:ring-indigo-500"
                        />
                        Guardar cargo objetivo modificado en mi Perfil principal
                      </label>
                    </div>

                    <div>
                      <label className="block text-slate-500 dark:text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1.5">Enfoque del Currículum</label>
                      <select
                        value={cvFocus}
                        onChange={(e) => setCvFocus(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl px-4 py-2.5 text-xs focus:outline-none focus:border-indigo-500 focus:bg-white"
                      >
                        <option value="ATS">ATS (Optimización de keywords y coherencia general) [Recomendado]</option>
                        <option value="técnico">Técnico (Foco en lenguajes, frameworks e infraestructuras)</option>
                        <option value="ejecutivo">Ejecutivo (Foco en metas, liderazgo, gestión y métricas de negocio)</option>
                        <option value="junior">Junior (Foco en proyectos académicos, potencial y capacidad de aprendizaje)</option>
                        <option value="senior">Senior (Foco en impacto cuantificable, mentoría y diseño de soluciones)</option>
                      </select>
                    </div>
                  </div>

                  {/* Selección de Experiencia */}
                  <div className="space-y-2.5 pt-2">
                    <label className="block text-slate-500 dark:text-slate-400 text-[10px] font-bold uppercase tracking-wider">Experiencias Laborales a Incluir</label>
                    
                    <div className="grid grid-cols-1 gap-2.5 max-h-[220px] overflow-y-auto pr-1">
                      {cvExperience.map((exp) => {
                        const isIncluded = !excludedExperienceIds.includes(exp.id);
                        
                        return (
                          <div 
                            key={exp.id} 
                            onClick={() => {
                              if (isIncluded) {
                                setExcludedExperienceIds([...excludedExperienceIds, exp.id]);
                              } else {
                                setExcludedExperienceIds(excludedExperienceIds.filter(id => id !== exp.id));
                              }
                            }}
                            className={`border rounded-xl p-3 flex items-start gap-3 cursor-pointer transition-all ${
                              isIncluded 
                                ? 'border-indigo-500/60 bg-indigo-50/10 dark:bg-indigo-950/10' 
                                : 'border-slate-200 dark:border-slate-800 opacity-60 hover:opacity-80'
                            }`}
                          >
                            <input 
                              type="checkbox" 
                              checked={isIncluded} 
                              readOnly 
                              className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                            />
                            <div className="text-xs">
                              <p className="font-bold text-slate-800 dark:text-slate-200">{exp.role} <span className="font-normal text-slate-450">en {exp.company}</span></p>
                              <p className="text-[10px] text-slate-400 mt-0.5">{exp.start_date} - {exp.end_date || 'Actual'}</p>
                            </div>
                          </div>
                        );
                      })}

                      {cvExperience.length === 0 && (
                        <p className="text-xs text-slate-400 italic">No tienes experiencias registradas en tu Perfil principal.</p>
                      )}
                    </div>
                  </div>

                  {/* Selección de Habilidades */}
                  <div className="space-y-3 pt-2">
                    <label className="block text-slate-500 dark:text-slate-400 text-[10px] font-bold uppercase tracking-wider">Habilidades a Incluir</label>
                    <p className="text-[9px] text-slate-450">Haz clic en una habilidad para excluirla/desactivarla temporalmente de la generación de este CV.</p>

                    <div className="space-y-2">
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Técnicas</p>
                      <div className="flex flex-wrap gap-1.5">
                        {cvTechSkills.map((skill) => {
                          const isExcluded = excludedSkills.includes(skill);
                          
                          return (
                            <button
                              key={skill}
                              type="button"
                              onClick={() => {
                                if (isExcluded) {
                                  setExcludedSkills(excludedSkills.filter(s => s !== skill));
                                } else {
                                  setExcludedSkills([...excludedSkills, skill]);
                                }
                              }}
                              className={`text-[10px] font-semibold px-2.5 py-1 rounded-xl transition-all cursor-pointer border ${
                                !isExcluded 
                                  ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-650 dark:text-indigo-400 border-indigo-100 dark:border-indigo-900/60' 
                                  : 'bg-slate-100 dark:bg-slate-800 text-slate-400 border-slate-200 dark:border-slate-750 line-through'
                              }`}
                            >
                              {skill}
                            </button>
                          );
                        })}
                        {cvTechSkills.length === 0 && <p className="text-xs text-slate-400 italic">Sin habilidades registradas.</p>}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Blandas</p>
                      <div className="flex flex-wrap gap-1.5">
                        {cvSoftSkills.map((skill) => {
                          const isExcluded = excludedSkills.includes(skill);
                          
                          return (
                            <button
                              key={skill}
                              type="button"
                              onClick={() => {
                                if (isExcluded) {
                                  setExcludedSkills(excludedSkills.filter(s => s !== skill));
                                } else {
                                  setExcludedSkills([...excludedSkills, skill]);
                                }
                              }}
                              className={`text-[10px] font-semibold px-2.5 py-1 rounded-xl transition-all cursor-pointer border ${
                                !isExcluded 
                                  ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-650 dark:text-indigo-400 border-indigo-100 dark:border-indigo-900/60' 
                                  : 'bg-slate-100 dark:bg-slate-800 text-slate-400 border-slate-200 dark:border-slate-750 line-through'
                              }`}
                            >
                              {skill}
                            </button>
                          );
                        })}
                        {cvSoftSkills.length === 0 && <p className="text-xs text-slate-400 italic">Sin habilidades registradas.</p>}
                      </div>
                    </div>
                  </div>
                  </div>
                  {livePreviewPanel}
                </div>
              )}

              {/* PASO 3: PLANTILLA & DISEÑO */}
              {cvStep === 3 && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start text-left">
                  <div className="lg:col-span-5 space-y-6">
                  
                  <div className="pb-3 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2">
                    <Sliders className="h-4.5 w-4.5 text-indigo-650" />
                    <div>
                      <h3 className="text-xs font-black uppercase text-slate-900 dark:text-white tracking-wider">Ajustes visuales y plantilla</h3>
                      <p className="text-[10px] text-slate-400 mt-1">Elige la plantilla y define los colores, fuentes y espaciado de tu currículum.</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    
                    {/* Selectores del customizer */}
                    <div className="space-y-5">
                      <TemplateSelector selected={template} onChange={setTemplate} />
                      <ColorSelector selected={color} onChange={setColor} />
                      <FontSelector selected={font} onChange={setFont} />
                    </div>

                    <div className="space-y-5">
                      {/* Tamaño de fuente */}
                      <div className="space-y-2">
                        <label className="block text-slate-500 dark:text-slate-400 text-[10px] font-bold uppercase tracking-wider">Tamaño de fuente</label>
                        <div className="flex gap-2">
                          {[
                            { id: 'small', name: 'Pequeño' },
                            { id: 'normal', name: 'Normal' },
                            { id: 'large', name: 'Grande' }
                          ].map((size) => {
                            const isActive = fontSize === size.id;
                            
                            return (
                              <button
                                key={size.id}
                                type="button"
                                onClick={() => setFontSize(size.id)}
                                className={`flex-1 border rounded-xl py-1.5 px-3 text-[11px] font-bold transition-all cursor-pointer text-center ${
                                  isActive
                                    ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-650 dark:text-indigo-400 ring-2 ring-indigo-500/10'
                                    : 'border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-100/40 dark:hover:bg-slate-800/40'
                                }`}
                              >
                                {size.name}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Espaciado */}
                      <div className="space-y-2">
                        <label className="block text-slate-500 dark:text-slate-400 text-[10px] font-bold uppercase tracking-wider">Espaciado</label>
                        <div className="flex gap-2">
                          {[
                            { id: 'compact', name: 'Compacto' },
                            { id: 'normal', name: 'Normal' },
                            { id: 'wide', name: 'Amplio' }
                          ].map((sp) => {
                            const isActive = spacing === sp.id;
                            
                            return (
                              <button
                                key={sp.id}
                                type="button"
                                onClick={() => setSpacing(sp.id)}
                                className={`flex-1 border rounded-xl py-1.5 px-3 text-[11px] font-bold transition-all cursor-pointer text-center ${
                                  isActive
                                    ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-650 dark:text-indigo-400 ring-2 ring-indigo-500/10'
                                    : 'border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-100/40 dark:hover:bg-slate-800/40'
                                }`}
                              >
                                {sp.name}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Info de Configuración visual */}
                      <div className="bg-slate-50 dark:bg-slate-800/40 border border-slate-150 dark:border-slate-850 rounded-xl p-3.5 space-y-1.5">
                        <p className="text-[10px] font-extrabold uppercase text-slate-450 tracking-wider">Estructura base del documento</p>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed">
                          La IA inyectará verbos de impacto que cumplan el estándar ATS en la plantilla elegida, usando tu paleta cromática e Inter/Roboto/Playfair según desees.
                        </p>
                      </div>

                      <div className="bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/40 rounded-xl p-3.5 space-y-1.5">
                        <p className="text-[10px] font-extrabold uppercase text-emerald-700 dark:text-emerald-400 tracking-wider">ATS-friendly</p>
                        <p className="text-[10px] text-slate-600 dark:text-slate-400 leading-relaxed">
                          Para superar filtros ATS, prioriza plantillas simples, secciones estándar, palabras clave del puesto, habilidades técnicas y logros cuantificables.
                        </p>
                      </div>
                    </div>

                  </div>

                  {/* Section Ordering Control */}
                  <div className="space-y-2 text-left">
                    <label className="block text-slate-500 dark:text-slate-400 text-[10px] font-bold uppercase tracking-wider">
                      Orden de secciones
                    </label>
                    <div className="space-y-1.5 bg-slate-50/40 dark:bg-slate-800/30 border border-slate-200/60 dark:border-slate-800 rounded-xl p-2.5">
                      {sectionOrder.map((secId, idx) => (
                        <div key={secId} className="flex justify-between items-center text-xs bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-800 rounded-lg p-1.5 px-2.5 shadow-sm">
                          <span className="font-semibold text-slate-700 dark:text-slate-300">{getSectionLabel(secId)}</span>
                          <div className="flex gap-1">
                            <button
                              type="button"
                              disabled={idx === 0}
                              onClick={() => moveSection(idx, -1)}
                              className="h-5 w-5 rounded bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-300 text-[9px] font-bold cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center"
                            >
                              ▲
                            </button>
                            <button
                              type="button"
                              disabled={idx === sectionOrder.length - 1}
                              onClick={() => moveSection(idx, 1)}
                              className="h-5 w-5 rounded bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-300 text-[9px] font-bold cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center"
                            >
                              ▼
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Section visibility Toggles */}
                  <SectionToggle sections={visibleSections} onChange={handleSectionToggleChange} />
                  </div>
                  {livePreviewPanel}
                </div>
              )}

              {/* PASO 4: PREVIEW & GENERACIÓN */}
              {cvStep === 4 && (
                generatingCv ? (
                  <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/60 rounded-2xl p-12 text-center max-w-lg mx-auto space-y-6 shadow-sm my-12 animate-fade-in">
                    <Loader2 className="h-10 w-10 text-indigo-650 animate-spin mx-auto" />
                    <div className="space-y-2">
                      <h4 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">{cvProgressStep}</h4>
                      <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                        La IA está diseñando tu CV optimizado para sistemas ATS. Esto puede tardar unos segundos.
                      </p>
                    </div>
                    {/* Visual Progress Bar */}
                    <div className="w-full bg-slate-100 dark:bg-slate-900 rounded-full h-1.5 overflow-hidden">
                      <div 
                        className="bg-indigo-600 h-1.5 rounded-full transition-all duration-500 animate-pulse" 
                        style={{ 
                          width: 
                            cvProgressStep.includes('Analizando') ? '25%' :
                            cvProgressStep.includes('Generando') ? '60%' :
                            cvProgressStep.includes('Optimizando') ? '85%' : '95%'
                        }} 
                      />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-6 text-left">
                    
                    <div className="pb-3 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
                      <div>
                        <h3 className="text-xs font-black uppercase text-slate-900 dark:text-white tracking-wider">Generación y Vista Previa</h3>
                        <p className="text-[10px] text-slate-400 mt-1">Revisa el borrador visual de tu currículum. Si estás listo, haz clic en "Generar CV con IA" para optimizar el contenido.</p>
                      </div>
                      {finalCvData && (
                        <button
                          onClick={handleGenerateCvAi}
                          disabled={generatingCv}
                          className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-indigo-600/10 disabled:opacity-50"
                        >
                          {generatingCv ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                          Regenerar con IA
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
                      
                      {/* Columna Izquierda: Acciones rápidas de IA */}
                      <div className="lg:col-span-4 bg-slate-50 dark:bg-slate-800/20 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 flex flex-col justify-between space-y-4">
                        
                        <div className="space-y-3.5">
                          <div className="text-xs font-extrabold uppercase text-slate-700 dark:text-slate-350 flex items-center gap-1">
                            <Settings className="h-4 w-4" /> Resumen de Opciones
                          </div>
                          <ul className="text-[11px] text-slate-650 dark:text-slate-400 space-y-1.5 list-disc pl-4 font-medium">
                            <li>Puesto: <span className="text-indigo-650 dark:text-indigo-400 font-bold">{cvTargetRole || '—'}</span></li>
                            <li>Enfoque: <span className="capitalize font-bold">{cvFocus}</span></li>
                            <li>Experiencias: <span className="font-bold">{cvExperience.length - excludedExperienceIds.length} de {cvExperience.length}</span></li>
                            <li>Habilidades: <span className="font-bold">{cvTechSkills.length + cvSoftSkills.length - excludedSkills.length} de {cvTechSkills.length + cvSoftSkills.length}</span></li>
                            <li>Diseño: <span className="font-bold capitalize">{template} | {color} | {font}</span></li>
                            <li>ATS: <span className="font-bold">keywords, secciones estándar y estructura legible</span></li>
                          </ul>
                        </div>

                        <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-2">
                          {finalCvData ? (
                            <div className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/40 rounded-xl p-3 text-xs text-emerald-850 dark:text-emerald-400 flex items-center gap-2 mb-3">
                              <CheckCircle className="h-4.5 w-4.5 text-emerald-600" />
                              <span className="font-bold">¡Tu CV optimizado ya está listo!</span>
                            </div>
                          ) : (
                            <button
                              onClick={handleGenerateCvAi}
                              disabled={generatingCv}
                              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-4 rounded-xl text-xs flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-indigo-600/10 disabled:opacity-50"
                            >
                              {generatingCv ? <Loader2 className="h-4.5 w-4.5 animate-spin" /> : <Sparkles className="h-4.5 w-4.5" />}
                              Generar CV con IA
                            </button>
                          )}
                        </div>

                      </div>

                      {/* Columna Derecha: Vista previa en tiempo real */}
                      <div className="lg:col-span-8 bg-slate-100 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex justify-center overflow-x-auto shadow-inner min-h-[480px]">
                        <CVPreview
                          profile={liveProfile}
                          cvData={finalCvData || {
                            headline: cvTargetRole,
                            professional_summary: cvBio,
                            work_experience: cvExperience.filter(w => !excludedExperienceIds.includes(w.id)),
                            academic_background: cvEducation,
                            skills_categories: {
                              languages_and_frameworks: cvTechSkills.filter(s => !excludedSkills.includes(s)),
                              tools_and_databases: [],
                              methodologies_and_soft_skills: cvSoftSkills.filter(s => !excludedSkills.includes(s))
                            },
                            soft_skills: cvSoftSkills.filter(s => !excludedSkills.includes(s))
                          }}
                          theme={{
                            template,
                            fontFamily: font,
                            primaryColor: color,
                            fontSize,
                            spacing,
                            headerStyle,
                            visibleSections,
                            sectionOrder
                          }}
                          sections={visibleSections}
                          sectionOrder={sectionOrder}
                        />
                      </div>

                    </div>

                  </div>
                )
              )}

              {/* PASO 5: ÉXITO */}
              {cvStep === 5 && (
                <>
                  <div className="flex flex-col items-center justify-center py-10 space-y-6 text-center animate-fade-in text-slate-800 dark:text-slate-200">
                    <div className="bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-450 border border-emerald-100 dark:border-emerald-900/40 h-20 w-20 rounded-full flex items-center justify-center shadow-md animate-bounce">
                      <CheckCircle className="h-10 w-10" />
                    </div>
                    <div className="space-y-2">
                      <h3 className="text-xl font-black text-slate-900 dark:text-white">¡Tu CV ha sido generado exitosamente!</h3>
                      <p className="text-slate-400 text-xs max-w-sm">
                        La Inteligencia Artificial ha reestructurado tu currículum inyectando verbos de impacto bajo el enfoque seleccionado. Ya puedes descargarlo en PDF.
                      </p>
                    </div>
                  </div>

                  {/* Canvas invisible pero presente para permitir la exportación a PDF */}
                  <div className="absolute left-[-9999px] top-[-9999px]">
                    <CVPreview
                      profile={liveProfile}
                      cvData={finalCvData}
                      theme={{
                        template,
                        fontFamily: font,
                        primaryColor: color,
                        fontSize,
                        spacing,
                        headerStyle,
                        visibleSections,
                        sectionOrder
                      }}
                      sections={visibleSections}
                      sectionOrder={sectionOrder}
                    />
                  </div>
                </>
              )}
            </div>

            {cvStep === 5 && (
            <div className="flex justify-center items-center pt-6 border-t border-slate-100 dark:border-slate-800 mt-8">
                <div className="flex flex-col sm:flex-row gap-3 w-full justify-center">
                  <button
                    onClick={handleDownloadPdf}
                    disabled={downloadingCv}
                    className="bg-indigo-650 hover:bg-indigo-700 text-white font-bold px-6 py-3 rounded-xl text-xs flex items-center justify-center gap-2 shadow-md shadow-indigo-650/20 cursor-pointer disabled:opacity-50"
                  >
                    {downloadingCv ? (
                      <>
                        <Loader2 className="h-4.5 w-4.5 animate-spin" />
                        Generando PDF...
                      </>
                    ) : (
                      <>
                        <Download className="h-4.5 w-4.5" />
                        Descargar CV (PDF)
                      </>
                    )}
                  </button>
                  <button
                    onClick={handleSaveCvDraft}
                    className="bg-indigo-55/50 hover:bg-indigo-100 text-indigo-600 font-bold px-6 py-3 rounded-xl text-xs transition-all cursor-pointer"
                  >
                    Guardar como borrador
                  </button>
                  <button
                    onClick={() => {
                      if (typeof navigateTo === 'function') {
                        navigateTo('/dashboard');
                      } else {
                        setDocType('select');
                        setCvStep(1);
                      }
                    }}
                    className="border border-slate-200 hover:bg-slate-50 text-slate-650 font-bold px-6 py-3 rounded-xl text-xs transition-colors cursor-pointer"
                  >
                    Volver
                  </button>
                </div>
            </div>
            )}

          </div>
        </div>
      ) : (
        /* ========================================================= */
        /* CARTA DE PRESENTACIÓN */
        /* ========================================================= */
        <div className="mx-auto w-full max-w-[1600px] space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">

            {/* Izquierda: Formulario e Historial Estructurado */}
            <div className="lg:col-span-5 space-y-6">
              
              {/* Input Oferta Estructurado */}
              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wide flex items-center gap-1.5">
                  <Mail className="h-4.5 w-4.5 text-indigo-600" />
                  Nueva carta de presentación
                </h3>
                <p className="text-[10px] text-slate-400">Genera cartas de presentación adaptadas a las exigencias corporativas. Ingresa los datos del puesto para alinear tu perfil con la vacante.</p>
                
                <div className="space-y-3">
                  <div>
                    <label className="block text-slate-500 text-[9px] font-bold uppercase tracking-wider mb-1">Empresa</label>
                    <input
                      type="text"
                      value={company}
                      onChange={(e) => setCompany(e.target.value)}
                      placeholder="ej: TechCorp"
                      className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-indigo-500 focus:bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-500 text-[9px] font-bold uppercase tracking-wider mb-1">Puesto objetivo</label>
                    <input
                      type="text"
                      value={targetRole}
                      onChange={(e) => setTargetRole(e.target.value)}
                      placeholder="ej: Desarrollador React Junior"
                      className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-indigo-500 focus:bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-500 text-[9px] font-bold uppercase tracking-wider mb-1">Descripción de la vacante</label>
                    <textarea
                      rows={4}
                      value={jobDescription}
                      onChange={(e) => setJobDescription(e.target.value)}
                      placeholder="Buscamos desarrollador frontend junior con conocimientos en React, Tailwind y Git..."
                      className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-xl p-3 text-xs focus:outline-none focus:border-indigo-500 focus:bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-500 text-[9px] font-bold uppercase tracking-wider mb-1">Tono de la carta</label>
                    <select
                      value={tone}
                      onChange={(e) => setTone(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 text-slate-950 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-indigo-500 focus:bg-white font-semibold"
                    >
                      <option value="formal">Formal</option>
                      <option value="profesional">Profesional</option>
                      <option value="cercano">Cercano</option>
                    </select>
                  </div>
                </div>

                {generatingLetter ? (
                  <div className="text-center py-2 space-y-1">
                    <Loader2 className="h-5 w-5 text-indigo-650 animate-spin mx-auto" />
                    <span className="text-[9px] text-indigo-600 animate-pulse font-semibold">Alineando competencias...</span>
                  </div>
                ) : (
                  <button
                    onClick={handleGenerateLetterAi}
                    disabled={!jobDescription.trim()}
                    className="w-full bg-indigo-650 hover:bg-indigo-700 text-white font-bold py-2.5 rounded-xl text-xs transition-all shadow-sm disabled:opacity-40 cursor-pointer"
                  >
                    Redactar Carta con IA
                  </button>
                )}
              </div>

              {/* Historial */}
              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wide">Cartas Anteriores</h4>
                <div className="space-y-2 max-h-[180px] overflow-y-auto pr-1">
                  {pastLetters.map((l) => (
                    <div
                      key={l.id}
                      className="w-full flex items-center justify-between bg-slate-50 border border-slate-150 rounded-xl p-2.5 transition-all hover:border-indigo-400/40 text-xs gap-2 group"
                    >
                      <button
                        type="button"
                        onClick={() => { 
                          setLetterContent(l.letter_content); 
                          setJobOfferText(l.job_offer_text); 
                          setLetterId(l.id);
                          const lines = l.job_offer_text.split('\n');
                          let parsedCompany = l.company || '';
                          let parsedRole = l.target_role || '';
                          let parsedDesc = l.job_description || l.job_offer_text;
                          if (!parsedCompany || !parsedRole) {
                            lines.forEach(line => {
                              if (line.startsWith('Empresa:')) parsedCompany = line.replace('Empresa:', '').trim();
                              if (line.startsWith('Puesto Objetivo:')) parsedRole = line.replace('Puesto Objetivo:', '').trim();
                              if (line.startsWith('Descripción de la Vacante:')) parsedDesc = line.replace('Descripción de la Vacante:', '').trim();
                            });
                          }
                          setCompany(parsedCompany);
                          setTargetRole(parsedRole);
                          setJobDescription(parsedDesc);
                        }}
                        className="flex-1 text-left font-semibold text-slate-700 hover:text-indigo-650 truncate cursor-pointer"
                      >
                        <div className="font-bold text-slate-900 truncate">
                          {l.document_title || (l.company ? `${l.company}` : 'Carta de presentación')}
                        </div>
                        {l.target_role && (
                          <div className="text-[9px] text-slate-400 truncate">
                            {l.target_role}
                          </div>
                        )}
                      </button>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {l.status && (
                          <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded ${
                            l.status === 'draft' ? 'bg-amber-50 text-amber-600 border border-amber-100' :
                            l.status === 'downloaded' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' :
                            'bg-indigo-50 text-indigo-600 border border-indigo-100'
                          }`}>
                            {l.status === 'draft' ? 'Borrador' : l.status === 'downloaded' ? 'Descargado' : 'Generado'}
                          </span>
                        )}
                        <Trash2 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteLetter(l.id);
                          }}
                          className="h-3.5 w-3.5 text-slate-400 hover:text-red-500 cursor-pointer transition-colors opacity-0 group-hover:opacity-100"
                        />
                      </div>
                    </div>
                  ))}
                  {pastLetters.length === 0 && <p className="text-center text-slate-400 text-[10px] py-4">Aún no tienes cartas guardadas.</p>}
                </div>
              </div>

            </div>

            {/* Derecha: Visualizador */}
            <div className="lg:col-span-7 flex flex-col">
              {generatingLetter ? (
                <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-slate-400 flex-1 flex flex-col items-center justify-center min-h-[380px] shadow-sm space-y-4 animate-fade-in">
                  <Loader2 className="h-8 w-8 text-indigo-650 animate-spin" />
                  <div className="space-y-1">
                    <span className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider block">{letterProgressStep}</span>
                    <p className="text-[10px] text-slate-400 max-w-[220px] leading-normal mx-auto">
                      Redactando tu carta de presentación adaptada al puesto y perfil. Esto puede tardar unos segundos.
                    </p>
                  </div>
                </div>
              ) : letterContent ? (
                <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex-1 flex flex-col space-y-4">
                  <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                    <span className="text-[10px] text-slate-400 font-bold uppercase">Resultado de Redacción (Editable)</span>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={handleCopyLetter}
                        className="bg-slate-100 hover:bg-indigo-650 hover:text-white text-slate-600 text-[10px] font-bold px-3 py-1.5 rounded-lg flex items-center gap-1 transition-all duration-200 cursor-pointer"
                      >
                        {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                        {copied ? 'Copiada' : 'Copiar'}
                      </button>
                      <button
                        onClick={handleDownloadLetterPdf}
                        disabled={downloadingLetter}
                        className="bg-emerald-50 hover:bg-emerald-600 hover:text-white text-emerald-600 text-[10px] font-bold px-3 py-1.5 rounded-lg flex items-center gap-1 transition-all duration-200 cursor-pointer disabled:opacity-50"
                      >
                        {downloadingLetter ? (
                          <>
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            Generando PDF...
                          </>
                        ) : (
                          <>
                            <Download className="h-3.5 w-3.5" />
                            Descargar PDF
                          </>
                        )}
                      </button>
                      <button
                        onClick={handleSaveLetterDraft}
                        className="bg-indigo-55/60 hover:bg-indigo-650 hover:text-white text-indigo-650 text-[10px] font-bold px-3 py-1.5 rounded-lg flex items-center gap-1 transition-all duration-200 cursor-pointer"
                      >
                        Guardar como borrador
                      </button>
                    </div>
                  </div>
                  
                  <textarea
                    value={letterContent}
                    onChange={(e) => setLetterContent(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200/60 p-5 rounded-xl text-slate-700 font-serif text-xs md:text-sm leading-relaxed whitespace-pre-wrap flex-1 min-h-[350px] resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-justify"
                  />
                </div>
              ) : (
                <div className="bg-white border border-dashed border-slate-200 rounded-2xl p-12 text-center text-slate-400 flex-1 flex flex-col items-center justify-center min-h-[380px] shadow-sm">
                  <Mail className="h-8 w-8 text-slate-300 mb-3" />
                  <p className="text-xs leading-relaxed max-w-xs">
                    Rellena la vacante laboral a la izquierda y presiona "Redactar Carta con IA" para visualizar el documento formal aquí.
                  </p>
                </div>
              )}
            </div>

          </div>

          {/* Canvas invisible para la exportación a PDF */}
          {letterContent && (
            <div className="absolute left-[-9999px] top-[-9999px]">
              {renderLetterCanvas()}
            </div>
          )}
        </div>
      )}

    </div>
  );
}
