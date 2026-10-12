import { useState, useEffect } from 'react';
import { supabase } from '../utils/supabaseClient';
import { loadUserSnapshot } from '../utils/userDataApi';
import { apiRequest } from '../utils/api';
import { 
  Download, 
  CheckCircle, 
  Loader2, 
  AlertCircle, 
  Eye, 
  Sliders
} from 'lucide-react';
import LoadingOverlay from '../components/common/LoadingOverlay';

// Customizer Components
import TemplateSelector from '../components/cv/TemplateSelector';
import ColorSelector from '../components/cv/ColorSelector';
import FontSelector from '../components/cv/FontSelector';
import SectionToggle from '../components/cv/SectionToggle';
import CVPreview from '../components/cv/CVPreview';

export default function CvCustomize() {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [cvData, setCvData] = useState(null);
  const [userId, setUserId] = useState(null);

  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  
  // Customizer Styles States synced with localStorage
  const [template, setTemplate] = useState(() => localStorage.getItem('empleaia_cv_theme_template') || 'classic');
  const [color, setColor] = useState(() => localStorage.getItem('empleaia_cv_theme_color') || 'purple');
  const [font, setFont] = useState(() => localStorage.getItem('empleaia_cv_theme_font') || 'inter');
  const [fontSize, setFontSize] = useState(() => localStorage.getItem('empleaia_cv_theme_fontSize') || 'normal');
  const [spacing, setSpacing] = useState(() => localStorage.getItem('empleaia_cv_theme_spacing') || 'normal');
  const [headerStyle, setHeaderStyle] = useState(() => localStorage.getItem('empleaia_cv_theme_headerStyle') || 'centered');

  // Toggle sections synced with localStorage
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

  // Reordering sections synced with localStorage
  const [sectionOrder, setSectionOrder] = useState(() => {
    const saved = localStorage.getItem('empleaia_cv_theme_sectionOrder');
    return saved ? JSON.parse(saved) : ['summary', 'experience', 'education', 'projects', 'skills'];
  });

  // Action status states
  const [downloadingCv, setDownloadingCv] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [cvId, setCvId] = useState(null);

  // Sync state changes with localStorage and add required audit console logs
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

  // Visual Theme Object
  const cvTheme = {
    template,
    fontFamily: font,
    primaryColor: color,
    fontSize,
    spacing,
    headerStyle
  };

  // Log cvTheme to console whenever parameters change
  useEffect(() => {
    console.log("Theme enviado a CVPreview:", { template, fontFamily: font, primaryColor: color, fontSize, spacing, headerStyle });
  }, [template, font, color, fontSize, spacing, headerStyle]);

  useEffect(() => {
    const loadCustomizerData = async () => {
      setLoading(true);
      setErrorMsg('');

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setLoading(false);
        return;
      }

      const uid = session.user.id;
      setUserId(uid);

      try {
        const token = session?.access_token;
        const headers = {};
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }
        const snapshot = await loadUserSnapshot(uid);
        if (snapshot.profile) {
          setProfile({ ...snapshot.profile, work_experience: snapshot.work || [], academic_background: snapshot.academic || [] });
        } else {
          setErrorMsg('Completa tu informaci?n profesional en "Mi perfil" antes de personalizar tu CV.');
        }
        const cvs = (snapshot.cvs || []).slice(0, 1);

        if (cvs && cvs.length > 0) {
          setCvData(cvs[0].cv_data);
          setCvId(cvs[0].id);
          if (cvs[0].cv_style) {
            const style = cvs[0].cv_style;
            if (style.template) setTemplate(style.template);
            if (style.primaryColor) setColor(style.primaryColor);
            if (style.fontFamily) setFont(style.fontFamily);
            if (style.fontSize) setFontSize(style.fontSize);
            if (style.spacing) setSpacing(style.spacing);
            if (style.headerStyle) setHeaderStyle(style.headerStyle);
            if (style.visibleSections) setVisibleSections(style.visibleSections);
            if (style.sectionOrder) setSectionOrder(style.sectionOrder);
          }
        }

      } catch (err) {
        console.error('Error cargando personalizador:', err);
        setErrorMsg('Error al conectar con la base de datos.');
      } finally {
        setLoading(false);
      }
    };

    loadCustomizerData();
  }, []);

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

  // Generar y descargar CV PDF
  const handleDownloadCV = async () => {
    setDownloadingCv(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      
      const headers = {
        'Content-Type': 'application/json'
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      // 1. Asegurar optimización por IA llamando al endpoint /cv-generate
      const response = await fetch('http://localhost:5000/api/cv-generate', {
        method: 'POST',
        headers,
        body: JSON.stringify({ 
          profileId: userId,
          cv_style: cvTheme
        })
      });
      const resData = await response.json();

      if (!response.ok) {
        throw new Error(resData.error || 'Error al generar el CV optimizado con IA.');
      }

      setCvData(resData.cvData);

      // 2. Esperar a que carguen las fuentes tipográficas
      if (document.fonts && document.fonts.ready) {
        await document.fonts.ready;
      }

      // Log para validación del tema en generación de PDF
      console.log("Generando PDF con theme:", cvTheme);

      // 3. Compilar PDF en el cliente usando la utilidad unificada
      const { exportToPdf } = await import('../utils/exportToPdf');
      const rawFileName = `CV_${profile?.first_name || 'Usuario'}_${profile?.last_name || ''}.pdf`;
      const fileName = rawFileName
        .replace(/\s+/g, '_')
        .replace(/[^\w.-]/g, '');

      await exportToPdf('cv-sheet-a4-canvas', fileName);

      setSuccessMsg('¡Currículum descargado correctamente en formato PDF!');
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message || 'Error compilando el archivo PDF.');
    } finally {
      setDownloadingCv(false);
    }
  };

  // Guardar estilo como borrador en la base de datos
  const handleSaveDraft = async () => {
    if (!cvId) {
      setErrorMsg('Primero genera un CV para poder guardar el borrador.');
      return;
    }
    setSavingDraft(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const data = await apiRequest(`/cv/${cvId}`, 'PUT', {
        status: 'draft',
        cv_style: cvTheme
      });
      if (data.success) {
        setSuccessMsg('¡Diseño guardado como borrador correctamente!');
      } else {
        throw new Error(data.error || 'No se pudo guardar el borrador.');
      }
    } catch (err) {
      console.error('Error guardando borrador:', err);
      setErrorMsg(err.message || 'Error al guardar el borrador.');
    } finally {
      setSavingDraft(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 min-h-full bg-slate-50 flex flex-col justify-center items-center font-sans">
        <Loader2 className="h-8 w-8 text-indigo-650 animate-spin mb-2" />
        <p className="text-slate-500 text-sm">Cargando personalizador de plantillas...</p>
      </div>
    );
  }

  const isProfileEmpty = !profile || !profile.first_name || !profile.career;

  return (
    <div className="flex-1 min-h-full overflow-y-auto bg-slate-50 px-4 py-6 font-sans sm:px-6 lg:px-8 lg:py-8">
      {downloadingCv && <LoadingOverlay message="Compilando PDF..." submessage="Estamos aplicando tus preferencias de diseño y empaquetando el documento." />}

      <div className="mx-auto w-full max-w-[1600px] space-y-6">
        {/* Cabecera / Acciones */}
        <div className="flex justify-end gap-2">
          <button
            onClick={handleSaveDraft}
            disabled={!cvId || savingDraft}
            className="border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold px-5 py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40 transition-all"
          >
            {savingDraft ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Guardar borrador
          </button>
          <button
            onClick={handleDownloadCV}
            disabled={isProfileEmpty || downloadingCv}
            className="bg-indigo-650 hover:bg-indigo-700 text-white font-bold px-5 py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-md shadow-indigo-650/15 cursor-pointer disabled:opacity-50 transition-all"
          >
            <Download className="h-4 w-4" />
            Descargar CV
          </button>
        </div>

        {/* Alertas */}
        {errorMsg && (
          <div className="flex w-full items-start gap-3 rounded-xl border border-rose-100 bg-rose-50 p-4 text-xs text-rose-650">
            <AlertCircle className="h-4.5 w-4.5 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="flex w-full items-start gap-3 rounded-xl border border-emerald-100 bg-emerald-50 p-4 text-xs text-emerald-650">
            <CheckCircle className="h-4.5 w-4.5 shrink-0 mt-0.5 text-emerald-650" />
            <span>{successMsg}</span>
          </div>
        )}

        {isProfileEmpty ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center max-w-md mx-auto space-y-4 shadow-sm mt-12">
            <AlertCircle className="h-12 w-12 text-amber-500 mx-auto" />
            <h3 className="text-lg font-bold text-slate-900">Perfil Incompleto</h3>
            <p className="text-slate-500 text-xs leading-relaxed">
              Completa tus datos profesionales en la sección "Mi perfil" antes de poder personalizar tu CV.
            </p>
          </div>
        ) : (
          <div className="grid w-full grid-cols-1 items-start gap-8 lg:grid-cols-12">
          {/* Left Column - Configurator */}
          <div className="lg:col-span-4 bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
              <Sliders className="h-4.5 w-4.5 text-indigo-650" />
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-900">Ajustes de Diseño</h3>
            </div>

            {/* Template Selector */}
            <TemplateSelector selected={template} onChange={setTemplate} />

            {/* Color Selector */}
            <ColorSelector selected={color} onChange={setColor} />

            {/* Font Selector */}
            <FontSelector selected={font} onChange={setFont} />

            {/* Font Size Selector */}
            <div className="space-y-2 text-left">
              <label className="block text-slate-500 text-[10px] font-bold uppercase tracking-wider">
                Tamaño de fuente
              </label>
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
                      className={`flex-1 bg-slate-50 border rounded-xl py-1.5 px-3 text-[11px] font-bold transition-all cursor-pointer text-center ${
                        isActive
                          ? 'border-indigo-650 bg-indigo-50/20 text-indigo-650 ring-2 ring-indigo-650/10'
                          : 'border-slate-200 text-slate-500 hover:bg-slate-100/40'
                      }`}
                    >
                      {size.name}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Spacing Selector */}
            <div className="space-y-2 text-left">
              <label className="block text-slate-500 text-[10px] font-bold uppercase tracking-wider">
                Espaciado
              </label>
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
                      className={`flex-1 bg-slate-50 border rounded-xl py-1.5 px-3 text-[11px] font-bold transition-all cursor-pointer text-center ${
                        isActive
                          ? 'border-indigo-650 bg-indigo-50/20 text-indigo-650 ring-2 ring-indigo-650/10'
                          : 'border-slate-200 text-slate-500 hover:bg-slate-100/40'
                      }`}
                    >
                      {sp.name}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* El selector de estilo de encabezado ha sido removido porque cada plantilla gestiona su cabecera premium de forma nativa */}

            {/* Section Ordering Control */}
            <div className="space-y-2 text-left">
              <label className="block text-slate-500 text-[10px] font-bold uppercase tracking-wider">
                Orden de secciones
              </label>
              <div className="space-y-1.5 bg-slate-50/40 border border-slate-200/60 rounded-xl p-2.5">
                {sectionOrder.map((secId, idx) => (
                  <div key={secId} className="flex justify-between items-center text-xs bg-white border border-slate-150 rounded-lg p-1.5 px-2.5 shadow-sm">
                    <span className="font-semibold text-slate-700">{getSectionLabel(secId)}</span>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        disabled={idx === 0}
                        onClick={() => moveSection(idx, -1)}
                        className="h-5 w-5 rounded bg-slate-50 hover:bg-slate-100 border text-slate-500 text-[9px] font-bold cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center"
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        disabled={idx === sectionOrder.length - 1}
                        onClick={() => moveSection(idx, 1)}
                        className="h-5 w-5 rounded bg-slate-50 hover:bg-slate-100 border text-slate-500 text-[9px] font-bold cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center"
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

          {/* Right Column - Live Preview */}
          <div className="lg:col-span-8 flex flex-col items-center space-y-4">
            <div className="flex items-center justify-between w-full pb-2 border-b border-slate-200">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
                <Eye className="h-4.5 w-4.5 text-indigo-650" />
                Previsualización en tiempo real
              </h3>
              <span className="text-[10px] text-slate-400 font-bold uppercase">Formato A4</span>
            </div>

            {/* Canvas wrapper with scaling to fit container width nicely */}
            <div className="w-full overflow-x-auto bg-slate-100/50 border border-slate-200/80 rounded-2xl p-6 flex justify-center shadow-inner">
              <CVPreview
                profile={profile}
                cvData={cvData}
                theme={cvTheme}
                sections={visibleSections}
                sectionOrder={sectionOrder}
              />
            </div>
            
            <p className="text-[11px] text-slate-400 text-center">
              * La vista previa puede variar ligeramente en la descarga final de PDF según el motor del navegador.
            </p>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
