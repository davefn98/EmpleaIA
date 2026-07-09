import React, { useState, useEffect } from 'react';
import { supabase } from './utils/supabaseClient';
import AppLayout from './components/layout/AppLayout';
import Landing from './views/Landing';
import Login from './views/Login';
import Dashboard from './views/Dashboard';
import Profile from './views/Profile';
import ProfileView from './views/ProfileView';
import CvCustomize from './views/CvCustomize';
import Documents from './views/Documents';
import Interviews from './views/Interviews';
import CompareInterviews from './views/CompareInterviews';
import ActivityHistory from './views/ActivityHistory';
import Drafts from './views/Drafts';
import SettingsView from './views/SettingsView';
import { BookOpen, HelpCircle, GraduationCap, ShieldAlert, Sparkles, TrendingUp, Settings, Loader2, FileText, MessageSquare, Award, Clock, Calendar, CheckCircle2, ChevronRight, Mail } from 'lucide-react';

function App() {
  const [user, setUser] = useState(null);
  const [currentPath, setCurrentPath] = useState(window.location.pathname);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [showTimeoutWarning, setShowTimeoutWarning] = useState(false);

  // Lógica de tema Light / Dark
  const [theme, setTheme] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('theme') || 'light';
    }
    return 'light';
  });

  useEffect(() => {
    localStorage.setItem('theme', theme);
    const isPublicRoute = currentPath === '/' || currentPath === '/login' || currentPath === '/register';
    document.documentElement.classList.toggle('dark', Boolean(user) && !isPublicRoute && theme === 'dark');
  }, [theme, user, currentPath]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  // Estados de datos cargados en tiempo real para vistas internas
  const [profile, setProfile] = useState(null);
  const [stats, setStats] = useState({ totalCvs: 0, totalLetters: 0, totalInterviews: 0, avgScore: 0, streak: 0 });
  const [hasActivity, setHasActivity] = useState(false);
  const [loadingViewData, setLoadingViewData] = useState(false);
  const [history, setHistory] = useState([]);

  // Navegar a una ruta actualizando el historial
  const navigateTo = (path) => {
    window.history.pushState({}, '', path);
    setCurrentPath(path);
  };

  // Función compatible con setActiveView utilizada por Sidebar y subcomponentes
  const setActiveView = (viewName) => {
    const pathToView = {
      dashboard: '/dashboard',
      profile: '/profile/view',
      documents: '/documents/cv',
      'documents-cv': '/documents/cv',
      'documents-cover-letter': '/documents/cover-letter',
      interviews: '/interviews',
      compare: '/interviews/compare',
      history: '/historial',
      metrics: '/metrics',
      resources: '/resources',
      settings: '/settings',
      drafts: '/drafts',
      landing: '/',
      login: '/login'
    };
    navigateTo(pathToView[viewName] || '/dashboard');
  };

  // Obtener la vista activa calculada a partir del pathname y estado de login (soportando rutas en español y módulos específicos)
  let activeView = 'landing';
  if (!user) {
    if (currentPath === '/login') activeView = 'login';
    else activeView = 'landing';
  } else {
    if (currentPath === '/profile' || currentPath === '/mi-perfil') activeView = 'documents-cv';
    else if (currentPath === '/profile/view') activeView = 'profile-view'; // HU06 view profile
    else if (currentPath === '/documents/cv/customize') activeView = 'cv-customize'; // HU15 customizer
    else if (currentPath === '/documents/cv' || currentPath === '/generar-documentos/cv') activeView = 'documents-cv';
    else if (currentPath === '/documents/cover-letter' || currentPath === '/generar-documentos/carta') activeView = 'documents-cover-letter';
    else if (currentPath === '/documents' || currentPath === '/generar-documentos') activeView = 'documents-cv';
    else if (currentPath === '/interviews/compare') activeView = 'compare';
    else if (currentPath === '/interviews' || currentPath === '/entrevistas') activeView = 'interviews';
    else if (currentPath === '/historial' || currentPath === '/history') activeView = 'history';
    else if (currentPath === '/metrics' || currentPath === '/mis-metricas') activeView = 'dashboard';
    else if (currentPath === '/resources') activeView = 'resources';
    else if (currentPath === '/settings') activeView = 'settings';
    else if (currentPath === '/drafts' || currentPath === '/borradores') activeView = 'drafts';
    else if (currentPath === '/dashboard' || currentPath === '/inicio') activeView = 'dashboard';
    else activeView = 'dashboard';
  }

  useEffect(() => {
    if (user) {
      if (currentPath === '/documents' || currentPath === '/generar-documentos') {
        navigateTo('/documents/cv');
      } else if (currentPath === '/metrics' || currentPath === '/mis-metricas') {
        navigateTo('/dashboard');
      } else if (currentPath === '/profile' || currentPath === '/mi-perfil') {
        navigateTo('/documents/cv');
      }
    }
  }, [currentPath, user]);

  useEffect(() => {
    // Escuchar cambios de historial en el navegador (atrás/adelante)
    const handlePopState = () => {
      setCurrentPath(window.location.pathname);
    };
    window.addEventListener('popstate', handlePopState);

    // 1. Verificar sesión activa inicial
    const checkInitialSession = async () => {
      setCheckingAuth(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setUser(session.user);
        // Si el usuario está logueado en la raíz, redirigir a dashboard
        if (window.location.pathname === '/' || window.location.pathname === '/login') {
          navigateTo('/dashboard');
        }
      } else {
        setUser(null);
        if (window.location.pathname !== '/' && window.location.pathname !== '/login') {
          navigateTo('/login');
        }
      }
      setCheckingAuth(false);
    };
    checkInitialSession();

    // 2. Suscribirse a cambios de estado de autenticación (Login/Logout)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        setUser(session.user);
        if (event === 'SIGNED_IN') {
          // Solo redirigir si el usuario está en las rutas públicas
          if (window.location.pathname === '/' || window.location.pathname === '/login') {
            navigateTo('/dashboard');
          }
        }
      } else {
        setUser(null);
        if (event === 'SIGNED_OUT') {
          navigateTo('/login');
        }
      }
    });

    return () => {
      subscription.unsubscribe();
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  // 2.b Cierre de sesión automático por inactividad.
  // Tras 30 min sin actividad se cierra la sesión; se avisa 60s antes.
  useEffect(() => {
    if (!user) return;

    const INACTIVITY_MS = 30 * 60 * 1000; // 30 minutos
    const WARNING_MS    = 60 * 1000;      // avisar 60s antes
    let warnTimer, logoutTimer;

    const doLogout = async () => {
      setShowTimeoutWarning(false);
      await supabase.auth.signOut(); // onAuthStateChange (SIGNED_OUT) redirige al login
    };

    const reset = () => {
      setShowTimeoutWarning(false);
      clearTimeout(warnTimer);
      clearTimeout(logoutTimer);
      warnTimer   = setTimeout(() => setShowTimeoutWarning(true), INACTIVITY_MS - WARNING_MS);
      logoutTimer = setTimeout(doLogout, INACTIVITY_MS);
    };

    const events = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click'];
    const onActivity = () => reset();
    events.forEach(e => window.addEventListener(e, onActivity, { passive: true }));
    reset();

    return () => {
      events.forEach(e => window.removeEventListener(e, onActivity));
      clearTimeout(warnTimer);
      clearTimeout(logoutTimer);
    };
  }, [user]);

  // 3. Cargar dinámicamente datos del usuario autenticado (user_id = session.user.id)
  useEffect(() => {
    if (!user) {
      setProfile(null);
      setStats({ totalCvs: 0, totalLetters: 0, totalInterviews: 0, avgScore: 0, streak: 0 });
      setHasActivity(false);
      return;
    }

    const loadUserData = async () => {
      setLoadingViewData(true);
      try {
        // Cargar Perfil del usuario
        const { data: pData } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single();

        const [{ count: cvCount }, { count: letterCount }] = await Promise.all([
          supabase
            .from('generated_cvs')
            .select('*', { count: 'exact', head: true })
            .eq('profile_id', user.id),
          supabase
            .from('cover_letters')
            .select('*', { count: 'exact', head: true })
            .eq('profile_id', user.id),
        ]);

        setProfile(pData || null);

        // Cargar Entrevistas del usuario para calcular métricas reales
        const { data: ints } = await supabase
          .from('interviews')
          .select(`
            id,
            interview_type,
            created_at,
            interview_messages(sender, evaluation)
          `)
          .eq('profile_id', user.id)
          .order('created_at', { ascending: false });

        let totalScore = 0;
        let scoreCount = 0;
        const formattedHistory = [];

        if (ints && ints.length > 0) {
          ints.forEach(intv => {
            let intvScore = 0;
            let intvCount = 0;
            if (intv.interview_messages) {
              intv.interview_messages.forEach(m => {
                if (m.sender === 'user' && m.evaluation && typeof m.evaluation.score === 'number') {
                  intvScore += m.evaluation.score;
                  intvCount++;
                  totalScore += m.evaluation.score;
                  scoreCount++;
                }
              });
            }
            const calculatedIntScore = intvCount > 0 ? Math.round(intvScore / intvCount) : null;
            formattedHistory.push({
              id: intv.id,
              type: intv.interview_type === 'technical' ? 'Técnica' : intv.interview_type === 'behavioral' ? 'Por competencias' : 'General',
              date: new Date(intv.created_at).toLocaleDateString('es-PE', { day: 'numeric', month: 'short', year: 'numeric' }),
              score: calculatedIntScore || 0
            });
          });
        }

        const avg = scoreCount > 0 ? Math.round(totalScore / scoreCount) : 0;
        setHistory(formattedHistory);

        // Calcular racha dinámica en App.jsx
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

        setStats({
          totalCvs: cvCount || 0,
          totalLetters: letterCount || 0,
          totalInterviews: ints?.length || 0,
          avgScore: avg,
          streak: calculatedStreak
        });

        // hasActivity es true si el usuario ha realizado al menos 1 simulación, u optimizado algún CV o Carta
        setHasActivity((ints?.length || 0) > 0 || (cvCount || 0) > 0 || (letterCount || 0) > 0);

      } catch (err) {
        console.error('[App.jsx] Error cargando datos de usuario:', err);
      } finally {
        setLoadingViewData(false);
      }
    };

    loadUserData();
  }, [user, currentPath]);

  const handleLoginSuccess = () => {
    setActiveView('dashboard');
  };

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center font-sans">
        <div className="bg-indigo-650 text-white p-2 rounded-xl animate-bounce mb-2">
          <Sparkles className="h-6 w-6" />
        </div>
        <p className="text-slate-500 text-xs font-semibold">Cargando EmpleaIA...</p>
      </div>
    );
  }

  // ==========================================
  // RENDERING RUTAS PÚBLICAS
  // ==========================================
  if (!user) {
    if (activeView === 'login') {
      return (
        <Login 
          onLoginSuccess={handleLoginSuccess} 
          onBackToHome={() => setActiveView('landing')} 
        />
      );
    }
    return <Landing onStart={() => setActiveView('login')} />;
  }

  // ==========================================
  // RENDERING ENTORNO PRIVADO CON SIDEBAR
  // ==========================================
  return (
    <AppLayout
      user={user}
      profile={profile}
      pathname={currentPath}
      onNavigate={setActiveView}
      theme={theme}
      onToggleTheme={toggleTheme}
    >
        {showTimeoutWarning && (
          <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 space-y-4 text-center">
              <div className="mx-auto h-12 w-12 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center">
                <Clock className="h-6 w-6 text-amber-600" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Tu sesión está por expirar</h3>
                <p className="text-sm text-slate-500 mt-1">Por inactividad, cerraremos tu sesión en menos de un minuto. ¿Quieres seguir conectado?</p>
              </div>
              <div className="flex gap-2 justify-center">
                <button
                  onClick={() => setShowTimeoutWarning(false)}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold px-5 py-2 rounded-xl cursor-pointer"
                >
                  Seguir conectado
                </button>
                <button
                  onClick={async () => { setShowTimeoutWarning(false); await supabase.auth.signOut(); }}
                  className="bg-white border border-slate-200 hover:border-slate-300 text-slate-600 text-sm font-bold px-5 py-2 rounded-xl cursor-pointer"
                >
                  Cerrar sesión
                </button>
              </div>
            </div>
          </div>
        )}

        {activeView === 'dashboard' && <Dashboard setActiveView={setActiveView} />}
        
        {activeView === 'profile' && <Profile navigateTo={navigateTo} />}

        {activeView === 'profile-view' && <ProfileView navigateTo={navigateTo} />}

        {activeView === 'cv-customize' && <CvCustomize navigateTo={navigateTo} />}
        
        {activeView === 'documents' && <Documents initialDocType="select" navigateTo={navigateTo} />}
        
        {activeView === 'documents-cv' && <Documents initialDocType="cv" navigateTo={navigateTo} />}
        
        {activeView === 'documents-cover-letter' && <Documents initialDocType="letter" navigateTo={navigateTo} />}
        
        {activeView === 'drafts' && <Drafts navigateTo={navigateTo} />}
        
        {activeView === 'interviews' && <Interviews setActiveView={setActiveView} />}

        {activeView === 'compare' && <CompareInterviews navigateTo={navigateTo} setActiveView={setActiveView} />}

        {activeView === 'history' && <ActivityHistory setActiveView={setActiveView} navigateTo={navigateTo} />}

        {/* METRICS VIEW */}
        {activeView === 'metrics' && (() => {
          const chronoData = [...history].reverse();
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

          const avgScore = stats.avgScore || 0;
          const catCommunication = avgScore > 0 ? Math.min(Math.round(avgScore * 1.03), 98) : 0;
          const catKnowledge = avgScore > 0 ? Math.min(Math.round(avgScore * 0.95), 95) : 0;
          const catConfidence = avgScore > 0 ? Math.min(Math.round(avgScore * 0.97), 96) : 0;
          const catProblemSolving = avgScore > 0 ? Math.min(Math.round(avgScore * 1.07), 99) : 0;

          return (
            <div className="flex-1 min-h-full overflow-y-auto bg-slate-50 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
              <div className="mx-auto w-full max-w-[1600px] space-y-6">

              {stats.totalInterviews === 0 ? (
                <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center max-w-lg mx-auto space-y-4 shadow-sm mt-12 animate-fade-in">
                  <TrendingUp className="h-12 w-12 text-slate-350 mx-auto animate-pulse" />
                  <h3 className="text-lg font-bold text-slate-900">Aún no tienes métricas disponibles.</h3>
                  <p className="text-slate-500 text-xs leading-relaxed">
                    Completa tu perfil y realiza simulaciones de entrevistas para ver tu progreso.
                  </p>
                  <button
                    onClick={() => setActiveView('interviews')}
                    className="inline-flex bg-indigo-650 hover:bg-indigo-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition-all duration-200 shadow-sm cursor-pointer mx-auto"
                  >
                    Ir a Entrevistas
                  </button>
                </div>
              ) : (
                <div className="w-full max-w-[1600px] space-y-6 animate-fade-in">
                  
                  {/* KPI Grid */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm space-y-2 relative overflow-hidden text-left">
                      <div className="flex justify-between items-center text-slate-400">
                        <span className="text-[10px] font-bold uppercase tracking-wider">CV Generados</span>
                        <FileText className="h-4.5 w-4.5 text-blue-500" />
                      </div>
                      <div className="flex items-baseline gap-2">
                        <span className="text-3xl font-black text-slate-950">{stats.totalCvs}</span>
                      </div>
                      <p className="text-[9px] text-slate-400">Formatos ATS-friendly</p>
                    </div>

                    <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm space-y-2 relative overflow-hidden text-left">
                      <div className="flex justify-between items-center text-slate-400">
                        <span className="text-[10px] font-bold uppercase tracking-wider">Cartas Creadas</span>
                        <Mail className="h-4.5 w-4.5 text-violet-500" />
                      </div>
                      <div className="flex items-baseline gap-2">
                        <span className="text-3xl font-black text-slate-950">{stats.totalLetters}</span>
                      </div>
                      <p className="text-[9px] text-slate-400">Cartas de presentación con IA</p>
                    </div>

                    <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm space-y-2 text-left">
                      <div className="flex justify-between items-center text-slate-400">
                        <span className="text-[10px] font-bold uppercase tracking-wider">Entrevistas</span>
                        <MessageSquare className="h-4.5 w-4.5 text-indigo-500" />
                      </div>
                      <div className="flex items-baseline gap-2">
                        <span className="text-3xl font-black text-slate-950">{stats.totalInterviews}</span>
                      </div>
                      <p className="text-[9px] text-slate-400">Simulaciones de chat con IA</p>
                    </div>

                    <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm space-y-2 text-left">
                      <div className="flex justify-between items-center text-slate-400">
                        <span className="text-[10px] font-bold uppercase tracking-wider">Días de Racha</span>
                        <TrendingUp className="h-4.5 w-4.5 text-emerald-500" />
                      </div>
                      <div className="flex items-baseline gap-2">
                        <span className="text-3xl font-black text-slate-950">{stats.streak}</span>
                      </div>
                      <p className="text-[9px] text-slate-400">Días activos seguidos</p>
                    </div>
                  </div>

                  {/* Two-Column Details */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    
                    {/* SVG Curve Chart */}
                    <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm flex flex-col justify-between text-left">
                      <div>
                        <h3 className="text-xs font-bold text-slate-900 uppercase tracking-widest border-b border-slate-100 pb-2 mb-3">Progreso Histórico</h3>
                        <p className="text-xs text-slate-500 leading-relaxed mb-4">
                          Evolución del puntaje de empleabilidad estimado a través de tus últimas simulaciones de entrevista.
                        </p>
                      </div>

                      <div className="space-y-3">
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-3xl font-black text-slate-900">{stats.avgScore}%</span>
                          <span className="text-slate-400 text-[10px] font-bold">Puntaje promedio global</span>
                        </div>
                        
                        <div className="h-32 w-full relative">
                          <svg className="w-full h-full" viewBox="0 0 100 50">
                            <defs>
                              <linearGradient id="metrics-chart-grad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#4f46e5" stopOpacity="0.15" />
                                <stop offset="100%" stopColor="#4f46e5" stopOpacity="0.0" />
                              </linearGradient>
                            </defs>
                            <line x1="0" y1="10" x2="100" y2="10" stroke="#f1f5f9" strokeWidth="0.5" />
                            <line x1="0" y1="25" x2="100" y2="25" stroke="#f1f5f9" strokeWidth="0.5" />
                            <line x1="0" y1="40" x2="100" y2="40" stroke="#f1f5f9" strokeWidth="0.5" />
                            <path
                              d={chartPath}
                              fill="none"
                              stroke="#4f46e5"
                              strokeWidth="2.5"
                              strokeLinecap="round"
                            />
                            <path
                              d={areaPath}
                              fill="url(#metrics-chart-grad)"
                            />
                            {chartPoints.map((p, i) => (
                              <circle key={i} cx={p.cx} cy={p.cy} r={i === chartPoints.length - 1 ? 2 : 1.5} fill="#4f46e5" stroke={i === chartPoints.length - 1 ? "#fff" : "none"} strokeWidth={i === chartPoints.length - 1 ? 0.75 : 0} />
                            ))}
                          </svg>
                          <div className="flex justify-between text-[8px] text-slate-400 font-bold uppercase mt-1 px-1">
                            {chronoData.slice(-4).map((d) => (
                              <span key={d.id}>{d.date.split(' ')[0] + ' ' + d.date.split(' ')[1]}</span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* SVG Breakdown Progress Bars */}
                    <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm text-left">
                      <h3 className="text-xs font-bold text-slate-900 uppercase tracking-widest border-b border-slate-100 pb-2 mb-4">Habilidades por Categoría</h3>
                      
                      <div className="space-y-4">
                        <div className="space-y-1.5">
                          <div className="flex justify-between font-bold text-xs text-slate-700">
                            <span>Comunicación</span>
                            <span className="text-indigo-650">{catCommunication}%</span>
                          </div>
                          <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full bg-indigo-600 rounded-full transition-all duration-500" style={{ width: `${catCommunication}%` }}></div>
                          </div>
                          <p className="text-[9px] text-slate-400">Fluidez, control de muletillas y articulación de ideas.</p>
                        </div>

                        <div className="space-y-1.5">
                          <div className="flex justify-between font-bold text-xs text-slate-700">
                            <span>Conocimientos Técnicos</span>
                            <span className="text-indigo-650">{catKnowledge}%</span>
                          </div>
                          <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full bg-indigo-600 rounded-full transition-all duration-500" style={{ width: `${catKnowledge}%` }}></div>
                          </div>
                          <p className="text-[9px] text-slate-400">Dominio de stacks, lenguajes y patrones de diseño.</p>
                        </div>

                        <div className="space-y-1.5">
                          <div className="flex justify-between font-bold text-xs text-slate-700">
                            <span>Confianza y Actitud</span>
                            <span className="text-indigo-650">{catConfidence}%</span>
                          </div>
                          <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full bg-indigo-600 rounded-full transition-all duration-500" style={{ width: `${catConfidence}%` }}></div>
                          </div>
                          <p className="text-[9px] text-slate-400">Seguridad gestual, contacto visual y tono vocal.</p>
                        </div>

                        <div className="space-y-1.5">
                          <div className="flex justify-between font-bold text-xs text-slate-700">
                            <span>Resolución de Problemas</span>
                            <span className="text-indigo-650">{catProblemSolving}%</span>
                          </div>
                          <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full bg-indigo-600 rounded-full transition-all duration-500" style={{ width: `${catProblemSolving}%` }}></div>
                          </div>
                          <p className="text-[9px] text-slate-400">Estructuración STAR, lógica y adaptabilidad.</p>
                        </div>
                      </div>
                    </div>

                  </div>

                </div>
              )}
            </div>
            </div>
          );
        })()}

        {/* RESOURCES VIEW */}
        {activeView === 'resources' && (
          <div className="flex-1 min-h-full overflow-y-auto bg-slate-50 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            <div className="mx-auto w-full max-w-[1600px] space-y-6">
            <div className="pb-4 border-b border-slate-200">
              <h2 className="text-2xl font-black text-slate-900 leading-tight flex items-center gap-2">
                <BookOpen className="h-6 w-6 text-indigo-600" />
                Recursos didácticos
              </h2>
              <p className="text-slate-400 text-xs mt-1">Guías y material de estudio sugerido por la Inteligencia Artificial.</p>
            </div>

            {(!profile || !profile.career || !profile.target_role || !profile.technical_skills || profile.technical_skills.length === 0) ? (
              <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center max-w-lg mx-auto space-y-4 shadow-sm mt-12">
                <BookOpen className="h-12 w-12 text-slate-350 mx-auto animate-pulse" />
                <h3 className="text-lg font-bold text-slate-900">Completa tu perfil para recibir recursos personalizados.</h3>
                <p className="text-slate-500 text-xs leading-relaxed">
                  Registra tu carrera, puesto objetivo y habilidades en "Mi Perfil" para que la IA sugiera materiales de estudio.
                </p>
              </div>
            ) : (
              <div className="grid max-w-[1600px] grid-cols-1 gap-4 md:grid-cols-2">
                <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-2 text-left">
                  <span className="text-[9px] text-indigo-600 font-extrabold uppercase tracking-widest">{profile.career}</span>
                  <h4 className="text-sm font-bold text-slate-900 font-sans">Fundamentos de {profile.technical_skills[0]} y mejores prácticas</h4>
                  <p className="text-xs text-slate-500 leading-normal font-sans">
                    Aprende conceptos fundamentales, optimización y estándares de la industria aplicados a {profile.technical_skills[0]}.
                  </p>
                </div>
                <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-2 text-left">
                  <span className="text-[9px] text-indigo-600 font-extrabold uppercase tracking-widest">{profile.target_role}</span>
                  <h4 className="text-sm font-bold text-slate-900 font-sans">Preparación y Arquitectura para {profile.target_role}</h4>
                  <p className="text-xs text-slate-500 leading-normal font-sans">
                    Guía de diseño, patrones avanzados y preguntas clave de selección recomendadas para el puesto de {profile.target_role}.
                  </p>
                </div>
              </div>
            )}
          </div>
          </div>
        )}

        {/* SETTINGS VIEW */}
        {activeView === 'settings' && <SettingsView user={user} profile={profile} />}

    </AppLayout>
  );
}

export default App;
