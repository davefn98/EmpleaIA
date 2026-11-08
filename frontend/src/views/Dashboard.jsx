import { useState, useEffect } from 'react';
import { supabase } from '../utils/supabaseClient';
import { loadUserSnapshot } from '../utils/userDataApi';
import { useNotification } from '../components/common/notificationContext';
import { mapError } from '../utils/errorMapper';
import { dashboardStart, latestCvDraft } from '../utils/dashboardStart';
import { cvDraftPath } from '../utils/documentDraftRoute';
import { readGenerationAttempts } from '../utils/documentGenerationMetrics';
import DocumentGenerationMetrics from '../components/documents/DocumentGenerationMetrics';
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

const dashboardFrame = 'flex-1 min-h-full overflow-y-auto bg-slate-50 px-4 py-6 font-sans sm:px-6 lg:px-8 lg:py-8';
const primaryAction = 'rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-indigo-700 cursor-pointer';
const secondaryAction = 'rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-700 cursor-pointer';
const isFinishedInterview = (status) => status === 'completed' || status === 'completed_early';
const interviewStatusLabel = {
  active: 'En curso', paused: 'Pausada', completed: 'Finalizada', completed_early: 'Finalizada anticipadamente',
  pending_ai_feedback: 'Análisis pendiente', failed_to_start: 'No iniciada', abandoned: 'Descartada',
};
const documentActivityTime = (document) => new Date(document.updated_at || document.created_at).getTime();
const documentActivityDate = new Intl.DateTimeFormat('es-PE', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

export default function Dashboard({ setActiveView, navigateTo }) {
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
  const [draftCvId, setDraftCvId] = useState(null);
  const [history, setHistory] = useState([]);
  const [generationAttempts, setGenerationAttempts] = useState([]);
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
    setGenerationAttempts(readGenerationAttempts(session.user.id));

    try {
      const snapshot = await loadUserSnapshot(session.user.id);
      const pData = snapshot.profile;
      const cvRows = [...snapshot.cvs].sort((a, b) => documentActivityTime(b) - documentActivityTime(a)).slice(0, 3);
      const letterRows = [...snapshot.letters].sort((a, b) => documentActivityTime(b) - documentActivityTime(a)).slice(0, 3);
      const ints = snapshot.interviews || [];
      const cvCount = snapshot.cvs?.length || 0;
      const letterCount = snapshot.letters?.length || 0;
      setProfile(pData);
      setDraftCvId(latestCvDraft(snapshot.cvs || [])?.id ?? null);

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
                if (isFinishedInterview(intv.status)) {totalScore += m.evaluation.score;scoreCount++;}
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
            timestamp: Date.parse(intv.created_at),
            finishedAt: intv.completed_at || intv.created_at,
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
        completedInterviews: ints.filter(i => isFinishedInterview(i.status)).length,
        pausedInterviews: ints.filter(i => i.status === 'paused').length,
        activeInterviews: ints.filter(i => i.status === 'active').length,
        streak: calculatedStreak
      });
      
      // 3. Establecer historial
      setHistory(formattedHistory);

      // 4. Combinar actividades reales
      if (ints && ints.length > 0) {
        formattedHistory.slice(0, 2).forEach((item) => {
          combinedDocs.push({
            id: item.id,
            type: 'interview',
            title: `Entrevista ${item.type.toLowerCase()}`,
            statusLabel: interviewStatusLabel[item.status] || 'Sin evaluar',
            score: item.score == null ? null : `${isFinishedInterview(item.status) ? 'Puntaje' : 'Puntaje parcial'} ${item.score}/100`,
            date: item.date,
            timestamp: item.timestamp
          });
        });
      }

      if (cvRows && cvRows.length > 0) {
        cvRows.forEach(cv => {
          combinedDocs.push({
            id: cv.id,
            type: 'cv',
            title: cv.document_title || `CV de ${cv.cv_data?.personal_info?.career || cv.cv_data?.career || pData?.career || 'Egresado'}`,
            date: documentActivityDate.format(documentActivityTime(cv)),
            edited: documentActivityTime(cv) > new Date(cv.created_at).getTime(),
            timestamp: documentActivityTime(cv)
          });
        });
      }

      if (letterRows && letterRows.length > 0) {
        letterRows.forEach(l => {
          combinedDocs.push({
            id: l.id,
            type: 'letter',
            title: l.document_title || 'Carta de presentación',
            date: documentActivityDate.format(documentActivityTime(l)),
            edited: documentActivityTime(l) > new Date(l.created_at).getTime(),
            timestamp: documentActivityTime(l)
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

  const openCv = () => {
    localStorage.removeItem('empleaia_historical_cv_data');
    navigateTo(draftCvId ? cvDraftPath(draftCvId) : '/documents/cv');
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
  const chronoData = history.filter(i => isFinishedInterview(i.status) && i.score != null)
    .sort((a, b) => Date.parse(a.finishedAt) - Date.parse(b.finishedAt)).slice(-4);
  const N = chronoData.length;
  const scoreDelta = N >= 2 ? chronoData.at(-1).score - chronoData.at(-2).score : null;
  let chartPath = '';
  let areaPath = '';
  let chartPoints = [];
  
  if (N > 0) {
    if (N === 1) {
      const score = chronoData[0].score || 0;
      const y = Math.round(45 - (score * 35) / 100);
      chartPoints = [{ cx: 50, cy: y }];
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

  if (loadError) {
    return (
      <div className={dashboardFrame}>
        <div role="alert" className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-3 rounded-xl border border-rose-100 bg-rose-50 p-4 text-sm text-rose-700">
          <span className="flex-1">No se pudo cargar Inicio. {loadError}</span>
          <button type="button" onClick={fetchRealData} className={primaryAction}>Reintentar</button>
        </div>
      </div>
    );
  }

  const start = dashboardStart(profile, stats, draftCvId);
  const greeting = profile?.first_name ? `¡Hola, ${profile.first_name}!` : '¡Te damos la bienvenida a EmpleaIA!';

  if (start.stage !== 'active' && generationAttempts.length === 0) {
    const needsProfile = start.stage === 'profile';
    return (
      <div className={dashboardFrame}>
        <div className="mx-auto w-full max-w-[1600px]">
          <section className="rounded-2xl border border-indigo-100 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800 sm:p-8" aria-labelledby="dashboard-start-title">
            <p className="mb-2 text-sm font-semibold text-indigo-700 dark:text-indigo-300">{greeting}</p>
            <h2 id="dashboard-start-title" className="text-2xl font-bold text-slate-950 dark:text-white">
              {needsProfile ? 'Completa los datos básicos de tu perfil' : 'Crea tu primer CV'}
            </h2>
            <p className="mt-2 max-w-xl text-sm text-slate-600 dark:text-slate-300">
              {needsProfile
                ? 'Escribe tus datos o importa un CV para revisarlos antes de guardar.'
                : 'Usa los datos de tu perfil para crear un CV y adaptarlo al puesto que te interesa.'}
            </p>
            {needsProfile && (
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-600 dark:text-slate-300">
                {start.missing.map(({ text }) => <li key={text}>{text}</li>)}
              </ul>
            )}
            <div className="mt-5 flex flex-wrap gap-2">
              {needsProfile ? (
                <>
                  <button type="button" className={primaryAction} onClick={() => setActiveView('profile-edit')}>Completar mi perfil</button>
                  <button type="button" className={secondaryAction} onClick={() => setActiveView('profile-import')}>Importar mi CV</button>
                </>
              ) : (
                <>
                  <button type="button" className={primaryAction} onClick={openCv}>Crear mi primer CV</button>
                  <button type="button" className={secondaryAction} onClick={() => setActiveView('documents-cover-letter')}>Crear carta</button>
                  <button type="button" className={secondaryAction} onClick={() => setActiveView('interviews')}>Practicar una entrevista</button>
                </>
              )}
            </div>
          </section>
        </div>
      </div>
    );
  }

  const hasDocuments = stats.totalCvs > 0 || stats.totalLetters > 0;
  const documentsOnly = hasDocuments && stats.totalInterviews === 0;
  const tabs = [
    ...(stats.avgScore != null ? [{ id: 'general', label: 'General' }] : []),
    ...(stats.totalInterviews ? [{ id: 'interviews', label: 'Entrevistas' }] : []),
    ...(hasDocuments || generationAttempts.length > 0 ? [{ id: 'documents', label: 'Documentos' }] : []),
    ...(recommendations.length ? [{ id: 'skills', label: 'Habilidades' }] : []),
  ];
  const activeMetricsTab = tabs.some(({ id }) => id === metricsTab) ? metricsTab : tabs[0]?.id;

  return (
    <div className={dashboardFrame}>
      <div className="mx-auto w-full max-w-[1600px]">

      {/* SECCIÓN BIENVENIDA */}
      <div className="mb-8">
        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
          <div className="space-y-1">
            <h3 className="text-lg font-bold text-slate-950 flex items-center gap-2">
              {greeting}
              <Sparkles className="h-5 w-5 text-indigo-500 animate-pulse" />
            </h3>
            <p className="text-slate-400 text-xs md:text-sm">
              Revisa tus documentos y el avance de tus entrevistas.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={openCv} className={primaryAction}>{start.action}</button>
            {documentsOnly && (
              <button type="button" onClick={() => setActiveView('interviews')} className={secondaryAction}>Practicar una entrevista</button>
            )}
          </div>
        </div>
      </div>

      <div className={documentsOnly ? 'grid items-start gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]' : 'space-y-6'}>
      {/* Resumen general */}
      <div className="min-w-0">
        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Resumen General</h4>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,12rem),1fr))] gap-4">
          
          {hasDocuments && (
          <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm space-y-2 relative overflow-hidden group">
            <div className="flex justify-between items-center text-slate-400">
              <span className="text-[10px] font-bold uppercase tracking-wider">Documentos guardados</span>
              <FileText className="h-4.5 w-4.5 text-blue-500" />
            </div>
            <p className="text-3xl font-black text-slate-950">{stats.totalCvs + stats.totalLetters}</p>
            <p className="text-[10px] text-slate-500 dark:text-slate-400">
              {[stats.totalCvs && `${stats.totalCvs} CV`, stats.totalLetters && `${stats.totalLetters} ${stats.totalLetters === 1 ? 'carta' : 'cartas'}`].filter(Boolean).join(' · ')}
            </p>
          </div>
          )}

          {/* KPI 2: Entrevistas */}
          {stats.totalInterviews > 0 && (
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
            <p className="text-[9px] text-slate-400">{stats.completedInterviews || 0} finalizadas · {stats.pausedInterviews || 0} en pausa · {stats.activeInterviews || 0} en curso</p>
          </div>
          )}

          {/* KPI 3: Puntaje Promedio */}
          {stats.avgScore != null && (
          <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm space-y-2 relative overflow-hidden group">
            <div className="flex justify-between items-center text-slate-400">
              <span className="text-[10px] font-bold uppercase tracking-wider">Puntaje Promedio</span>
              <Award className="h-4.5 w-4.5 text-violet-500" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black text-slate-950">{stats.avgScore}%</span>
              {stats.avgScore > 0 && (
                <span className="bg-emerald-50 text-emerald-600 text-[9px] font-extrabold px-1.5 py-0.5 rounded-md border border-emerald-100 animate-fade-in">
                  Promedio
                </span>
              )}
            </div>
            <p className="text-[9px] text-slate-400">Promedio de respuestas de entrevistas finalizadas</p>
          </div>
          )}

          {/* KPI 4: Racha */}
          {stats.streak > 0 && (
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
          )}

        </div>
      </div>

      {/* SECCIÓN DUAL: ACTIVIDAD RECIENTE Y METRICAS */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Columna Izquierda: Actividad Reciente */}
        <div className="min-w-0 lg:col-span-4 space-y-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Actividad Reciente</h4>
            {hasDocuments && (
              <button type="button" onClick={() => setActiveView('drafts')} className="cursor-pointer text-xs font-semibold text-indigo-700 hover:underline dark:text-indigo-300">Mis borradores</button>
            )}
          </div>
          <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm space-y-3">
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
                    {act.statusLabel && (
                      <span className="inline-block bg-emerald-50 border border-emerald-100 text-emerald-600 text-[9px] font-extrabold px-1.5 py-0.2 mt-1 rounded-md">
                        {act.statusLabel}
                      </span>
                    )}
                    {act.score && <span className="ml-1 text-[10px] text-slate-600 dark:text-slate-300">{act.score}</span>}
                    <span className="text-[9px] text-slate-450 block mt-1 flex items-center gap-1">
                      <Clock className="h-3 w-3 shrink-0 text-slate-400" />
                      {act.edited ? `Editado · ${act.date}` : act.date}
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
                  Aquí aparecerán tus documentos guardados y tus entrevistas.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Columna Derecha: Mis Métricas (Figura 14 - Centro) */}
        {tabs.length > 0 && <div className="min-w-0 lg:col-span-8 space-y-4">
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Mis Métricas</h4>
          <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm min-h-[300px] flex flex-col justify-between">
            
            {/* Cabecera / Pestañas de Filtro */}
            <div className="flex flex-wrap justify-between items-center gap-2 pb-4 border-b border-slate-100">
              <div className="flex flex-wrap bg-slate-50 dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-850/60 text-[10px] font-bold gap-1">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setMetricsTab(tab.id)}
                    className={`px-3 py-1.5 rounded-lg cursor-pointer transition-all ${
                      activeMetricsTab === tab.id
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

            {activeMetricsTab === 'general' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 py-4">
              
              {/* Gráfico SVG de línea (Progreso de Score) */}
              <div className="space-y-3">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-3xl font-black text-slate-900">{stats.avgScore}%</span>
                  <span className="text-slate-400 text-[10px] font-bold flex items-center shrink-0">
                    Puntaje promedio
                  </span>
                </div>
                
                {/* SVG Vector Line Chart */}
                {chronoData.length > 0 ? (
                  <div className="h-32 w-full relative animate-fade-in">
                    <svg className="w-full h-full" viewBox="0 0 100 50">
                      <defs>
                        <linearGradient id="chart-grad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="var(--accent-text)" stopOpacity="0.15" />
                          <stop offset="100%" stopColor="var(--accent-text)" stopOpacity="0.0" />
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
                        stroke="var(--accent-text)"
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
                        <circle key={chronoData[i].id} cx={p.cx} cy={p.cy} r={i === chartPoints.length - 1 ? 2 : 1.5} fill="var(--accent-text)" stroke={i === chartPoints.length - 1 ? "#fff" : "none"} strokeWidth={i === chartPoints.length - 1 ? 0.75 : 0}>
                          <title>{documentActivityDate.format(new Date(chronoData[i].finishedAt))} · {chronoData[i].score}/100</title>
                        </circle>
                      ))}
                    </svg>
                    {/* Etiquetas de Fechas */}
                    <div className="flex justify-between text-[8px] text-slate-400 font-bold uppercase mt-1 px-1">
                      {chronoData.map((d) => (
                        <span key={d.id}>{d.score}/100</span>
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
                <p>El promedio usa las respuestas evaluadas de entrevistas finalizadas. El gráfico muestra hasta cuatro sesiones finalizadas con puntaje.</p>
                {scoreDelta !== null && <p className="mt-2 font-semibold">Entre las dos últimas sesiones evaluadas: {scoreDelta > 0 ? '+' : ''}{scoreDelta} puntos.</p>}
              </div>

            </div>
            )}

            {activeMetricsTab === 'interviews' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 py-4 animate-fade-in">
                <div className="space-y-3">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-3xl font-black text-slate-900">{stats.totalInterviews}</span>
                    <span className="text-slate-400 text-[10px] font-bold uppercase">entrevistas registradas</span>
                  </div>
                  {stats.avgScore != null && <div className="bg-indigo-50/50 border border-indigo-100 rounded-xl p-4">
                    <p className="text-[10px] text-indigo-600 font-bold uppercase tracking-wider">Puntaje promedio</p>
                    <p className="text-2xl font-black text-indigo-650 mt-1">{stats.avgScore}%</p>
                  </div>}
                </div>
                <div className="space-y-2.5">
                  <span className="text-[10px] text-slate-500 font-extrabold uppercase tracking-wider block">Evolución reciente</span>
                  {history.length > 0 ? history.slice(0, 4).map((item) => (
                    <div key={item.id} className="flex items-center justify-between bg-slate-50 border border-slate-150 rounded-xl p-3 text-xs">
                      <div>
                        <p className="font-bold text-slate-800">{item.type}</p>
                        <p className="text-[10px] text-slate-400">{item.date} · {interviewStatusLabel[item.status] || 'Sin evaluar'}</p>
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

            {activeMetricsTab === 'documents' && (
              <DocumentGenerationMetrics attempts={generationAttempts} />
            )}

            {activeMetricsTab === 'skills' && (
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
        </div>}
      </div>
      </div>
      </div>
    </div>
  );
}
