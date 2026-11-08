import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../utils/supabaseClient';
import { loadUserSnapshot } from '../utils/userDataApi';
import { apiRequest } from '../utils/api';
import { useNotification } from '../components/common/notificationContext';
import ProfileSectionTabs from '../components/common/ProfileSectionTabs';
import ConfirmDialog from '../components/common/ConfirmDialog';
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
  Pencil
} from 'lucide-react';
import CVPreview from '../components/cv/CVPreview';
import CvContentEditor from '../components/cv/CvContentEditor';
import ImportCvModal from '../components/documents/ImportCvModal';
import { importedCvFields } from '../utils/cvImport';
import TemplateSelector from '../components/cv/TemplateSelector';
import ColorSelector from '../components/cv/ColorSelector';
import FontSelector from '../components/cv/FontSelector';
import SectionToggle from '../components/cv/SectionToggle';
import { applyManualCvEdits, createCvDocumentData, prepareCvGeneration, restoreCvDocument, restoreCvTheme, restoreLetterDocument, letterContextSnapshot, readStoredCvTheme, cvEditorSnapshot } from '../utils/documentDrafts';
import { protectUnsavedChanges } from '../utils/unsavedChanges';
import { cvDraftPath, letterDraftPath } from '../utils/documentDraftRoute';
import { missingProfileSaveFields, profileSaveIssues } from '../utils/profileSaveIssues';
import { recordGenerationAttempt } from '../utils/documentGenerationMetrics';
import { completeDocumentVisit, markDocumentGenerated } from '../utils/documentPreparationTiming';
import { PILOT_BUILD } from '../utils/pi2Validation';

function recordDocumentOperation(userId, type, startedAt, success, regeneration, finishedAt = performance.now()) {
  if (!userId) return;
  const attempt = type === 'cv' || type === 'letter'
    ? recordGenerationAttempt(userId, type, startedAt, success, regeneration)
    : { id: crypto.randomUUID(), durationMs: Math.round(finishedAt - startedAt) };
  if (attempt.durationMs < 0 || attempt.durationMs > 86400000) return;
  void supabase.rpc('pi2_record_generation', {
    p_id: attempt.id, p_user_id: userId, p_type: type, p_duration_ms: attempt.durationMs,
    p_success: success, p_regeneration: regeneration, p_build: PILOT_BUILD,
  }).then(({ error }) => {
    if (error && error.code !== 'PGRST202') console.warn('No se pudo registrar la medición del piloto.', error.code);
  });
}


const ensureItemIds = (items, prefix) => (items || []).map((item, index) => ({
  ...item,
  id: item.id || `${prefix}-temp-${index}-${Date.now()}-${Math.random()}`
}));

function linkSavedCvStudies(document, profileStudies) {
  const field = Array.isArray(document?.academic_background) ? 'academic_background' : 'education';
  if (!Array.isArray(document?.[field])) return document;
  const normalize = (value) => String(value ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('es');
  return {
    ...document,
    [field]: document[field].map((study) => {
      if (!study || profileStudies.some(({ id }) => id === study.id)) return study;
      const matches = profileStudies.filter((record) => ['institution', 'degree', 'start_date']
        .every((key) => normalize(record[key]) === normalize(study[key])));
      return matches.length === 1 ? { ...study, id: matches[0].id } : study;
    }),
  };
}

const normalizeSkillList = (skills) => {
  if (Array.isArray(skills)) return skills.filter((skill) => typeof skill === 'string');
  if (!skills || typeof skills !== 'object') return [];
  return Object.values(skills)
    .filter(Array.isArray)
    .flat()
    .filter((skill) => typeof skill === 'string');
};

function cvNarrative(document, visibleSections) {
  const cv = restoreCvDocument(document);
  const normalizeText = (value) => value.trim().replace(/\s+/g, ' ');
  return {
    summary: visibleSections.professionalSummary === false ? '' : normalizeText(cv.bio),
    bullets: visibleSections.experience === false ? [] : cv.work_experience
      .filter((record) => !record.hidden_from_cv)
      .flatMap(({ description }) => description.split('\n')).map(normalizeText).filter(Boolean),
  };
}

function useTemporaryNotice(durationMs) {
  const [notice, setNotice] = useState(null);
  const showNotice = useCallback((value) => setNotice(value ? { value } : null), []);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(null), durationMs);
    return () => window.clearTimeout(timeout);
  }, [notice, durationMs]);

  return [notice?.value, showNotice];
}

export default function Documents({ initialDocType = 'select', navigateTo, mode = 'document', openImportOnMount = false, openTargetOnMount = false, documentDraft, replaceDocumentPath, resumeLatestLetter = false, documentVisitRef }) {
  const isProfileEditor = mode === 'profile';
  const draftId = documentDraft?.id;
  const draftAsCopy = documentDraft?.asCopy;
  const { toast, showConfirm } = useNotification();
  const savingCvProfileItem = useRef(false);
  const [savingToProfile, setSavingToProfile] = useState(false);
  const completedGenerationRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [errorMsg, setErrorMsg] = useTemporaryNotice(5000);
  // Error al CARGAR los datos del wizard (red/servidor), distinto de "perfil incompleto"
  const [loadError, setLoadError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [successMsg, setSuccessMsg] = useTemporaryNotice(4000);
  const [profileSaveError, setProfileSaveError] = useTemporaryNotice(5000);
  const [showMissingProfileFields, setShowMissingProfileFields] = useState(false);
  const [profileServerErrorTabs, setProfileServerErrorTabs] = useState([]);
  const profileSaveErrorRef = useRef(null);

  useEffect(() => {
    if (profileSaveError) profileSaveErrorRef.current?.focus();
  }, [profileSaveError]);

  // Estados de Tipo de Documento: 'select' | 'cv' | 'letter'
  const [docType, setDocType] = useState(initialDocType);

  useEffect(() => {
    setDocType(initialDocType);
  }, [initialDocType]);

  // ==========================================
  // ESTADOS DEL WIZARD DE CV (Figura 12)
  // ==========================================
  // Pasos: 1 (Datos del CV), 2 (Personalización), 3 (Diseño), 4 (Vista previa)
  const [cvStep, setCvStep] = useState(isProfileEditor ? 1 : 2);
  const [cvFirstName, setCvFirstName] = useState('');
  const [cvLastName, setCvLastName] = useState('');
  const [cvEmail, setCvEmail] = useState('');
  const [cvPhone, setCvPhone] = useState('');
  const [cvLocation, setCvLocation] = useState('');
  const [cvLinkedin, setCvLinkedin] = useState('');
  const [cvPortfolio, setCvPortfolio] = useState('');
  const [cvCertifications, setCvCertifications] = useState([]);
  const [cvCareer, setCvCareer] = useState('');
  const [cvTargetRole, setCvTargetRole] = useState('');
  const [cvTargetJobDescription, setCvTargetJobDescription] = useState('');
  const [savingDefaultTarget, setSavingDefaultTarget] = useState(false);
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

  // Estados de Estilo de Plantilla y Diseño del CV
  const [initialTheme] = useState(() => readStoredCvTheme(localStorage));
  const [template, setTemplate] = useState(initialTheme.template);
  const [color, setColor] = useState(initialTheme.primaryColor);
  const [font, setFont] = useState(initialTheme.fontFamily);
  const [fontSize, setFontSize] = useState(initialTheme.fontSize);
  const [spacing, setSpacing] = useState(initialTheme.spacing);
  const [headerStyle, setHeaderStyle] = useState(initialTheme.headerStyle);
  const [visibleSections, setVisibleSections] = useState(initialTheme.visibleSections);
  const [sectionOrder, setSectionOrder] = useState(initialTheme.sectionOrder);

  // IA y PDF
  const [generatingCv, setGeneratingCv] = useState(false);
  const [cvProgressStep, setCvProgressStep] = useState('');
  const [downloadingCv, setDownloadingCv] = useState(false);
  const [savingCvDraft, setSavingCvDraft] = useState(false);
  const [hasUnpersistedCv, setHasUnpersistedCv] = useState(false);
  const [pendingDocumentExit, setPendingDocumentExit] = useState(null);
  const confirmedDocumentExit = useRef(null);
  const [finalCvData, setFinalCvData] = useState(null);
  const [showCvContentEditor, setShowCvContentEditor] = useState(false);
  const [showImportModal, setShowImportModal] = useState(openImportOnMount);
  const [cvId, setCvId] = useState(null);
  const [cvTitle, setCvTitle] = useState('');
  const [copySourceTitle, setCopySourceTitle] = useState('');
  const [letterProgressStep, setLetterProgressStep] = useState('');

  // Instantáneas para guardado explícito y detección de cambios.
  const [lastSavedSnapshot, setLastSavedSnapshot] = useState(null);
  const [savedTheme, setSavedTheme] = useState(initialTheme);
  const [savedLetterSnapshot, setSavedLetterSnapshot] = useState(null);

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
  useEffect(() => {
    const attempt = completedGenerationRef.current;
    if (!attempt || generatingCv || generatingLetter) return;
    completedGenerationRef.current = null;
    markDocumentGenerated(attempt.visit, attempt.regeneration);
    recordDocumentOperation(attempt.userId, attempt.type, attempt.startedAt, true, attempt.regeneration);
  }, [generatingCv, generatingLetter]);
  const [copied, setCopied] = useState(false);
  const [downloadingLetter, setDownloadingLetter] = useState(false);
  const [savingLetterDraft, setSavingLetterDraft] = useState(false);
  const [letterId, setLetterId] = useState(null);
  const [hasUnpersistedLetter, setHasUnpersistedLetter] = useState(false);
  const [generatedLetterContext, setGeneratedLetterContext] = useState('');



  const applyLetterDocument = (letter, asCopy = false) => {
    const saved = restoreLetterDocument(letter, { asCopy });
    setLetterId(saved.id);
    setLetterContent(saved.content);
    setJobOfferText(saved.jobOfferText);
    setCompany(saved.company);
    setTargetRole(saved.targetRole);
    setJobDescription(saved.jobDescription);
    setTone(saved.tone);
    setGeneratedLetterContext(letterContextSnapshot(saved));
    setHasUnpersistedLetter(false);
    setSavedLetterSnapshot({ content: saved.content, company: saved.company, targetRole: saved.targetRole, jobDescription: saved.jobDescription, tone: saved.tone });
  };

  useEffect(() => {
    let active = true;
    const editCvId = !isProfileEditor && docType === 'cv' ? draftId : null;
    const useCvAsCopy = Boolean(editCvId && draftAsCopy);
    const editLetterId = docType === 'letter' ? draftId : null;
    const historical = !isProfileEditor && docType === 'cv' && !editCvId
      ? localStorage.getItem('empleaia_historical_cv_data')
      : null;
    const loadWizardData = async () => {
      setLoading(true);
      setErrorMsg('');
      setLoadError('');
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!active || !session) return;
        const uid = session.user.id;
        const snapshot = await loadUserSnapshot(uid);
        if (!active) return;
        if (resumeLatestLetter) {
          // The snapshot returns letters ordered by creation date, newest first.
          const latestLetter = snapshot.letters.find((letter) => letter.id && letter.letter_content?.trim());
          if (latestLetter) {
            replaceDocumentPath(letterDraftPath(latestLetter.id, true));
            return;
          }
        }
        const master = { ...snapshot.profile, id: uid, academic_background: snapshot.academic || [], work_experience: snapshot.work || [] };
        setProfile(master);

        const savedCv = editCvId ? (snapshot.cvs || []).find((cv) => cv.id === editCvId) : null;
        const savedLetter = editLetterId ? (snapshot.letters || []).find((letter) => letter.id === editLetterId) : null;
        if ((editCvId && !savedCv) || (editLetterId && !savedLetter)) {
          throw new Error('El borrador seleccionado no está disponible. Vuelve a Mis borradores y selecciónalo nuevamente.');
        }
        if (savedCv && (!savedCv.cv_data || typeof savedCv.cv_data !== 'object')) {
          throw new Error('Este borrador no contiene un CV válido. Vuelve a Mis borradores y selecciona otra versión.');
        }
        if (savedLetter) {
          applyLetterDocument(savedLetter, draftAsCopy);
        } else if (docType === 'letter') {
          applyLetterDocument({
            target_role: master.target_role,
            job_description: master.target_job_description,
          });
        }

        const savedData = linkSavedCvStudies(savedCv?.cv_data || (historical ? JSON.parse(historical) : null), master.academic_background);
        const editor = savedData
          ? restoreCvDocument(savedData)
          : { ...master, email: master.contact_email ?? master.email ?? '' };
        setCvFirstName(editor.first_name || '');
        setCvLastName(editor.last_name || '');
        setCvEmail(editor.email || '');
        setCvPhone(editor.phone || '');
        setCvLocation(editor.location || '');
        setCvLinkedin(editor.linkedin || editor.linkedin_url || '');
        setCvPortfolio(editor.portfolio || '');
        setCvCareer(editor.career || '');
        setCvTargetRole(editor.target_role || '');
        setCvTargetJobDescription(editor.target_job_description || '');
        const sourceBio = savedData?.source_bio ?? editor.bio ?? '';
        setCvBio(sourceBio);
        setCvTechSkills(normalizeSkillList(editor.technical_skills));
        setCvSoftSkills(Array.isArray(editor.soft_skills) ? editor.soft_skills : []);
        setCvCertifications(Array.isArray(editor.certifications) ? editor.certifications : []);
        const experience = ensureItemIds(editor.work_experience, 'exp');
        const education = ensureItemIds(editor.academic_background, 'edu');
        setCvExperience(experience);
        setCvEducation(education);
        setFinalCvData(savedData);
        setHasUnpersistedCv(useCvAsCopy);
        setCvId(useCvAsCopy ? null : savedCv?.id || null);
        setCvTitle(savedCv?.document_title || '');
        setCopySourceTitle(useCvAsCopy ? savedCv?.document_title || 'CV' : '');
        setShowCvContentEditor(Boolean(savedCv));
        setCvStep(isProfileEditor ? 1 : savedData && !openTargetOnMount ? 4 : 2);
        setCvFocus(editor.cv_focus || 'ATS');
        setLastSavedSnapshot({ ...editor, bio: sourceBio, work_experience: experience, academic_background: education });

        if (savedCv) {
          const style = restoreCvTheme(savedCv.cv_style);
          setSavedTheme(style);
          setTemplate(style.template);
          setColor(style.primaryColor);
          setFont(style.fontFamily);
          setFontSize(style.fontSize);
          setSpacing(style.spacing);
          setHeaderStyle(style.headerStyle);
          setVisibleSections(style.visibleSections);
          setSectionOrder(style.sectionOrder);
          if (!savedData?.personal_info && !savedData?.first_name) {
            setSuccessMsg('Este borrador antiguo no guardó los datos personales originales. Se conserva su contenido; revisa los campos vacíos antes de guardarlo.');
          }
        }
        if (historical) localStorage.removeItem('empleaia_historical_cv_data');
      } catch (err) {
        if (active && err.code !== 'SESSION_EXPIRED') setLoadError(mapError(err));
      } finally {
        if (active) setLoading(false);
      }
    };
    loadWizardData();
    return () => { active = false; };
  }, [docType, reloadKey, isProfileEditor, draftId, draftAsCopy, resumeLatestLetter, openTargetOnMount, replaceDocumentPath, setErrorMsg, setSuccessMsg]);

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
  const nextStep = () => setCvStep(prev => Math.min(prev + 1, 4));
  const prevStep = () => setCvStep(prev => Math.max(prev - 1, 2));

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

  const persistProfileData = async () => {
    if (!profile?.id) throw new Error('No se encontró ID de perfil válido.');
    if (!isProfileEditor) throw new Error('Abre Mi perfil para actualizar tus datos profesionales.');

    const profilePayload = {
      first_name: cvFirstName,
      last_name: cvLastName,
      ...(Object.hasOwn(profile, 'contact_email') || cvEmail !== (profile.email ?? '')
        ? { contact_email: cvEmail.trim() }
        : {}),
      phone: cvPhone,
      location: cvLocation,
      linkedin: cvLinkedin,
      portfolio: cvPortfolio,
      certifications: cvCertifications,
      career: cvCareer,
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
    setProfile({
      ...refreshed.profile,
      work_experience: refreshedExperience,
      academic_background: refreshedEducation
    });
    setCvExperience(refreshedExperience);
    setCvEducation(refreshedEducation);
    setLastSavedSnapshot({
      first_name: cvFirstName,
      last_name: cvLastName,
      email: cvEmail,
      phone: cvPhone,
      location: cvLocation,
      linkedin: cvLinkedin,
      portfolio: cvPortfolio,
      certifications: cvCertifications,
      career: cvCareer,
      target_role: cvTargetRole,
      target_job_description: cvTargetJobDescription,
      bio: cvBio,
      technical_skills: cvTechSkills,
      soft_skills: cvSoftSkills,
      work_experience: refreshedExperience,
      academic_background: refreshedEducation
    });

  };

  const savedTargetRole = profile?.target_role?.trim() || '';
  const savedTargetDescription = profile?.target_job_description?.trim() || '';
  const hasCompleteCvTarget = Boolean(cvTargetRole.trim() && cvTargetJobDescription.trim());
  const defaultTargetMatches = cvTargetRole.trim() === savedTargetRole
    && cvTargetJobDescription.trim() === savedTargetDescription;

  const handleSaveDefaultTarget = async () => {
    if (!profile?.id || !hasCompleteCvTarget || defaultTargetMatches || savingDefaultTarget) return;

    const target = {
      target_role: cvTargetRole.trim(),
      target_job_description: cvTargetJobDescription.trim(),
    };
    setSavingDefaultTarget(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      await apiRequest(`/profile/${profile.id}`, 'PUT', target);
      setProfile((current) => ({ ...current, ...target }));
      setSuccessMsg('Puesto objetivo guardado para cartas y entrevistas.');
    } catch (err) {
      setErrorMsg(mapError(err));
    } finally {
      setSavingDefaultTarget(false);
    }
  };

  const missingProfileFields = isProfileEditor
    ? missingProfileSaveFields({
      firstName: cvFirstName, lastName: cvLastName,
      phone: cvPhone, contactEmail: cvEmail,
      work: cvExperience, academic: cvEducation,
    })
    : [];
  const invalidProfileTabs = showMissingProfileFields
    ? missingProfileFields.map(({ tab }) => tab)
    : profileServerErrorTabs;

  const handleSaveProfileData = async () => {
    setSuccessMsg('');
    setProfileServerErrorTabs([]);
    setShowMissingProfileFields(missingProfileFields.length > 0);
    if (missingProfileFields.length) {
      setActiveEditorTab(missingProfileFields[0].tab);
      setProfileSaveError({ title: 'Es obligatorio completar los campos marcados', issues: missingProfileFields });
      return;
    }
    setProfileSaveError(null);
    setSavingProfileData(true);
    try {
      await persistProfileData();
      setPendingDocumentExit(null);
      setSuccessMsg('Perfil guardado.');
    } catch (err) {
      const issues = profileSaveIssues(err.details);
      setProfileServerErrorTabs(issues.map(({ tab }) => tab));
      if (issues.length) setActiveEditorTab(issues[0].tab);
      setProfileSaveError({
        title: issues.length ? 'Revisa estos campos para guardar' : 'No se pudo guardar el perfil',
        message: 'Tus cambios siguen en el formulario. Vuelve a intentar guardarlos.',
        issues,
      });
    } finally {
      setSavingProfileData(false);
    }
  };

  const requiredProfileInput = (value) => ({
    'aria-required': isProfileEditor || undefined,
    'aria-invalid': isProfileEditor && showMissingProfileFields
      ? !String(value ?? '').trim()
      : undefined,
  });

  const hasChanges = () => {
    if (!lastSavedSnapshot) return false;
    const current = {
      first_name: cvFirstName,
      last_name: cvLastName,
      email: cvEmail,
      phone: cvPhone,
      location: cvLocation,
      linkedin: cvLinkedin,
      portfolio: cvPortfolio,
      certifications: cvCertifications,
      career: cvCareer,
      target_role: cvTargetRole,
      target_job_description: cvTargetJobDescription,
      bio: cvBio,
      technical_skills: cvTechSkills,
      soft_skills: cvSoftSkills,
      work_experience: cvExperience,
      academic_background: cvEducation,
      cv_focus: cvFocus,
    };
    return JSON.stringify(cvEditorSnapshot(current)) !== JSON.stringify(cvEditorSnapshot(lastSavedSnapshot));
  };

  // Cambiar de pestaña o avanzar nunca escribe en el perfil maestro.

  const addExperienceItem = () => {
    setCvExperience([...cvExperience, { id: `exp-temp-${Date.now()}-${Math.random()}`, company: '', role: '', start_date: '', end_date: '', description: '', achievements: [] }]);
  };

  const removeExperienceItem = (index) => {
    setCvExperience(cvExperience.filter((_, i) => i !== index));
  };

  const handleExperienceItemChange = (index, field, value) => {
    setCvExperience((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item));
  };

  const addEducationItem = () => {
    setCvEducation([...cvEducation, { id: `edu-temp-${Date.now()}-${Math.random()}`, institution: '', degree: '', start_date: '', end_date: '' }]);
  };

  const removeEducationItem = (index) => {
    setCvEducation(cvEducation.filter((_, i) => i !== index));
  };

  const handleEducationItemChange = (index, field, value) => {
    setCvEducation((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item));
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

  const getDocumentVisit = (type) => {
    const visit = documentVisitRef?.current;
    return visit?.type === type && visit.userId === profile?.id ? visit : null;
  };

  const recordPdfOperation = (type, startedAt, success, visit) => {
    const finishedAt = performance.now();
    recordDocumentOperation(profile?.id, `${type}_pdf`, startedAt, success, false, finishedAt);
    if (!success || !visit || visit !== documentVisitRef?.current) return;
    const preparation = completeDocumentVisit(visit);
    if (preparation) {
      recordDocumentOperation(preparation.userId, `${type}_preparation`, preparation.startedAt, true, preparation.regeneration, finishedAt);
    }
  };

  // GENERAR CV POR IA LLAMANDO A NUESTRO SERVIDOR NODE/EXPRESS (Backend)
  const handleGenerateCvAi = async () => {
    if (cvActionInProgress) return;
    const startedAt = performance.now();
    const visit = getDocumentVisit('cv');
    const previousNarrative = finalCvData ? cvNarrative(finalCvData, visibleSections) : null;
    const { candidate, preservedContent } = prepareCvGeneration(currentEditorData(), finalCvData, visibleSections);
    setCvStep(4);
    setGeneratingCv(true);
    setCvProgressStep('Analizando perfil...');
    setErrorMsg('');
    setSuccessMsg('');

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
      const data = await apiRequest('/cv-generate', 'POST', { 
        profileId: profile.id,
        persist: false,
        custom_target_role: cvTargetRole,
        target_job_description: cvTargetJobDescription,
        cv_focus: cvFocus,
        ...(previousNarrative && {
          previous_cv: {
            summary: previousNarrative.summary.slice(0, 1200),
            bullets: previousNarrative.bullets.slice(0, 12).map((bullet) => bullet.slice(0, 400)),
          },
        }),
        candidate_data: candidate
      });

      if (data.success && data.cvData) {
        const regenerated = { ...data.cvData, ...preservedContent, manual_fields: preservedContent.manual_fields ?? [] };
        setFinalCvData(regenerated);
        setHasUnpersistedCv(true);
        if (!previousNarrative) {
          setSuccessMsg('CV generado. Ya puedes revisarlo.');
        } else if (regenerated.manual_fields.length) {
          setSuccessMsg('CV regenerado. Tus ediciones manuales se conservaron.');
        } else {
          const sameNarrative = JSON.stringify(previousNarrative) === JSON.stringify(cvNarrative(regenerated, visibleSections));
          setSuccessMsg(sameNarrative
            ? 'CV regenerado. El resumen y las viñetas quedaron iguales.'
            : 'CV regenerado. Revisa la nueva redacción en la vista previa.');
        }
        completedGenerationRef.current = { userId: profile.id, type: 'cv', startedAt, regeneration: Boolean(previousNarrative), visit };
      } else {
        throw new Error(data.error || 'Error generando CV con la IA');
      }

    } catch (err) {
      recordDocumentOperation(profile?.id, 'cv', startedAt, false, Boolean(previousNarrative));
      console.error('Error generando CV en wizard:', err);
      setErrorMsg(mapError(err));
    } finally {
      clearInterval(progressInterval);
      setGeneratingCv(false);
      setCvProgressStep('');
    }
  };

  const applyParsedCv = (parsed) => {
    setErrorMsg('');
    setProfileSaveError(null);
    setShowMissingProfileFields(false);
    setProfileServerErrorTabs([]);
    const imported = importedCvFields(parsed);
    setCvFirstName(imported.first_name);
    setCvLastName(imported.last_name);
    setCvEmail(imported.email);
    setCvPhone(imported.phone);
    setCvLocation(imported.location);
    setCvLinkedin(imported.linkedin);
    setCvPortfolio(imported.portfolio);
    setCvCareer(imported.career);
    setCvBio(imported.bio);
    setCvTechSkills(normalizeSkillList(imported.technical_skills));
    setCvSoftSkills(imported.soft_skills);
    setCvCertifications(imported.certifications);
    setCvExperience(ensureItemIds(imported.work_experience, 'exp'));
    setCvEducation(ensureItemIds(imported.academic_background, 'edu'));
    setSuccessMsg('Importación lista. Los datos ausentes en el CV quedan en blanco. Revisa los datos antes de pulsar Guardar perfil.');
  };

  // DESCARGAR PDF USANDO UTILIDAD UNIFICADA
  const handleDownloadPdf = async () => {
    if (!finalCvData || cvActionInProgress) return;
    const startedAt = performance.now();
    const visit = getDocumentVisit('cv');
    setDownloadingCv(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const { exportToPdf } = await import('../utils/exportToPdf');
      const rawFileName = `CV_${cvFirstName || 'Usuario'}_${cvLastName || ''}.pdf`;
      const fileName = rawFileName
        .replace(/\s+/g, '_')
        .replace(/[^\w.-]/g, '');

      await exportToPdf('cv-sheet-a4-canvas', fileName);
      recordPdfOperation('cv', startedAt, true, visit);

      if ((!cvId && !copySourceTitle) || (cvId && !hasUnsavedChanges)) {
        try {
          await persistCurrentCv('downloaded');
        } catch {
          setSuccessMsg('Se inició la descarga del PDF, pero no se pudo guardar en Mis borradores. Puedes guardarlo como borrador.');
        }
      }
    } catch (err) {
      recordPdfOperation('cv', startedAt, false, visit);
      console.error('Error descargando PDF:', err);
      const errMsg = err.code === 'DOM_NOT_FOUND'
        ? 'Error: El elemento visual del CV no se encuentra renderizado en el DOM.'
        : `No se pudo generar el PDF: ${err.message || 'vuelve a intentarlo.'}`;
      setErrorMsg(errMsg);
    } finally {
      setDownloadingCv(false);
    }
  };

  // ==========================================
  // LÓGICA DE CARTAS DE PRESENTACIÓN
  // ==========================================
  const handleGenerateLetterAi = async () => {
    if (!jobDescription.trim() || letterActionInProgress) return;
    const startedAt = performance.now();
    const visit = getDocumentVisit('letter');
    const regeneration = Boolean(letterContent.trim());
    setGeneratingLetter(true);
    setLetterProgressStep('Analizando perfil y vacante...');
    setErrorMsg('');
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
        persist: false,
        company,
        targetRole,
        jobDescription,
        tone
      });

      if (data.success && typeof data.letterContent === 'string' && data.letterContent.trim()) {
        setLetterContent(data.letterContent);
        setGeneratedLetterContext(letterContextSnapshot({ company, targetRole, jobDescription, tone }));
        setHasUnpersistedLetter(true);
        setJobOfferText(`Empresa: ${company || 'No especificada'}\nPuesto Objetivo: ${targetRole || 'No especificado'}\nDescripción de la Vacante: ${jobDescription}\nTono deseado: ${tone}`);
        setSuccessMsg('Revisa el resultado y guárdalo como borrador.');
        completedGenerationRef.current = { userId: profile.id, type: 'letter', startedAt, regeneration, visit };
      } else {
        throw new Error(data.error || 'La IA no devolvió una carta válida. Se conserva el texto anterior.');
      }
    } catch (err) {
      recordDocumentOperation(profile?.id, 'letter', startedAt, false, regeneration);
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
    if (!letterContent.trim() || letterActionInProgress) return;
    const startedAt = performance.now();
    const visit = getDocumentVisit('letter');
    setDownloadingLetter(true);
    setErrorMsg('');
    try {
      const { exportToPdf } = await import('../utils/exportToPdf');
      const rawFileName = `Carta_Presentacion_${cvFirstName || 'Usuario'}_${cvLastName || ''}.pdf`;
      const fileName = rawFileName
        .replace(/\s+/g, '_')
        .replace(/[^\w.-]/g, '');

      await exportToPdf('letter-sheet-a4-canvas', fileName);
      recordPdfOperation('letter', startedAt, true, visit);

      if (letterId && !hasUnsavedLetterChanges) {
        try {
          await apiRequest(`/letter/${letterId}`, 'PUT', { status: 'downloaded' });
        } catch {
          setSuccessMsg('Se inició la descarga del PDF, pero no se pudo actualizar su estado.');
        }
      }
    } catch (err) {
      recordPdfOperation('letter', startedAt, false, visit);
      console.error('Error descargando PDF de carta:', err);
      const errMsg = err.code === 'DOM_NOT_FOUND'
        ? 'Error: El elemento visual de la carta no se encuentra renderizado en el DOM.'
        : `No se pudo generar el PDF de la carta: ${err.message || 'vuelve a intentarlo.'}`;
      setErrorMsg(errMsg);
    } finally {
      setDownloadingLetter(false);
    }
  };

  const currentCvTheme = () => ({ template, primaryColor: color, fontFamily: font, fontSize, spacing, headerStyle, visibleSections, sectionOrder });
  const currentEditorData = () => ({
    first_name: cvFirstName, last_name: cvLastName, email: cvEmail, phone: cvPhone,
    location: cvLocation, linkedin: cvLinkedin, portfolio: cvPortfolio, career: cvCareer,
    target_role: cvTargetRole, target_job_description: cvTargetJobDescription, cv_focus: cvFocus,
    bio: cvBio, technical_skills: cvTechSkills, soft_skills: cvSoftSkills,
    certifications: cvCertifications, work_experience: cvExperience, academic_background: cvEducation
  });
  const buildCurrentCvDocument = () => createCvDocumentData(finalCvData, currentEditorData());
  const editCvContent = (patch) => {
    setFinalCvData((document) => applyManualCvEdits(document, patch));
    setHasUnpersistedCv(true);
  };
  const editCvContact = (field, value) => {
    const setters = {
      first_name: setCvFirstName, last_name: setCvLastName, email: setCvEmail,
      phone: setCvPhone, location: setCvLocation, linkedin: setCvLinkedin, portfolio: setCvPortfolio,
    };
    setters[field](value);
  };

  const saveCvItemToProfile = async (item, confirmed) => {
    if (!profile?.id || savingCvProfileItem.current) return;
    const record = item.record;
    const study = record && {
      institution: record.institution ?? '', degree: record.degree ?? '',
      start_date: record.start_date ?? '', end_date: record.end_date ?? '',
    };
    const id = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(record?.id) ? record.id : undefined;
    const payload = study ? { kind: 'study', id, study, confirmed } : item;
    savingCvProfileItem.current = true;
    setSavingToProfile(true);
    try {
      const result = await apiRequest(`/profile/${profile.id}/cv-items`, 'POST', payload);
      if (result.status === 'review') {
        const { id: currentId, ...current } = result.current;
        const describe = (entry) => `${entry.degree}, ${entry.institution} (${entry.start_date} a ${entry.end_date || 'en curso'})`;
        showConfirm({
          title: 'Actualizar estudio en Mi perfil',
          message: `Guardado en Mi perfil · ${describe(current)}\nDesde este CV · ${describe(study)}`,
          confirmLabel: 'Actualizar estudio',
          variant: 'info',
          onConfirm: () => void saveCvItemToProfile(item, { id: currentId, study: current }),
        });
      } else if (result.status === 'stale' || result.status === 'duplicate') {
        toast.warning(result.status === 'stale'
          ? 'El perfil cambió durante el guardado. Vuelve a intentarlo.'
          : 'Hay varios estudios que coinciden. Revísalos en Mi perfil.');
      } else if (result.status === 'saved' || result.status === 'unchanged') {
        if (study && result.id && record.id !== result.id) {
          setFinalCvData((document) => {
            const entries = document?.academic_background ?? document?.education;
            if (!entries || !entries.includes(record)) return document;
            return applyManualCvEdits(document, {
              academic_background: entries.map((entry) => entry === record ? { ...entry, id: result.id } : entry),
            });
          });
          setHasUnpersistedCv(true);
        }
        toast.success(result.status === 'saved' ? 'Guardado en Mi perfil.' : 'Este dato ya está en Mi perfil.');
      } else {
        toast.error('No se pudo confirmar el guardado en Mi perfil.');
      }
    } catch (error) {
      toast.error(error.message || 'No se pudo guardar en Mi perfil.');
    } finally {
      savingCvProfileItem.current = false;
      setSavingToProfile(false);
    }
  };

  const cvActionInProgress = generatingCv || downloadingCv || savingCvDraft || savingToProfile;
  const letterActionInProgress = generatingLetter || downloadingLetter || savingLetterDraft;
  const canUseSavedTargetInLetter = savedTargetRole && savedTargetDescription
    && (targetRole.trim() !== savedTargetRole || jobDescription.trim() !== savedTargetDescription);
  const generatedTargetRole = finalCvData?.personal_info?.target_role ?? finalCvData?.target_role ?? finalCvData?.headline ?? '';
  const needsCvRegeneration = Boolean(finalCvData) && (
    cvTargetRole.trim() !== String(generatedTargetRole).trim()
    || cvTargetJobDescription.trim() !== String(finalCvData.target_job_description ?? '').trim()
  );

  const letterSnapshot = { content: letterContent, company, targetRole, jobDescription, tone };
  const hasLetterText = Boolean(letterContent.trim());
  const hasLetterResult = Boolean(letterContent || letterId || draftAsCopy || hasUnpersistedLetter);
  const needsLetterRegeneration = hasLetterText
    && generatedLetterContext !== letterContextSnapshot({ company, targetRole, jobDescription, tone });
  const isManualLetterCopy = !hasUnpersistedLetter && Boolean(letterId || draftAsCopy)
    && hasLetterText && letterContent.trim() !== savedLetterSnapshot?.content.trim() && !needsLetterRegeneration;
  const canSaveLetterDraft = hasLetterText && !needsLetterRegeneration && (hasUnpersistedLetter || isManualLetterCopy);
  const hasUnsavedLetterChanges = hasUnpersistedLetter
    || (Boolean(savedLetterSnapshot) && JSON.stringify(letterSnapshot) !== JSON.stringify(savedLetterSnapshot));
  const hasUnsavedChanges = !loading && !loadError && (docType === 'letter'
    ? hasUnsavedLetterChanges
    : hasChanges() || (!isProfileEditor && (hasUnpersistedCv || JSON.stringify(currentCvTheme()) !== JSON.stringify(savedTheme))));
  useEffect(() => {
    if (!hasUnsavedChanges) return;
    return protectUnsavedChanges(window, (path) => {
      if (confirmedDocumentExit.current === path) return true;
      setPendingDocumentExit(path);
      return false;
    });
  }, [hasUnsavedChanges]);

  // PERSISTENCIA DE BORRADORES
  const persistCurrentCv = async (status, saveAsCopy = false) => {
    const editor = currentEditorData();
    const cvStyle = currentCvTheme();
    const cvData = { ...buildCurrentCvDocument(), source_bio: editor.bio };
    const targetId = saveAsCopy ? null : cvId;
    const copyTitle = copySourceTitle || (saveAsCopy ? cvTitle || 'CV' : '');
    const data = await apiRequest(targetId ? `/cv/${targetId}` : '/cv', targetId ? 'PUT' : 'POST', {
      status, cv_data: cvData, cv_style: cvStyle,
      ...(copyTitle && { document_title: `${copyTitle} · Copia` }),
    });
    if (!data.success || !data.cv?.id) throw new Error(data.error || 'No se pudo guardar el CV.');

    setCvId(data.cv.id);
    setCvTitle(data.cv.document_title || (copyTitle ? `${copyTitle} · Copia` : cvTitle));
    setCopySourceTitle('');
    setFinalCvData(cvData);
    setLastSavedSnapshot(editor);
    setSavedTheme(cvStyle);
    setHasUnpersistedCv(false);
    replaceDocumentPath?.(cvDraftPath(data.cv.id));
  };

  const handleSaveCvDraft = async (saveAsCopy = false) => {
    if (!finalCvData || cvActionInProgress || needsCvRegeneration) return;
    setSavingCvDraft(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      await persistCurrentCv('draft', saveAsCopy);
      toast.success(saveAsCopy || copySourceTitle ? 'Copia guardada en Mis borradores.' : 'CV guardado en Mis borradores.');
    } catch (err) {
      console.error(err);
      setErrorMsg(mapError(err));
    } finally {
      setSavingCvDraft(false);
    }
  };

  const canSaveCvBeforeExit = Boolean(finalCvData) && !needsCvRegeneration;
  const finishDocumentExit = () => {
    if (!pendingDocumentExit) return;
    confirmedDocumentExit.current = pendingDocumentExit;
    setPendingDocumentExit(null);
    try {
      navigateTo(pendingDocumentExit);
    } finally {
      confirmedDocumentExit.current = null;
    }
  };

  const saveCvBeforeExit = async () => {
    if (!canSaveCvBeforeExit || cvActionInProgress) return;
    setSavingCvDraft(true);
    try {
      await persistCurrentCv('draft');
      toast.success('CV guardado en Mis borradores.');
      finishDocumentExit();
    } catch (error) {
      toast.error(mapError(error));
    } finally {
      setSavingCvDraft(false);
    }
  };

  const handleSaveLetterDraft = async (exitAfterSave = false) => {
    if (!canSaveLetterDraft || letterActionInProgress) return;
    setSavingLetterDraft(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const defaultTitle = targetRole.trim() && company.trim()
        ? `Carta para ${targetRole.trim()} en ${company.trim()}`
        : `Carta para ${company.trim() || targetRole.trim() || 'Vacante'}`;
      const data = await apiRequest('/letter-save', 'POST', {
        profileId: profile.id,
        jobOfferText,
        letterContent,
        documentTitle: isManualLetterCopy ? `${defaultTitle} · Copia` : defaultTitle,
        status: 'draft',
        company: company || null,
        targetRole: targetRole || null,
        jobDescription: jobDescription || null,
        tone: tone || null
      });
      if (!data.success || !data.letterId) throw new Error(data.error || 'No se pudo guardar la carta como borrador.');
      setSavedLetterSnapshot(letterSnapshot);
      setLetterId(data.letterId);
      setHasUnpersistedLetter(false);
      toast.success(isManualLetterCopy ? 'Copia guardada en Mis borradores.' : 'Carta guardada en Mis borradores.');
      if (exitAfterSave) finishDocumentExit();
      else replaceDocumentPath?.(letterDraftPath(data.letterId));
    } catch (err) {
      console.error(err);
      if (err.code === 'LETTER_SAVE_FAILED' || err.code === 'DB_SCHEMA_MISMATCH') {
        setErrorMsg('No se pudo guardar la carta. Verifica que la base de datos tenga las columnas requeridas.');
      } else if (err.code === 'PROFILE_REQUIRED') {
        setErrorMsg('No se encontró un perfil profesional para guardar la carta.');
      } else {
        setErrorMsg(mapError(err));
      }
      if (exitAfterSave) toast.error('No se pudo guardar la carta. Tus cambios siguen aquí.');
    } finally {
      setSavingLetterDraft(false);
    }
  };

  const renderLetterCanvas = () => {
    return (
      <div 
        id="letter-sheet-a4-canvas" 
        className="bg-white text-slate-900 shadow-lg p-12 font-serif text-left shrink-0 text-justify"
        style={{
          fontFamily: 'Georgia, Cambria, "Times New Roman", Times, serif',
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
    headline: cvExperience.find((experience) => experience.role?.trim())?.role || cvCareer,
    professional_summary: cvBio,
    work_experience: cvExperience.map((experience) => experience.description
      ? { ...experience, bullets: [] }
      : experience),
    academic_background: cvEducation,
    skills_categories: {
      languages_and_frameworks: cvTechSkills,
      tools_and_databases: [],
      methodologies_and_soft_skills: cvSoftSkills
    },
    soft_skills: cvSoftSkills,
    certifications: cvCertifications
  };
  const liveProfile = {
    ...profile,
    first_name: cvFirstName,
    last_name: cvLastName,
    email: cvEmail,
    phone: cvPhone,
    location: cvLocation,
    linkedin: cvLinkedin,
    portfolio: cvPortfolio,
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
  const jobDescriptionInput = (
    <>
      <label htmlFor="target-job-description" className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Descripción del puesto objetivo</label>
      <textarea
        id="target-job-description"
        rows={10}
        value={cvTargetJobDescription}
        onChange={(e) => setCvTargetJobDescription(e.target.value)}
        placeholder="Escribe o pega las funciones y los requisitos del puesto."
        className="w-full resize-y whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-relaxed text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white supports-[field-sizing:content]:field-sizing-content supports-[field-sizing:content]:min-h-[calc(10lh+1.5rem+2px)] supports-[field-sizing:content]:resize-none"
      />
    </>
  );
  const livePreviewPanel = (
    <div className="lg:col-span-7 min-w-0 space-y-2">
      {!finalCvData && <p className="text-xs text-slate-600 dark:text-slate-300">Vista previa de Mi perfil. Pulsa «Generar CV con IA» para redactar el resumen y adaptar tus competencias a la vacante.</p>}
      <div className="bg-slate-100 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 overflow-x-auto shadow-inner min-h-[520px]">
        <div className="mx-auto w-[210mm]">
          <CVPreview
            profile={liveProfile}
            cvData={finalCvData ? buildCurrentCvDocument() : liveCvData}
            theme={cvTheme}
            sections={visibleSections}
            sectionOrder={sectionOrder}
          />
        </div>
      </div>
    </div>
  );
  const canSaveBeforeExit = !isProfileEditor && (docType === 'letter' ? canSaveLetterDraft : canSaveCvBeforeExit);
  const saveDocumentBeforeExit = () => docType === 'letter' ? handleSaveLetterDraft(true) : saveCvBeforeExit();

  return (
    <div className="flex-1 min-h-full overflow-y-auto bg-slate-50 px-4 py-6 font-sans sm:px-6 lg:px-8 lg:py-8">
      <ConfirmDialog
        open={Boolean(pendingDocumentExit)}
        title={isProfileEditor ? 'Tu perfil tiene cambios sin guardar' : docType === 'letter' ? 'Tu carta tiene cambios sin guardar' : 'Tu CV tiene cambios sin guardar'}
        message={canSaveBeforeExit
          ? 'Guarda esta versión como borrador para continuar después, o sal sin guardar.'
          : docType === 'letter' && letterContent.trim()
            ? 'Regenera la carta para guardar una nueva versión como borrador.'
            : 'Puedes seguir editando o salir sin guardar estos cambios.'}
        confirmLabel={canSaveBeforeExit ? (docType === 'letter' ? isManualLetterCopy : copySourceTitle) ? 'Guardar copia y salir' : docType === 'cv' && cvId ? 'Guardar cambios y salir' : 'Guardar borrador y salir' : 'Salir sin guardar'}
        cancelLabel="Seguir aquí"
        variant={canSaveBeforeExit ? 'info' : 'warning'}
        loading={isProfileEditor ? savingProfileData : docType === 'letter' ? letterActionInProgress : cvActionInProgress}
        onCancel={() => setPendingDocumentExit(null)}
        onConfirm={canSaveBeforeExit ? saveDocumentBeforeExit : finishDocumentExit}
        alternateAction={canSaveBeforeExit ? { label: 'Salir sin guardar', onClick: finishDocumentExit } : undefined}
      />
      
      {errorMsg && (
        <div role="alert" className="bg-rose-50 border border-rose-100 text-rose-650 text-xs rounded-xl p-4 flex items-start gap-3 mb-6">
          <AlertCircle className="h-4.5 w-4.5 shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div role="status" className="bg-emerald-50 border border-emerald-100 text-emerald-650 text-xs rounded-xl p-4 flex items-start gap-3 mb-6 animate-fade-in">
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
                  setCvStep(2);
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
            {isProfileEditor ? (
              <div>
                <h2 className="font-bold text-slate-900 dark:text-white">Editar mi perfil</h2>
                <p className="text-xs text-slate-500 mt-1">Revisa tus datos y guarda el perfil para utilizarlos en documentos y entrevistas.</p>
              </div>
            ) : <div className="flex gap-1 overflow-x-auto rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-1 w-full xl:w-auto">
              {[
                { n: 2, label: 'Personalización' },
                { n: 3, label: 'Plantilla y diseño' },
                { n: 4, label: 'Vista previa y generación' }
              ].map((step, index) => {
                const isActive = cvStep === step.n;
                return (
                  <button
                    key={step.n}
                    type="button"
                    aria-current={isActive ? 'step' : undefined}
                    disabled={cvActionInProgress}
                    onClick={() => setCvStep(step.n)}
                    className={`px-3 py-2 rounded-lg text-[11px] font-bold whitespace-nowrap cursor-pointer transition-all ${
                      isActive
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-white/70 dark:hover:bg-slate-800/70'
                    }`}
                  >
                    {index + 1}. {step.label}
                  </button>
                );
              })}
            </div>}
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center xl:justify-end">
              {isProfileEditor && <button type="button" onClick={() => navigateTo('/profile/view')} className="border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 text-xs font-bold cursor-pointer">Volver a mi perfil</button>}
              {!isProfileEditor && (
                <>
                  {cvStep === 4 && finalCvData && (
                    <button
                      type="button"
                      onClick={handleDownloadPdf}
                      disabled={cvActionInProgress || needsCvRegeneration}
                      className="flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-indigo-700 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Download aria-hidden="true" className="h-4 w-4" />
                      {downloadingCv ? 'Preparando PDF…' : 'Descargar PDF'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleGenerateCvAi}
                    disabled={cvActionInProgress}
                    className={`flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold cursor-pointer disabled:opacity-50 ${finalCvData
                      ? 'border border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800'
                      : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}
                  >
                    <Sparkles aria-hidden="true" className="h-4 w-4" />
                    {generatingCv ? 'Generando CV…' : finalCvData ? 'Regenerar con IA' : 'Generar CV con IA'}
                  </button>
                  {cvStep > 2 && (
                    <button
                      type="button"
                      onClick={prevStep}
                      disabled={cvActionInProgress}
                      className="border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-650 dark:text-slate-300 font-bold px-4 py-2 rounded-xl text-xs flex items-center justify-center gap-1 cursor-pointer transition-colors disabled:opacity-50"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                      Atrás
                    </button>
                  )}
                  {cvStep <= 3 && (
                    <button
                      type="button"
                      onClick={nextStep}
                      disabled={cvActionInProgress}
                      className="bg-indigo-650 hover:bg-indigo-700 text-white font-bold px-4 py-2 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-sm shadow-indigo-600/10 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Siguiente
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  )}
                </>
              )}
              {isProfileEditor && (
                <button
                  type="button"
                  onClick={() => setShowImportModal(true)}
                  className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 px-4 py-2 text-[10px] font-bold hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <Sparkles aria-hidden="true" className="h-3.5 w-3.5" />
                  Importar CV con IA
                </button>
              )}
              {isProfileEditor && (
                <button
                  type="button"
                  disabled={savingProfileData}
                  onClick={handleSaveProfileData}
                  className="flex items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-indigo-700 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {savingProfileData && <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />}
                  {savingProfileData ? 'Guardando perfil…' : 'Guardar perfil'}
                </button>
              )}
            </div>
          </div>

          {isProfileEditor && profileSaveError && (
            <div ref={profileSaveErrorRef} role="alert" tabIndex={-1} className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-100">
              <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="space-y-1">
                <p className="font-semibold">{profileSaveError.title}</p>
                {profileSaveError.issues.length > 0 && (
                  <ul className="list-disc space-y-1 pl-4">
                    {profileSaveError.issues.map(({ text }) => <li key={text}>{text}</li>)}
                  </ul>
                )}
                {profileSaveError.issues.length === 0 && <p>{profileSaveError.message}</p>}
              </div>
            </div>
          )}

          {isProfileEditor && (
            <ImportCvModal
              destination="profile"
              open={showImportModal}
              onClose={() => setShowImportModal(false)}
              onParsed={applyParsedCv}
              onMeasured={(startedAt, success) => recordDocumentOperation(profile?.id, 'profile_import', startedAt, success, false)}
            />
          )}

          {/* CUERPO DEL WIZARD SEGÚN PASO */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm min-h-[350px] flex flex-col justify-between">
            
            <div>
              {/* PASO 1: DATOS BASE */}
              {isProfileEditor && (
                <div className="space-y-6 text-left">
                  <div className="space-y-6">

                  {/* Horizontal Tabs Menu */}
                  <div className="border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 pb-2">
                    <ProfileSectionTabs activeSection={activeEditorTab} onChange={setActiveEditorTab} invalidSections={invalidProfileTabs} />
                    {hasUnsavedChanges && <span className="text-xs text-amber-600 shrink-0">Cambios sin guardar</span>}
                  </div>
                  {/* Tab Contents */}
                  <div className="mt-4 [&_input[aria-invalid=true]]:border-rose-500!">
                    {/* Tab 1: Personal Info */}
                    {activeEditorTab === 'personal' && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-slate-505 dark:text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1">Nombres</label>
                          <input 
                            type="text" 
                            value={cvFirstName} 
                            {...requiredProfileInput(cvFirstName)}
                            onChange={(e) => setCvFirstName(e.target.value)}
                            className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl px-4 py-2.5 text-xs focus:outline-none focus:border-indigo-500 focus:bg-white dark:focus:bg-slate-800"
                          />
                        </div>
                        <div>
                          <label className="block text-slate-505 dark:text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1">Apellidos</label>
                          <input 
                            type="text" 
                            value={cvLastName} 
                            {...requiredProfileInput(cvLastName)}
                            onChange={(e) => setCvLastName(e.target.value)}
                            className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl px-4 py-2.5 text-xs focus:outline-none focus:border-indigo-500 focus:bg-white dark:focus:bg-slate-800"
                          />
                        </div>
                        <div>
                          <label className="block text-slate-505 dark:text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1">Teléfono</label>
                          <input 
                            type="text" 
                            value={cvPhone} 
                            {...requiredProfileInput(cvPhone)}
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
                          <label htmlFor="cv-contact-email" className="block text-slate-505 dark:text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1">Correo de contacto</label>
                          <input
                            id="cv-contact-email"
                            type="email"
                            value={cvEmail}
                            {...requiredProfileInput(cvEmail)}
                            onChange={(e) => setCvEmail(e.target.value)}
                            className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl px-4 py-2.5 text-xs focus:outline-none focus:border-indigo-500"
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
                      </div>
                    )}

                    {/* Tab 2: Profile Summary (Bio) */}
                    {activeEditorTab === 'personal' && (
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
                    {activeEditorTab === 'trajectory' && (
                      <div className="space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 pb-2 border-b border-slate-100 dark:border-slate-800">
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
                                    {...requiredProfileInput(exp.company)}
                                    onChange={(e) => handleExperienceItemChange(index, 'company', e.target.value)}
                                    className="w-full bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-indigo-400"
                                  />
                                </div>
                                <div>
                                  <label className="block text-slate-500 dark:text-slate-455 text-[9px] font-bold uppercase mb-0.5">Cargo / Puesto</label>
                                  <input 
                                    type="text" 
                                    value={exp.role} 
                                    {...requiredProfileInput(exp.role)}
                                    onChange={(e) => handleExperienceItemChange(index, 'role', e.target.value)}
                                    className="w-full bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-indigo-400"
                                  />
                                </div>
                                <div>
                                  <label className="block text-slate-500 dark:text-slate-455 text-[9px] font-bold uppercase mb-0.5">Fecha Inicio</label>
                                  <input 
                                    type="text" 
                                    value={exp.start_date} 
                                    {...requiredProfileInput(exp.start_date)}
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
                    {activeEditorTab === 'trajectory' && (
                      <div className="mt-6 space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 pb-2 border-b border-slate-100 dark:border-slate-800">
                          <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Historial Académico / Estudios</h4>
                          <button
                            type="button"
                            onClick={addEducationItem}
                            className="bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/40 text-indigo-650 dark:text-indigo-400 text-[10px] font-bold px-3 py-1.5 rounded-xl cursor-pointer transition-all flex items-center gap-1"
                          >
                            <Plus className="h-3.5 w-3.5" /> Agregar estudio
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
                                    {...requiredProfileInput(edu.institution)}
                                    onChange={(e) => handleEducationItemChange(index, 'institution', e.target.value)}
                                    className="w-full bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-indigo-400"
                                  />
                                </div>
                                <div>
                                  <label htmlFor={`study-${index}-degree`} className="block text-slate-500 dark:text-slate-455 text-[9px] font-bold uppercase mb-0.5">Carrera o programa de estudios</label>
                                  <input 
                                    id={`study-${index}-degree`}
                                    type="text" 
                                    value={edu.degree} 
                                    placeholder="Ejemplo: Desarrollo de Software"
                                    {...requiredProfileInput(edu.degree)}
                                    onChange={(e) => handleEducationItemChange(index, 'degree', e.target.value)}
                                    className="w-full bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-indigo-400"
                                  />
                                </div>
                                {[
                                  { field: 'start_date', label: 'Fecha de inicio', required: true },
                                  { field: 'end_date', label: 'Fecha de fin (vacía si continúa)', required: false },
                                ].map(({ field, label, required }) => {
                                  const savedDate = edu[field] ?? '';
                                  const isCalendarDate = /^\d{4}-\d{2}-\d{2}$/.test(savedDate)
                                    && new Date(savedDate).toJSON()?.slice(0, 10) === savedDate;
                                  const inputId = `study-${index}-${field}`;
                                  return (
                                    <div key={field} className="min-w-0">
                                      <label htmlFor={inputId} className="mb-0.5 block text-[9px] font-bold uppercase text-slate-500 dark:text-slate-455">{label}</label>
                                      <input
                                        id={inputId}
                                        type="date"
                                        value={isCalendarDate ? savedDate : ''}
                                        {...(required ? requiredProfileInput(savedDate) : {})}
                                        onChange={(e) => handleEducationItemChange(index, field, e.target.value)}
                                        className="w-full min-w-0 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-indigo-400 focus:outline-none dark:border-slate-700 dark:bg-slate-850 dark:text-white dark:[color-scheme:dark]"
                                      />
                                      {savedDate && !isCalendarDate && (
                                        <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-500 dark:text-slate-400">
                                          <span>Fecha guardada: {savedDate}</span>
                                          {!required && (
                                            <button type="button" className="cursor-pointer underline" onClick={() => handleEducationItemChange(index, field, '')}>
                                              Quitar fecha de fin
                                            </button>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
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

                  </div>
                </div>
              )}

              {/* PASO 2: PERSONALIZACIÓN */}
              {cvStep === 2 && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start text-left">
                  <div className="lg:col-span-5 space-y-6">
                  
                  <div className="pb-3 border-b border-slate-100 dark:border-slate-800">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">Vacante objetivo</h3>
                    <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">Usaremos los datos de Mi perfil para adaptar tu CV a esta vacante.</p>
                  </div>

                  <div>
                      <label htmlFor="cv-target-role" className="block text-slate-500 dark:text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1.5">Puesto objetivo para este CV</label>
                      <input 
                        id="cv-target-role"
                        type="text" 
                        value={cvTargetRole} 
                        onChange={(e) => setCvTargetRole(e.target.value)}
                        placeholder="Ej: React Developer Junior"
                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl px-4 py-2.5 text-xs focus:outline-none focus:border-indigo-500 focus:bg-white"
                      />
                    </div>

                  <div className="space-y-2">
                    {jobDescriptionInput}
                    {!hasCompleteCvTarget ? (
                      <p className="text-xs text-slate-500 dark:text-slate-400">Completa el puesto y su descripción para guardarlos para cartas y entrevistas.</p>
                    ) : defaultTargetMatches ? (
                      <p className="text-xs text-slate-500 dark:text-slate-400">Puesto y descripción guardados para cartas y entrevistas.</p>
                    ) : (
                      <button type="button" onClick={handleSaveDefaultTarget} disabled={savingDefaultTarget} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-50 dark:border-slate-700 dark:text-indigo-300 dark:hover:bg-slate-800 cursor-pointer disabled:opacity-50">
                        {savingDefaultTarget ? 'Guardando…' : 'Guardar puesto para cartas y entrevistas'}
                      </button>
                    )}
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
                    
                    <div className="pb-3 border-b border-slate-100 dark:border-slate-800 flex flex-col lg:flex-row lg:justify-between lg:items-center gap-3">
                      <div>
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white">{finalCvData ? 'Tu CV listo para revisar' : 'Vista previa con los datos de tu perfil'}</h3>
                        <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                          {needsCvRegeneration
                            ? 'La vacante cambió. Regenera el CV para actualizarlo antes de guardarlo o descargarlo.'
                            : copySourceTitle ? `Estás editando una copia de «${copySourceTitle}».`
                              : finalCvData ? 'Revisa y ajusta el contenido antes de guardar o descargar.' : 'Genera tu CV con IA para revisar el resultado antes de descargarlo o guardarlo.'}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {finalCvData && (
                          <>
                            <button type="button" aria-expanded={showCvContentEditor} aria-controls={showCvContentEditor ? 'cv-content-editor' : undefined} onClick={() => setShowCvContentEditor((open) => !open)} disabled={cvActionInProgress} className="flex items-center gap-2 rounded-xl border border-indigo-200 px-4 py-2.5 text-xs font-bold text-indigo-700 hover:bg-indigo-50 dark:border-indigo-800 dark:text-indigo-300 dark:hover:bg-indigo-950 cursor-pointer disabled:opacity-50">
                              <Pencil aria-hidden="true" className="h-4 w-4" />
                              {showCvContentEditor ? 'Cerrar editor' : 'Editar contenido'}
                            </button>
                            <button type="button" onClick={() => handleSaveCvDraft()} disabled={cvActionInProgress || needsCvRegeneration} className="rounded-xl border border-indigo-200 px-4 py-2.5 text-xs font-bold text-indigo-700 hover:bg-indigo-50 dark:border-indigo-800 dark:text-indigo-300 dark:hover:bg-indigo-950 cursor-pointer disabled:opacity-50">
                              {savingCvDraft ? 'Guardando…' : copySourceTitle ? 'Guardar copia' : cvId ? 'Guardar cambios' : 'Guardar como borrador'}
                            </button>
                            {cvId && (
                              <button type="button" onClick={() => handleSaveCvDraft(true)} disabled={cvActionInProgress || needsCvRegeneration} className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800 cursor-pointer disabled:opacity-50">
                                Guardar como copia
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>

                    <div className={showCvContentEditor && finalCvData ? 'grid items-start gap-4 2xl:grid-cols-[minmax(16rem,0.65fr)_minmax(0,2fr)]' : undefined}>
                      {showCvContentEditor && finalCvData && (
                        <fieldset disabled={cvActionInProgress} className="min-w-0">
                          <CvContentEditor document={buildCurrentCvDocument()} visibleSections={visibleSections} onChange={editCvContent}
                            onSaveToProfile={saveCvItemToProfile} savingToProfile={savingToProfile}
                            onContactChange={editCvContact} onVisibilityChange={(key, visible) => setVisibleSections((current) => ({ ...current, [key]: visible }))} />
                        </fieldset>
                      )}
                      <div className="min-w-0 bg-slate-100 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 overflow-x-auto shadow-inner min-h-[480px]">
                        <div className="mx-auto w-[210mm]">
                          <CVPreview
                            profile={liveProfile}
                            cvData={finalCvData ? buildCurrentCvDocument() : liveCvData}
                            theme={cvTheme}
                            sections={visibleSections}
                            sectionOrder={sectionOrder}
                          />
                        </div>
                      </div>
                    </div>

                  </div>
                )
              )}

            </div>
          </div>
        </div>
      ) : (
        /* ========================================================= */
        /* CARTA DE PRESENTACIÓN */
        /* ========================================================= */
        <div className="mx-auto w-full max-w-[1600px] space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">

            {/* Izquierda: Formulario de la carta */}
            <div className="lg:col-span-5 space-y-6">
              
              {/* Input Oferta Estructurado */}
              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wide flex items-center gap-1.5">
                    <Mail className="h-4.5 w-4.5 text-indigo-600" />
                    {letterContent ? 'Carta de presentación' : 'Nueva carta de presentación'}
                  </h3>
                </div>
                <p className="text-[10px] text-slate-400">Genera cartas de presentación adaptadas a las exigencias corporativas. Ingresa los datos del puesto para alinear tu perfil con la vacante.</p>
                {draftAsCopy && !letterId && (
                  <p className="text-xs text-slate-500">Estás usando la última carta como base.</p>
                )}
                
                <div className="space-y-3">
                  <div>
                    <label className="block text-slate-500 text-[9px] font-bold uppercase tracking-wider mb-1">Empresa</label>
                    <input
                      type="text"
                      value={company}
                      disabled={letterActionInProgress}
                      onChange={(e) => setCompany(e.target.value)}
                      placeholder="ej: TechCorp"
                      className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-indigo-500 focus:bg-white"
                    />
                  </div>
                  <div>
                    <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
                      <label htmlFor="letter-target-role" className="text-slate-500 text-[9px] font-bold uppercase tracking-wider">Puesto objetivo para esta carta</label>
                      {canUseSavedTargetInLetter && (
                        <button
                          type="button"
                          disabled={letterActionInProgress}
                          onClick={() => {
                            setTargetRole(savedTargetRole);
                            setJobDescription(savedTargetDescription);
                          }}
                          className="cursor-pointer text-xs font-semibold text-indigo-700 hover:underline dark:text-indigo-300 disabled:opacity-50"
                        >
                          Usar puesto guardado
                        </button>
                      )}
                    </div>
                    <input
                      id="letter-target-role"
                      type="text"
                      value={targetRole}
                      disabled={letterActionInProgress}
                      onChange={(e) => setTargetRole(e.target.value)}
                      placeholder="ej: Desarrollador React Junior"
                      className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-indigo-500 focus:bg-white"
                    />
                  </div>
                  <div>
                    <label htmlFor="letter-job-description" className="block text-slate-500 text-[9px] font-bold uppercase tracking-wider mb-1">Descripción de la vacante</label>
                    <textarea
                      id="letter-job-description"
                      rows={10}
                      value={jobDescription}
                      disabled={letterActionInProgress}
                      onChange={(e) => setJobDescription(e.target.value)}
                      placeholder="Buscamos desarrollador frontend junior con conocimientos en React, Tailwind y Git..."
                      className="w-full resize-y whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-relaxed text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white supports-[field-sizing:content]:field-sizing-content supports-[field-sizing:content]:min-h-[calc(10lh+1.5rem+2px)] supports-[field-sizing:content]:resize-none"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-500 text-[9px] font-bold uppercase tracking-wider mb-1">Tono de la carta</label>
                    <select
                      value={tone}
                      disabled={letterActionInProgress}
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
                    disabled={!jobDescription.trim() || letterActionInProgress}
                    className="w-full bg-indigo-650 hover:bg-indigo-700 text-white font-bold py-2.5 rounded-xl text-xs transition-all shadow-sm disabled:opacity-40 cursor-pointer"
                  >
                    {letterContent ? 'Regenerar carta con IA' : 'Generar carta con IA'}
                  </button>
                )}
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
              ) : hasLetterResult ? (
                <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex-1 flex flex-col space-y-4">
                  <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                    <span className="text-[10px] text-slate-400 font-bold uppercase">Resultado de Redacción (Editable)</span>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={handleCopyLetter}
                        disabled={!hasLetterText}
                        className="bg-slate-100 hover:bg-indigo-650 hover:text-white text-slate-600 text-[10px] font-bold px-3 py-1.5 rounded-lg flex items-center gap-1 transition-all duration-200 cursor-pointer disabled:opacity-50"
                      >
                        {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                        {copied ? 'Copiada' : 'Copiar'}
                      </button>
                      <button
                        onClick={handleDownloadLetterPdf}
                        disabled={letterActionInProgress || !hasLetterText}
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
                        onClick={() => handleSaveLetterDraft()}
                        disabled={letterActionInProgress || !canSaveLetterDraft}
                        className="bg-indigo-55/60 hover:bg-indigo-650 hover:text-white text-indigo-650 text-[10px] font-bold px-3 py-1.5 rounded-lg flex items-center gap-1 transition-all duration-200 cursor-pointer disabled:opacity-50"
                      >
                        {savingLetterDraft ? 'Guardando…' : isManualLetterCopy ? 'Guardar como copia' : 'Guardar borrador'}
                      </button>
                    </div>
                  </div>
                  
                  {needsLetterRegeneration && (
                    <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                      Cambiaste los datos de la vacante. Puedes descargar el texto que ves. Para guardarlo con los datos nuevos, pulsa «Regenerar carta con IA».
                    </p>
                  )}
                  {hasLetterText && !needsLetterRegeneration && !hasUnpersistedLetter && (
                    <p className="text-xs text-slate-500 dark:text-slate-400">{isManualLetterCopy
                      ? 'Al guardar la copia, conservarás la carta original.'
                      : 'Edita el texto para guardar una copia.'}</p>
                  )}
                  {!hasLetterText && <p className="text-xs text-slate-500 dark:text-slate-400">Escribe el texto de la carta para guardarla o descargarla.</p>}
                  <textarea
                    aria-label="Texto de la carta"
                    value={letterContent}
                    disabled={letterActionInProgress}
                    onChange={(e) => setLetterContent(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200/60 p-5 rounded-xl text-slate-700 font-serif text-xs md:text-sm leading-relaxed whitespace-pre-wrap flex-1 min-h-[420px] lg:min-h-[clamp(460px,65dvh,680px)] resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-justify"
                  />
                </div>
              ) : (
                <div className="bg-white border border-dashed border-slate-200 rounded-2xl p-12 text-center text-slate-400 flex-1 flex flex-col items-center justify-center min-h-[380px] shadow-sm">
                  <Mail className="h-8 w-8 text-slate-300 mb-3" />
                  <p className="text-xs leading-relaxed max-w-xs">
                    Completa la descripción de la vacante y pulsa «Generar carta con IA» para revisar el resultado aquí.
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
