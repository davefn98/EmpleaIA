import { useState, useEffect } from 'react';
import { supabase } from '../utils/supabaseClient';
import { loadUserSnapshot } from '../utils/userDataApi';
import { useNotification } from '../components/common/notificationContext';
import { mapError } from '../utils/errorMapper';
import { 
  FileText, 
  Mail, 
  Trash2, 
  Eye, 
  Edit3, 
  Clock, 
  Loader2, 
  AlertCircle, 
  CheckCircle2, 
  Search,
  X
} from 'lucide-react';
import CVPreview from '../components/cv/CVPreview';
import { restoreCvDocument, restoreCvTheme } from '../utils/documentDrafts';

export default function Drafts({ navigateTo }) {
  const { toast, showConfirm } = useNotification();
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState([]);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [filterType, setFilterType] = useState('all'); // 'all' | 'cv' | 'letter'
  const [searchTerm, setSearchTerm] = useState('');

  // Estados para Modal de Vista Previa Rápida
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setShowPreviewModal(false);
        setSelectedDoc(null);
      }
    };
    if (showPreviewModal) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [showPreviewModal]);

  const fetchDrafts = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setLoading(false);
        return;
      }
      const uid = session.user.id;

      const snapshot = await loadUserSnapshot(uid);
      const cvs = snapshot.cvs || [];
      const letters = snapshot.letters || [];

      // 3. Combinar y Normalizar con acceso defensivo a columnas opcionales
      const normalizedCvs = (cvs || []).map(cv => ({
        id: cv.id,
        title: cv.document_title || `CV de ${session.user.email.split('@')[0]}`,
        type: 'cv',
        status: cv.status || 'generated',
        updatedAt: cv.updated_at || cv.created_at,
        data: cv.cv_data,
        style: cv.cv_style || null
      }));

      const normalizedLetters = (letters || []).map(l => ({
        id: l.id,
        title: l.document_title || `Carta para ${l.job_offer_text ? l.job_offer_text.slice(0, 20) : 'Vacante'}`,
        type: 'letter',
        status: l.status || 'generated',
        updatedAt: l.updated_at || l.created_at,
        data: { letter_content: l.letter_content, job_offer_text: l.job_offer_text }
      }));

      const allDrafts = [...normalizedCvs, ...normalizedLetters];

      // Ordenar por fecha de modificación descendente
      allDrafts.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

      setDrafts(allDrafts);
    } catch (err) {
      console.error('Error cargando borradores:', err);
      setErrorMsg(mapError(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDrafts();
  }, []);

  const handleDelete = (id, type) => {
    showConfirm({
      title: `¿Eliminar ${type === 'cv' ? 'currículum' : 'borrador'}?`,
      message: `¿Estás seguro de que deseas eliminar este ${type === 'cv' ? 'currículum' : 'borrador de carta'} permanentemente?`,
      onConfirm: async () => {
        setErrorMsg('');
        setSuccessMsg('');
        try {
          const table = type === 'cv' ? 'generated_cvs' : 'cover_letters';
          const { error } = await supabase
            .from(table)
            .delete()
            .eq('id', id);

          if (error) throw error;

          toast.success('Borrador eliminado correctamente.');
          setDrafts(prev => prev.filter(d => d.id !== id));
        } catch (err) {
          console.error('Error al eliminar borrador:', err);
          setErrorMsg(mapError(err));
        }
      }
    });
  };

  const handleEdit = (doc) => {
    if (doc.type === 'cv') {
      localStorage.removeItem('empleaia_edit_letter_id');
      localStorage.setItem('empleaia_edit_cv_id', doc.id);
      if (doc.style) {
        // Cargar estilos del CV en localStorage
        localStorage.setItem('empleaia_cv_theme_template', doc.style.template || 'classic');
        localStorage.setItem('empleaia_cv_theme_color', doc.style.primaryColor || 'purple');
        localStorage.setItem('empleaia_cv_theme_font', doc.style.fontFamily || 'inter');
        localStorage.setItem('empleaia_cv_theme_fontSize', doc.style.fontSize || 'normal');
        localStorage.setItem('empleaia_cv_theme_spacing', doc.style.spacing || 'normal');
        localStorage.setItem('empleaia_cv_theme_headerStyle', doc.style.headerStyle || 'centered');
        if (doc.style.visibleSections) localStorage.setItem('empleaia_cv_theme_visibleSections', JSON.stringify(doc.style.visibleSections));
        if (doc.style.sectionOrder) localStorage.setItem('empleaia_cv_theme_sectionOrder', JSON.stringify(doc.style.sectionOrder));
      }
      navigateTo('/documents/cv');
    } else {
      localStorage.removeItem('empleaia_edit_cv_id');
      localStorage.setItem('empleaia_edit_letter_id', doc.id);
      navigateTo('/documents/cover-letter');
    }
  };

  const handleOpenPreview = (doc) => {
    setSelectedDoc(doc);
    setShowPreviewModal(true);
  };

  const getStatusBadge = (status) => {
    const badges = {
      draft: { text: 'Borrador', classes: 'bg-slate-100 text-slate-700 border-slate-200' },
      generated: { text: 'Generado', classes: 'bg-indigo-50 text-indigo-700 border-indigo-150' },
      downloaded: { text: 'Descargado', classes: 'bg-emerald-50 text-emerald-700 border-emerald-150' },
      pending: { text: 'Pendiente', classes: 'bg-amber-50 text-amber-700 border-amber-150' }
    };
    const badge = badges[status] || badges.generated;
    return (
      <span className={`px-2.5 py-1 rounded-lg border text-[10px] font-extrabold uppercase tracking-wide ${badge.classes}`}>
        {badge.text}
      </span>
    );
  };

  // Filtrar documentos
  const filteredDrafts = drafts.filter(doc => {
    const matchesType = filterType === 'all' || doc.type === filterType;
    const matchesSearch = doc.title.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesType && matchesSearch;
  });

  if (loading) {
    return (
      <div className="flex-1 min-h-full bg-slate-50 flex flex-col justify-center items-center font-sans">
        <Loader2 className="h-8 w-8 text-indigo-650 animate-spin mb-2" />
        <p className="text-slate-500 text-sm">Cargando tus borradores...</p>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-full overflow-y-auto bg-slate-50 px-4 py-6 font-sans sm:px-6 lg:px-8 lg:py-8">
      <div className="mx-auto w-full max-w-[1600px]">
        


        {/* Alertas */}
        {errorMsg && (
          <div className="bg-rose-50 border border-rose-100 text-rose-650 text-xs rounded-xl p-4 flex items-start gap-3 mb-6">
            <AlertCircle className="h-4.5 w-4.5 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="bg-emerald-50 border border-emerald-100 text-emerald-650 text-xs rounded-xl p-4 flex items-start gap-3 mb-6">
            <CheckCircle2 className="h-4.5 w-4.5 shrink-0 mt-0.5 text-emerald-600" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Filtros e Historial */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6">
          
          {/* Barra de Filtros */}
          <div className="flex flex-col md:flex-row gap-4 justify-between items-center pb-4 border-b border-slate-150">
            {/* Pestañas de Filtro Tipo */}
            <div className="flex bg-slate-50 dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-800/60 text-[11px] font-bold w-full md:w-auto gap-1">
              <button
                onClick={() => setFilterType('all')}
                className={`flex-1 md:flex-none px-4 py-2 rounded-lg transition-all cursor-pointer ${
                  filterType === 'all'
                    ? 'bg-indigo-600 text-white shadow-sm border border-transparent'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-white/70 dark:hover:bg-slate-800/70 border border-transparent'
                }`}
              >
                Todos ({drafts.length})
              </button>
              <button
                onClick={() => setFilterType('cv')}
                className={`flex-1 md:flex-none px-4 py-2 rounded-lg transition-all cursor-pointer ${
                  filterType === 'cv'
                    ? 'bg-indigo-600 text-white shadow-sm border border-transparent'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-white/70 dark:hover:bg-slate-800/70 border border-transparent'
                }`}
              >
                CVs ({drafts.filter(d => d.type === 'cv').length})
              </button>
              <button
                onClick={() => setFilterType('letter')}
                className={`flex-1 md:flex-none px-4 py-2 rounded-lg transition-all cursor-pointer ${
                  filterType === 'letter'
                    ? 'bg-indigo-600 text-white shadow-sm border border-transparent'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-white/70 dark:hover:bg-slate-800/70 border border-transparent'
                }`}
              >
                Cartas ({drafts.filter(d => d.type === 'letter').length})
              </button>
            </div>

            {/* Input de Búsqueda */}
            <div className="relative w-full md:w-64">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar documento..."
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2 text-xs focus:outline-none focus:border-indigo-500 text-slate-900"
              />
              <Search className="h-4 w-4 text-slate-400 absolute left-3 top-2.5" />
            </div>
          </div>

          {/* Tabla de Documentos */}
          <div className="overflow-x-auto">
            {filteredDrafts.length > 0 ? (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 text-slate-400 text-[10px] font-black uppercase tracking-wider">
                    <th className="pb-3 pt-1 pl-2">Documento</th>
                    <th className="pb-3 pt-1">Tipo</th>
                    <th className="pb-3 pt-1">Estado</th>
                    <th className="pb-3 pt-1 whitespace-nowrap">Última modificación</th>
                    <th className="pb-3 pt-1 pr-2 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs text-slate-700 font-medium">
                  {filteredDrafts.map((doc) => (
                    <tr key={doc.id} className="hover:bg-slate-50/40 transition-colors">
                      <td className="py-4 pl-2 font-bold text-slate-850">
                        <div className="flex items-center gap-2">
                          <div className={`h-8 w-8 rounded-lg flex items-center justify-center border ${
                            doc.type === 'cv' ? 'bg-blue-50 border-blue-100 text-blue-600' : 'bg-violet-50 border-violet-100 text-violet-600'
                          }`}>
                            {doc.type === 'cv' ? <FileText className="h-4 w-4" /> : <Mail className="h-4 w-4" />}
                          </div>
                          <span>{doc.title}</span>
                        </div>
                      </td>
                      <td className="py-4 whitespace-nowrap">
                        <span className="font-semibold text-slate-500">
                          {doc.type === 'cv' ? 'Curriculum Vitae' : 'Carta de presentación'}
                        </span>
                      </td>
                      <td className="py-4">{getStatusBadge(doc.status)}</td>
                      <td className="py-4 text-slate-500 whitespace-nowrap">
                        {new Date(doc.updatedAt).toLocaleDateString('es-PE', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </td>
                      <td className="py-4 text-right pr-2">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleOpenPreview(doc)}
                            className="p-2 text-slate-450 hover:text-sky-600 hover:bg-sky-50 rounded-xl transition-all cursor-pointer"
                            title="Visualizar documento"
                          >
                            <Eye className="h-4.5 w-4.5" />
                          </button>
                          <button
                            onClick={() => handleEdit(doc)}
                            className="p-2 text-slate-450 hover:text-violet-600 hover:bg-violet-50 rounded-xl transition-all cursor-pointer"
                            title="Editar documento"
                          >
                            <Edit3 className="h-4.5 w-4.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(doc.id, doc.type)}
                            className="p-2 text-slate-450 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all cursor-pointer"
                            title="Eliminar documento"
                          >
                            <Trash2 className="h-4.5 w-4.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="text-center py-12 space-y-3">
                <Clock className="h-12 w-12 text-slate-300 mx-auto" />
                <h4 className="text-sm font-bold text-slate-600">No se encontraron borradores</h4>
                <p className="text-xs text-slate-400 max-w-xs mx-auto leading-relaxed">
                  Genera un CV o una carta de presentación y guárdalos como borrador para gestionarlos en esta sección.
                </p>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Modal de Vista Previa */}
      {showPreviewModal && selectedDoc && (
        <div 
          onClick={() => { setShowPreviewModal(false); setSelectedDoc(null); }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 animate-fade-in animate-duration-200"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden"
          >
            <div className="flex justify-between items-center px-6 py-4 border-b border-slate-150 dark:border-slate-800 shrink-0">
              <div className="text-left">
                <span className="text-[9px] text-indigo-650 dark:text-indigo-400 font-black uppercase tracking-widest block">Vista Previa Rápida</span>
                <h3 className="text-sm font-black text-slate-900 dark:text-white">{selectedDoc.title}</h3>
              </div>
              <button
                onClick={() => { setShowPreviewModal(false); setSelectedDoc(null); }}
                className="text-slate-400 hover:text-slate-650 dark:hover:text-slate-350 p-1.5 rounded-lg border border-slate-200 dark:border-slate-850 bg-slate-50 dark:bg-slate-850 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer flex items-center justify-center"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 bg-slate-100/50 dark:bg-slate-950/20 flex justify-center">
              {selectedDoc.type === 'cv' ? (
                <div className="scale-[0.9] origin-top max-w-full">
                  <CVPreview
                    profile={restoreCvDocument(selectedDoc.data)}
                    cvData={selectedDoc.data}
                    theme={restoreCvTheme(selectedDoc.style)}
                  />
                </div>
              ) : (
                <div 
                  className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-md p-10 font-serif text-left shrink-0 text-justify border border-slate-150 dark:border-slate-800"
                  style={{ 
                    fontFamily: 'Georgia, Cambria, "Times New Roman", Times, serif',
                    width: '650px',
                    minHeight: '800px',
                    boxSizing: 'border-box',
                    lineHeight: '1.6',
                    fontSize: '13px'
                  }}
                >
                  <div className="whitespace-pre-wrap">
                    {selectedDoc.data.letter_content}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
