import { useState, useEffect } from 'react';
import { supabase } from '../utils/supabaseClient';
import { loadUserSnapshot } from '../utils/userDataApi';
import { useNotification } from '../components/common/notificationContext';
import { mapError } from '../utils/errorMapper';
import { 
  Sparkles, 
  FileText, 
  Mail, 
  MessageSquare, 
  Award, 
  TrendingUp,
  Clock,
  Trash2
} from 'lucide-react';

export default function Dashboard({ setActiveView }) {
  const { toast, showConfirm } = useNotification();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalCvs: 0,
    totalLetters: 0,
    totalInterviews: 0,
    avgScore: null,
    streak: 0
  });

  const [recentActivity, setRecentActivity] = useState([]);
  const [history, setHistory] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [metricsTab, setMetricsTab] = useState('general');
  // Error al cargar las métricas: se muestra banner en vez de KPIs en cero
  const [loadError, setLoadError] = useState('');

  const fetchRealData = async () => {
    setLoading(true);
    setLoadError('');
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setLoading(false);
      return;
    }

    try {
      const snapshot = await loadUserSnapshot(session.user.id);
      const pData = snapshot.profile;
      const cvRows = (snapshot.cvs || []).slice(0, 3);
      const letterRows = (snapshot.letters || []).slice(0, 3);
      const ints = snapshot.interviews || [];
      const cvCount = snapshot.cvs?.length || 0;
      const letterCount = snapshot.letters?.length || 0;
      if (pData) setProfile(pData);

      let totalScore = 0;
      let scoreCount = 0;
      const formattedHistory = [];
      const combinedDocs = [];
      const allImprovements = [];

      if (ints && ints.length > 0) {
        ints.forEach((intv) => {
          let intvScore = 0;
          let intvCount = 0;
          
          if (intv.interview_messages) {
            intv.interview_messages.forEach(m => {
              if (m.sender === 'user' && m.evaluation && typeof m.evaluation.score === 'number') {
                intvScore += m.evaluation.score;
                intvCount++;
                if(['completed','completed_early'].includes(intv.status)) {totalScore += m.evaluation.score;scoreCount++;}
              }
              if (m.sender === 'user' && m.evaluation && Array.isArray(m.evaluation.improvements)) {
                allImprovements.push(...m.evaluation.improvements);
              }
            });
          }

          const calculatedIntScore = intvCount > 0 ? Math.round(intvScore / intvCount) : null;
          
          formattedHistory.push({
            id: intv.id,
            type: intv.interview_type === 'technical' ? 'Técnica' : intv.interview_type === 'behavioral' ? 'Por competencias' : 'General',
            date: new Date(intv.created_at).toLocaleDateString('es-PE', { day: 'numeric', month: 'short', year: 'numeric' }),
            score: calculatedIntScore,
            status:intv.status
          });
        });
      }

      // 1. Calcular racha dinámica
      let calculatedStreak = 0;
      if (ints && ints.length > 0) {
        const uniqueDates = [...new Set(ints.map(i => new Date(i.created_at).toISOString().split('T')[0]))];
        uniqueDates.sort((a, b) => new Date(b) - new Date(a));
        
        const todayStr = new Date().toISOString().split('T')[0];
        const yesterdayStr = new Date(Date.now() - 86400000).toISOString().split('T')[0];
        
        if (uniqueDates[0] === todayStr || uniqueDates[0] === yesterdayStr) {
          calculatedStreak = 1;
          let currentRefDate = new Date(uniqueDates[0]);
          
          for (let i = 1; i < uniqueDates.length; i++) {
            const nextDate = new Date(uniqueDates[i]);
            const diffTime = Math.abs(currentRefDate - nextDate);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            
            if (diffDays === 1) {
              calculatedStreak++;
              currentRefDate = nextDate;
            } else if (diffDays > 1) {
              break;
            }
          }
        }
      }

      // 2. Establecer métricas reales
      setStats({
        totalCvs: cvCount || 0,
        totalLetters: letterCount || 0,
        totalInterviews: ints?.length || 0,
        avgScore: scoreCount > 0 ? Math.round(totalScore / scoreCount) : null,
        completedInterviews: ints.filter(i => ['completed','completed_early'].includes(i.status)).length,
        pausedInterviews: ints.filter(i => i.status === 'paused').length,
        streak: calculatedStreak
      });
      
      // 3. Establecer historial
      setHistory(formattedHistory.slice(0, 4));

      // 4. Combinar actividades reales
      if (ints && ints.length > 0) {
        ints.slice(0, 2).forEach((intv) => {
          let intvScore = 0;
          let intvCount = 0;
          if (intv.interview_messages) {
            intv.interview_messages.forEach(m => {
              if (m.sender === 'user' && m.evaluation && typeof m.evaluation.score === 'number') {
                intvScore += m.evaluation.score;
                intvCount++;
              }
            });
          }
          const calculatedIntScore = intvCount > 0 ? Math.round(intvScore / intvCount) : null;
          combinedDocs.push({
            id: intv.id,
            type: 'interview',
            title: `Entrevista ${intv.interview_type === 'technical' ? 'técnica' : intv.interview_type === 'behavioral' ? 'por competencias' : 'general'}`,
            score: calculatedIntScore != null ? `Puntaje: ${calculatedIntScore}%` : ({active:'En curso',paused:'Pausada',completed:'Sin evaluación individual',completed_early:'Finalizada anticipadamente',pending_ai_feedback:'Análisis pendiente',failed_to_start:'No iniciada',abandoned:'Descartada'}[intv.status] || 'Sin evaluar'),
            date: new Date(intv.created_at).toLocaleDateString('es-PE', { day: 'numeric', month: 'short' }),
            timestamp: new Date(intv.created_at).getTime()
          });
        });
      }

      if (cvRows && cvRows.length > 0) {
        cvRows.forEach(cv => {
          combinedDocs.push({
            id: cv.id,
            type: 'cv',
            title: `CV de ${cv.cv_data?.career || pData?.career || 'Egresado'}`,
            date: new Date(cv.created_at).toLocaleDateString('es-PE', { day: 'numeric', month: 'short' }),
            timestamp: new Date(cv.created_at).getTime()
          });
        });
      }

      if (letterRows && letterRows.length > 0) {
        letterRows.forEach(l => {
          combinedDocs.push({
            id: l.id,
            type: 'letter',
            title: `Carta: ${l.job_offer_text.slice(0, 22)}...`,
            date: new Date(l.created_at).toLocaleDateString('es-PE', { day: 'numeric', month: 'short' }),
            timestamp: new Date(l.created_at).getTime()
          });
        });
      }

      combinedDocs.sort((a, b) => b.timestamp - a.timestamp);
      setRecentActivity(combinedDocs.slice(0, 3));

      // 5. Cargar recomendaciones reales
      if (allImprovements.length > 0) {
        const uniqueImps = [...new Set(allImprovements)];
        const dynamicRecs = uniqueImps.slice(0, 3).map((imp, index) => ({
          id: index + 1,
          title: `Mejora observada ${index+1}`,
          desc: imp
        }));
        setRecommendations(dynamicRecs);
      } else {
        setRecommendations([]);
      }

    } catch (err) {
      console.error('Error cargando métricas en dashboard:', err);
      // Con sesión expirada api.js ya cerró sesión y App redirige al login.
      if (err.code !== 'SESSION_EXPIRED') {
        setLoadError(mapError(err));
      }
    } finally {
      setLoading(false);
    }
  };

  const openInterviewHistory = (id) => {
    sessionStorage.setItem('empleaia_history_interview_id',id);
    setActiveView?.('history');
  };

  const handleDeleteDocument = (id, type) => {
    showConfirm({
      title: `¿Eliminar ${type === 'cv' ? 'currículum' : 'documento'}?`,
      message: `¿Estás seguro de que deseas eliminar este ${type === 'cv' ? 'currículum' : 'documento'} permanentemente?`,
      onConfirm: async () => {
        try {
          const table = type === 'cv' ? 'generated_cvs' : 'cover_letters';
          const { error } = await supabase
            .from(table)
            .delete()
            .eq('id', id);

          if (error) throw error;
          
          toast.success('Documento eliminado correctamente.');
          // Refrescar el Dashboard
          fetchRealData();
        } catch (err) {
          console.error('Error al eliminar:', err);
          toast.error(mapError(err));
        }
      }
    });
  };

  useEffect(() => {
    fetchRealData();
  }, []);

  // Generar coordenadas dinámicas de gráfico
  const chronoData = [...history].filter(i => i.score != null).reverse();
  const N = chronoData.length;
  let chartPath = '';
  let areaPath = '';
  let chartPoints = [];
  
  if (N > 0) {
    if (N === 1) {
      const score = chronoData[0].score || 0;
      const y = Math.round(45 - (score * 35) / 100);
      chartPath = `M 5,${y} L 95,${y}`;
      areaPath = `M 5,${y} L 95,${y} L 95,50 L 5,50 Z`;
      chartPoints = [{ cx: 5, cy: y }, { cx: 95, cy: y }];
    } else {
      chartPoints = chronoData.map((d, i) => {
        const score = d.score || 0;
        const x = Math.round(5 + (i * 90) / (N - 1));
        const y = Math.round(45 - (score * 35) / 100);
        return { cx: x, cy: y };
      });
      chartPath = chartPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.cx},${p.cy}`).join(' ');
      areaPath = `${chartPath} L ${chartPoints[chartPoints.length - 1].cx},50 L ${chartPoints[0].cx},50 Z`;
    }
  }



  // Render SKELETON (Requisito 5)
  if (loading) {
    return (
      <div className="flex-1 min-h-full overflow-y-auto bg-slate-50 px-4 py-6 font-sans sm:px-6 lg:px-8 lg:py-8">
        <div className="mx-auto w-full max-w-[1600px]">
        {/* SECCIÓN BIENVENIDA SKELETON */}
        <div className="mb-8">
          <div className="bg-white border border-slate-200/80 rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm animate-pulse">
            <div className="space-y-2.5 flex-1">
              <div className="h-5 bg-slate-200 rounded-lg w-48"></div>
              <div className="h-3.5 bg-slate-200 rounded-lg w-3/4"></div>
            </div>
            <div className="h-9 bg-slate-200 rounded-xl w-36 shrink-0"></div>
          </div>
        </div>

        {/* KPI GRID SKELETON */}
        <div className="mb-8">
          <div className="h-4 bg-slate-200 rounded-md w-28 mb-4 animate-pulse"></div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm space-y-3 animate-pulse">
                <div className="flex justify-between items-center">
                  <div className="h-3 bg-slate-200 rounded w-16"></div>
                  <div className="h-5 w-5 bg-slate-100 rounded-full"></div>
                </div>
                <div className="h-8 bg-slate-200 rounded-lg w-12"></div>
                <div className="h-3 bg-slate-150 rounded w-20"></div>
              </div>
            ))}
          </div>
        </div>

        {/* SECCIÓN DUAL SKELETON */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-8">
          {/* Actividad Reciente */}
          <div className="lg:col-span-4 space-y-4">
            <div className="h-4 bg-slate-200 rounded-md w-24 animate-pulse"></div>
            <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm space-y-4 min-h-[300px] animate-pulse">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex gap-3 items-start border-b border-slate-150 pb-3 last:border-0 last:pb-0">
                  <div className="h-8 w-8 bg-slate-200 rounded-xl shrink-0"></div>
                  <div className="space-y-2 flex-1">
                    <div className="h-3 bg-slate-200 rounded w-3/4"></div>
                    <div className="h-2 bg-slate-150 rounded w-1/2"></div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Mis Métricas */}
          <div className="lg:col-span-8 space-y-4">
            <div className="h-4 bg-slate-200 rounded-md w-24 animate-pulse"></div>
            <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm min-h-[300px] space-y-6 animate-pulse">
              <div className="flex justify-between items-center pb-4 border-b border-slate-100">
                <div className="h-6 bg-slate-200 rounded-lg w-48"></div>
                <div className="h-4 bg-slate-200 rounded-md w-20"></div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-4">
                  <div className="h-8 bg-slate-200 rounded-lg w-24"></div>
                  <div className="h-28 bg-slate-100 rounded-xl"></div>
                </div>
                <div className="space-y-4">
                  <div className="h-4 bg-slate-200 rounded w-24"></div>
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="space-y-1">
                      <div className="h-3 bg-slate-200 rounded w-16"></div>
                      <div className="h-2 bg-slate-100 rounded-full w-full"></div>
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

  return (
    <div className="flex-1 min-h-full overflow-y-auto bg-slate-50 px-4 py-6 font-sans sm:px-6 lg:px-8 lg:py-8">
      <div className="mx-auto w-full max-w-[1600px]">

      {/* Aviso de error de carga: sin él, los KPIs en cero parecen una cuenta vacía */}
      {loadError && (
        <div className="bg-rose-50 border border-rose-100 text-rose-650 text-xs rounded-xl p-4 flex items-center gap-3 mb-6">
          <span className="flex-1">No se pudieron cargar tus métricas. {loadError}</span>
          <button
            onClick={fetchRealData}
            className="shrink-0 bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg cursor-pointer"
          >
            Reintentar
          </button>
        </div>
      )}

      {/* SECCIÓN BIENVENIDA */}
      <div className="mb-8">
        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
          <div className="space-y-1">
            <h3 className="text-lg font-bold text-slate-950 flex items-center gap-2">
              ¡Hola, {profile?.first_name || 'Estudiante'}!
              <Sparkles className="h-5 w-5 text-indigo-500 animate-pulse" />
            </h3>
            <p className="text-slate-400 text-xs md:text-sm">
              Continúa mejorando tu empleabilidad técnica. Tu perfil está alineado con tus objetivos.
            </p>
          </div>
          <button 
            onClick={() => setActiveView('documents-cv')}
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition-all duration-200 shadow-sm cursor-pointer shrink-0"
          >
            Optimizar Documentos
          </button>
        </div>
      </div>

      {/* KPI GRID (Resumen General) */}
      <div className="mb-8">
        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Resumen General</h4>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          
          {/* KPI 1: CV */}
          <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm space-y-2 relative overflow-hidden group">
            <div className="flex justify-between items-center text-slate-400">
              <span className="text-[10px] font-bold uppercase tracking-wider">CV Generados</span>
              <FileText className="h-4.5 w-4.5 text-blue-500" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black text-slate-950">{stats.totalCvs}</span>
              {stats.totalCvs > 0 && (
                <span className="bg-emerald-50 text-emerald-600 text-[9px] font-extrabold px-1.5 py-0.5 rounded-md border border-emerald-100 animate-fade-in">
                  Listo
                </span>
              )}
            </div>
            <p className="text-[9px] text-slate-400">Formatos ATS-friendly</p>
          </div>

          {/* KPI 2: Entrevistas */}
          <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm space-y-2 relative overflow-hidden group">
            <div className="flex justify-between items-center text-slate-400">
              <span className="text-[10px] font-bold uppercase tracking-wider">Entrevistas</span>
              <MessageSquare className="h-4.5 w-4.5 text-indigo-500" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black text-slate-950">{stats.totalInterviews}</span>
              {stats.totalInterviews > 0 && (
                <span className="bg-emerald-50 text-emerald-600 text-[9px] font-extrabold px-1.5 py-0.5 rounded-md border border-emerald-100 animate-fade-in">
                  Registradas
                </span>
              )}
            </div>
            <p className="text-[9px] text-slate-400">{stats.completedInterviews || 0} finalizadas · {stats.pausedInterviews || 0} pausadas</p>
          </div>

          {/* KPI 3: Puntaje Promedio */}
          <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm space-y-2 relative overflow-hidden group">
            <div className="flex justify-between items-center text-slate-400">
              <span className="text-[10px] font-bold uppercase tracking-wider">Puntaje Promedio</span>
              <Award className="h-4.5 w-4.5 text-violet-500" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black text-slate-950">{stats.avgScore == null ? 'Sin evaluar' : `${stats.avgScore}%`}</span>
              {stats.avgScore > 0 && (
                <span className="bg-emerald-50 text-emerald-600 text-[9px] font-extrabold px-1.5 py-0.5 rounded-md border border-emerald-100 animate-fade-in">
                  Promedio
                </span>
              )}
            </div>
            <p className="text-[9px] text-slate-400">Promedio de respuestas de entrevistas finalizadas</p>
          </div>

          {/* KPI 4: Racha */}
          <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm space-y-2 relative overflow-hidden group">
            <div className="flex justify-between items-center text-slate-400">
              <span className="text-[10px] font-bold uppercase tracking-wider">Días de Racha</span>
              <TrendingUp className="h-4.5 w-4.5 text-emerald-500" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black text-slate-950">{stats.streak}</span>
              {stats.streak > 0 && (
                <span className="bg-indigo-50 text-indigo-600 text-[9px] font-extrabold px-1.5 py-0.5 rounded-md border border-indigo-100 animate-fade-in">
                  ¡Sigue así!
                </span>
              )}
            </div>
            <p className="text-[9px] text-slate-400">Días activos seguidos</p>
          </div>

        </div>
      </div>

      {/* SECCIÓN DUAL: ACTIVIDAD RECIENTE Y METRICAS */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-8 items-start">
        
        {/* Columna Izquierda: Actividad Reciente */}
        <div className="lg:col-span-4 space-y-4">
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Actividad Reciente</h4>
          <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm space-y-4 min-h-[300px] flex flex-col justify-center">
             {recentActivity.length > 0 ? (
              recentActivity.map((act) => (
                <div key={act.id} className="flex gap-3 items-start border-b border-slate-150 last:border-0 pb-3 last:pb-0 animate-fade-in group">
                  <div className={`h-8 w-8 rounded-xl flex items-center justify-center shrink-0 border ${
                    act.type === 'interview' ? 'bg-indigo-50 border-indigo-100 text-indigo-650' :
                    act.type === 'cv' ? 'bg-blue-50 border-blue-100 text-blue-650' :
                    'bg-violet-50 border-violet-100 text-violet-650'
                  }`}>
                    {act.type === 'interview' ? <MessageSquare className="h-4 w-4" /> :
                     act.type === 'cv' ? <FileText className="h-4 w-4" /> : <Mail className="h-4 w-4" />}
                  </div>
                  <div className="min-w-0 flex-1 text-left">
                    <p className="text-xs font-bold text-slate-800 leading-tight truncate">{act.title}</p>
                    {act.score && (
                      <span className="inline-block bg-emerald-50 border border-emerald-100 text-emerald-600 text-[9px] font-extrabold px-1.5 py-0.2 mt-1 rounded-md">
                        {act.score}
                      </span>
                    )}
                    <span className="text-[9px] text-slate-450 block mt-1 flex items-center gap-1">
                      <Clock className="h-3 w-3 shrink-0 text-slate-400" />
                      {act.date}
                    </span>
                  </div>
                  {act.type === 'interview' && <button onClick={()=>openInterviewHistory(act.id)} className="text-xs text-indigo-600 font-bold cursor-pointer" aria-label={`Ver detalle de ${act.title}`}>Ver</button>}
                  {(act.type === 'cv' || act.type === 'letter') && (
                    <button
                      onClick={() => handleDeleteDocument(act.id, act.type)}
                      className="opacity-0 group-hover:opacity-100 hover:text-red-500 text-slate-400 p-1 rounded-lg hover:bg-red-50 transition-all duration-200 cursor-pointer shrink-0 self-center"
                      title="Eliminar documento"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))
            ) : (
              <div className="text-center py-8 space-y-2.5 my-auto animate-fade-in">
                <Clock className="h-8 w-8 text-slate-350 mx-auto" />
                <p className="text-xs font-bold text-slate-500">Aún no tienes actividad reciente</p>
                <p className="text-[10px] text-slate-400 max-w-[200px] mx-auto leading-normal">
                  Optimiza tu primer CV o realiza una entrevista para ver tu actividad aquí.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Columna Derecha: Mis Métricas (Figura 14 - Centro) */}
        <div className="lg:col-span-8 space-y-4">
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Mis Métricas</h4>
          <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm min-h-[300px] flex flex-col justify-between">
            
            {/* Cabecera / Pestañas de Filtro */}
            <div className="flex justify-between items-center pb-4 border-b border-slate-100">
              <div className="flex bg-slate-50 dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-850/60 text-[10px] font-bold gap-1">
                {[
                  { id: 'general', label: 'General' },
                  { id: 'interviews', label: 'Entrevistas' },
                  { id: 'documents', label: 'Documentos' },
                  { id: 'skills', label: 'Habilidades' }
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setMetricsTab(tab.id)}
                    className={`px-3 py-1.5 rounded-lg cursor-pointer transition-all ${
                      metricsTab === tab.id
                        ? 'bg-indigo-600 text-white shadow-sm border border-transparent'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-white/70 dark:hover:bg-slate-800/70 border border-transparent'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              <span className="text-[10px] text-slate-400 font-bold uppercase">Histórico Real</span>
            </div>

            {metricsTab === 'general' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 py-4">
              
              {/* Gráfico SVG de línea (Progreso de Score) */}
              <div className="space-y-3">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-3xl font-black text-slate-900">{stats.avgScore == null ? 'Sin evaluar' : `${stats.avgScore}%`}</span>
                  <span className="text-slate-400 text-[10px] font-bold flex items-center shrink-0">
                    Puntaje promedio
                  </span>
                </div>
                
                {/* SVG Vector Line Chart */}
                {history.length > 0 ? (
                  <div className="h-32 w-full relative animate-fade-in">
                    <svg className="w-full h-full" viewBox="0 0 100 50">
                      <defs>
                        <linearGradient id="chart-grad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#4f46e5" stopOpacity="0.15" />
                          <stop offset="100%" stopColor="#4f46e5" stopOpacity="0.0" />
                        </linearGradient>
                      </defs>
                      {/* Grilla */}
                      <line x1="0" y1="10" x2="100" y2="10" stroke="#f1f5f9" strokeWidth="0.5" />
                      <line x1="0" y1="25" x2="100" y2="25" stroke="#f1f5f9" strokeWidth="0.5" />
                      <line x1="0" y1="40" x2="100" y2="40" stroke="#f1f5f9" strokeWidth="0.5" />
                      {/* Línea del Gráfico */}
                      <path
                        d={chartPath}
                        fill="none"
                        stroke="#4f46e5"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                      />
                      {/* Relleno bajo la curva */}
                      <path
                        d={areaPath}
                        fill="url(#chart-grad)"
                      />
                      {/* Puntos interactivos */}
                      {chartPoints.map((p, i) => (
                        <circle key={i} cx={p.cx} cy={p.cy} r={i === chartPoints.length - 1 ? 2 : 1.5} fill="#4f46e5" stroke={i === chartPoints.length - 1 ? "#fff" : "none"} strokeWidth={i === chartPoints.length - 1 ? 0.75 : 0} />
                      ))}
                    </svg>
                    {/* Etiquetas de Fechas */}
                    <div className="flex justify-between text-[8px] text-slate-400 font-bold uppercase mt-1 px-1">
                      {chronoData.map((d) => (
                        <span key={d.id}>{d.date.split(' ')[0] + ' ' + d.date.split(' ')[1]}</span>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="h-32 w-full relative flex flex-col justify-center items-center bg-slate-50 border border-dashed border-slate-200 rounded-xl p-4 text-center animate-fade-in">
                    <TrendingUp className="h-6 w-6 text-slate-350 mb-1" />
                    <p className="text-[10px] text-slate-500 font-bold">Sin datos de progreso</p>
                    <p className="text-[9px] text-slate-400 leading-normal max-w-[155px]">Tus puntajes de entrevista se graficarán aquí.</p>
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-500">
                El promedio refleja las respuestas con evaluación. Las competencias específicas y la confianza no tienen mediciones independientes en esta versión.
              </div>

            </div>
            )}

            {metricsTab === 'interviews' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 py-4 animate-fade-in">
                <div className="space-y-3">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-3xl font-black text-slate-900">{stats.totalInterviews}</span>
                    <span className="text-slate-400 text-[10px] font-bold uppercase">entrevistas registradas</span>
                  </div>
                  <div className="bg-indigo-50/50 border border-indigo-100 rounded-xl p-4">
                    <p className="text-[10px] text-indigo-600 font-bold uppercase tracking-wider">Puntaje promedio</p>
                    <p className="text-2xl font-black text-indigo-650 mt-1">{stats.avgScore == null ? 'Sin evaluar' : `${stats.avgScore}%`}</p>
                  </div>
                </div>
                <div className="space-y-2.5">
                  <span className="text-[10px] text-slate-500 font-extrabold uppercase tracking-wider block">Evolución reciente</span>
                  {history.length > 0 ? history.map((item) => (
                    <div key={item.id} className="flex items-center justify-between bg-slate-50 border border-slate-150 rounded-xl p-3 text-xs">
                      <div>
                        <p className="font-bold text-slate-800">{item.type}</p>
                        <p className="text-[10px] text-slate-400">{item.date} · {({active:'En curso',paused:'Pausada',completed:'Completada',completed_early:'Finalizada anticipadamente',pending_ai_feedback:'Análisis pendiente',failed_to_start:'No iniciada',abandoned:'Descartada'}[item.status] || 'Sin evaluar')}</p>
                      </div>
                      <div className="flex items-center gap-2"><span className="font-black text-indigo-650">{item.score == null ? 'Sin evaluar' : `${item.score}%`}</span><button onClick={()=>openInterviewHistory(item.id)} className="rounded-lg border border-indigo-200 px-2 py-1 text-indigo-600 cursor-pointer" aria-label={`Ver detalle de entrevista ${item.type}`}>Ver detalle</button></div>
                    </div>
                  )) : (
                    <div className="h-32 flex flex-col justify-center items-center bg-slate-50 border border-dashed border-slate-200 rounded-xl text-center p-4">
                      <MessageSquare className="h-6 w-6 text-slate-350 mb-1" />
                      <p className="text-[10px] text-slate-500 font-bold">Aún no hay entrevistas evaluadas</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {metricsTab === 'documents' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 py-4 animate-fade-in">
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-indigo-50/50 border border-indigo-100 rounded-xl p-4">
                    <p className="text-[10px] text-indigo-600 font-bold uppercase tracking-wider">CVs</p>
                    <p className="text-2xl font-black text-slate-900 mt-1">{stats.totalCvs}</p>
                  </div>
                  <div className="bg-slate-50 border border-slate-150 rounded-xl p-4">
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Cartas</p>
                    <p className="text-2xl font-black text-slate-900 mt-1">{stats.totalLetters}</p>
                  </div>
                </div>
                <div className="space-y-2.5">
                  <span className="text-[10px] text-slate-500 font-extrabold uppercase tracking-wider block">Actividad de documentos</span>
                  {recentActivity.filter(item => item.type === 'cv' || item.type === 'letter').length > 0 ? recentActivity.filter(item => item.type === 'cv' || item.type === 'letter').map((item) => (
                    <div key={`${item.type}-${item.id}`} className="flex items-center justify-between bg-slate-50 border border-slate-150 rounded-xl p-3 text-xs">
                      <p className="font-bold text-slate-800 truncate pr-3">{item.title}</p>
                      <span className="text-[10px] text-slate-400 shrink-0">{item.date}</span>
                    </div>
                  )) : (
                    <div className="h-32 flex flex-col justify-center items-center bg-slate-50 border border-dashed border-slate-200 rounded-xl text-center p-4">
                      <FileText className="h-6 w-6 text-slate-350 mb-1" />
                      <p className="text-[10px] text-slate-500 font-bold">Aún no hay documentos generados</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {metricsTab === 'skills' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 py-4 animate-fade-in">
                <div className="space-y-3.5">
                  <span className="text-[10px] text-slate-500 font-extrabold uppercase tracking-wider block">Competencias evaluadas</span>
                  <p className="text-xs text-slate-500">No hay mediciones independientes por competencia. Revisa el feedback de cada respuesta para conocer fortalezas y mejoras observadas.</p>

                </div>
                <div className="space-y-2.5">
                  <span className="text-[10px] text-slate-500 font-extrabold uppercase tracking-wider block">Recomendaciones</span>
                  {recommendations.length > 0 ? recommendations.map((rec) => (
                    <div key={rec.id} className="bg-slate-50 border border-slate-150 rounded-xl p-3 text-xs">
                      <p className="font-bold text-slate-800">{rec.title}</p>
                      <p className="text-[10px] text-slate-500 mt-1 leading-relaxed">{rec.desc}</p>
                    </div>
                  )) : (
                    <div className="h-32 flex flex-col justify-center items-center bg-slate-50 border border-dashed border-slate-200 rounded-xl text-center p-4">
                      <Award className="h-6 w-6 text-slate-350 mb-1" />
                      <p className="text-[10px] text-slate-500 font-bold">Aún no hay habilidades evaluadas</p>
                    </div>
                  )}
                </div>
              </div>
            )}
        </div>
      </div>
      </div>
      </div>
    </div>
  );
}
