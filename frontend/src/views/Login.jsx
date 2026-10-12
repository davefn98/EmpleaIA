import { useState } from 'react';
import { supabase } from '../utils/supabaseClient';
import { Lock, Mail, User, AlertCircle, CheckCircle2, ArrowRight, BookOpen, Briefcase, ChevronLeft } from 'lucide-react';
import { mapError } from '../utils/errorMapper';
import logoImg from '../assets/logo.png';

export default function Login({ onLoginSuccess, onBackToHome }) {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [career, setCareer] = useState('');
  const [targetRole, setTargetRole] = useState('');
  // Aviso dejado por api.js / App.jsx cuando la sesión expiró y se forzó el logout.
  const [error, setError] = useState(() => {
    if (sessionStorage.getItem('empleaia_session_expired')) {
      sessionStorage.removeItem('empleaia_session_expired');
      return 'Tu sesión expiró por inactividad. Inicia sesión nuevamente.';
    }
    return '';
  });
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const handleAuth = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      if (isLogin) {
        // Flujo de Login
        const { error: authError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (authError) throw authError;
        onLoginSuccess();
      } else {
        // Flujo de Registro
        if (!firstName || !lastName || !career || !targetRole) {
          throw new Error('Por favor completa todos los campos para crear tu cuenta y perfil curricular.');
        }

        const { data: authData, error: authError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              first_name: firstName,
              last_name: lastName,
              career: career,
              target_role: targetRole,
            },
          },
        });
        if (authError) throw authError;

        if (authData?.user && !authData?.session) {
          setSuccess('¡Cuenta creada! Revisa tu correo para confirmarla antes de iniciar sesión.');
        } else {
          setSuccess('¡Registro exitoso! Ya puedes iniciar sesión con tus credenciales.');
        }
        setIsLogin(true);
        setPassword('');
      }
    } catch (err) {
      setError(mapError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 relative overflow-hidden font-sans select-none text-slate-800">
      {/* Luces de Fondo (Subtles) */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-indigo-500/5 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-blue-500/5 blur-[120px] pointer-events-none" />

      {/* Botón Volver a la Landing */}
      <button
        onClick={onBackToHome}
        className="absolute top-6 left-6 flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900 font-bold transition-all duration-200 cursor-pointer"
      >
        <ChevronLeft className="h-4 w-4" />
        Volver al inicio
      </button>

      {/* Marca / Logotipo */}
      <div className="text-center mb-6">
        <div className="bg-indigo-650/5 p-1 rounded-2xl shadow-sm inline-flex items-center justify-center mb-3 h-12 w-12 overflow-hidden border border-slate-200/50">
          <img src={logoImg} alt="EmpleaIA Logo" className="h-full w-full object-cover rounded-xl" />
        </div>
        <h2 className="text-2xl font-black text-slate-900 tracking-tight">EmpleaIA</h2>
        <p className="text-slate-500 text-xs mt-1 font-medium">
          Plataforma de empleabilidad acelerada con Inteligencia Artificial
        </p>
      </div>

      {/* Tarjeta del Formulario */}
      <div className="w-full max-w-md bg-white border border-slate-200/80 rounded-2xl shadow-xl p-6 md:p-8 relative z-10">

        {/* Pestañas */}
        <div className="flex bg-slate-100 p-1 rounded-xl mb-6 border border-slate-200/40">
          <button
            type="button"
            onClick={() => { setIsLogin(true); setError(''); }}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all duration-300 cursor-pointer ${isLogin
              ? 'bg-white text-indigo-650 shadow-sm border border-slate-200/50'
              : 'text-slate-500 hover:text-slate-900'
              }`}
          >
            Iniciar Sesión
          </button>
          <button
            type="button"
            onClick={() => { setIsLogin(false); setError(''); }}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all duration-300 cursor-pointer ${!isLogin
              ? 'bg-white text-indigo-650 shadow-sm border border-slate-200/50'
              : 'text-slate-500 hover:text-slate-900'
              }`}
          >
            Crear Cuenta
          </button>
        </div>

        {/* Notificaciones de Error */}
        {error && (
          <div className="bg-rose-50 border border-rose-100 text-rose-650 text-xs rounded-xl p-3 flex items-start gap-2 mb-4 font-medium">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Notificaciones de Éxito */}
        {success && (
          <div className="bg-emerald-50 border border-emerald-100 text-emerald-650 text-xs rounded-xl p-3 flex items-start gap-2 mb-4 font-medium">
            <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-emerald-600" />
            <span>{success}</span>
          </div>
        )}

        {/* Formulario */}
        <form onSubmit={handleAuth} className="space-y-4">
          {!isLogin && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-500 text-[10px] font-bold uppercase tracking-wider mb-1">Nombre</label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <User className="h-4 w-4 text-slate-400" />
                  </span>
                  <input
                    type="text"
                    required
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="Juan"
                    className="w-full bg-white border border-slate-200 text-slate-900 rounded-xl pl-9 pr-3 py-2.5 text-xs focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-medium"
                  />
                </div>
              </div>
              <div>
                <label className="block text-slate-500 text-[10px] font-bold uppercase tracking-wider mb-1">Apellido</label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <User className="h-4 w-4 text-slate-400" />
                  </span>
                  <input
                    type="text"
                    required
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Pérez"
                    className="w-full bg-white border border-slate-200 text-slate-900 rounded-xl pl-9 pr-3 py-2.5 text-xs focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-medium"
                  />
                </div>
              </div>
            </div>
          )}

          {!isLogin && (
            <>
              <div>
                <label className="block text-slate-500 text-[10px] font-bold uppercase tracking-wider mb-1">Carrera Técnica</label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <BookOpen className="h-4 w-4 text-slate-400" />
                  </span>
                  <input
                    type="text"
                    required
                    value={career}
                    onChange={(e) => setCareer(e.target.value)}
                    placeholder="ej: Computación e Informática"
                    className="w-full bg-white border border-slate-200 text-slate-900 rounded-xl pl-9 pr-3 py-2.5 text-xs focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-medium"
                  />
                </div>
              </div>
              <div>
                <label className="block text-slate-500 text-[10px] font-bold uppercase tracking-wider mb-1">Puesto Objetivo (Rol)</label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Briefcase className="h-4 w-4 text-slate-400" />
                  </span>
                  <input
                    type="text"
                    required
                    value={targetRole}
                    onChange={(e) => setTargetRole(e.target.value)}
                    placeholder="ej: Junior Frontend Developer"
                    className="w-full bg-white border border-slate-200 text-slate-900 rounded-xl pl-9 pr-3 py-2.5 text-xs focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-medium"
                  />
                </div>
              </div>
            </>
          )}

          <div>
            <label className="block text-slate-500 text-[10px] font-bold uppercase tracking-wider mb-1">Correo Electrónico</label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Mail className="h-4 w-4 text-slate-400" />
              </span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nombre@estudiante.edu.pe"
                className="w-full bg-white border border-slate-200 text-slate-900 rounded-xl pl-9 pr-3 py-2.5 text-xs focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-medium"
              />
            </div>
          </div>

          <div>
            <label className="block text-slate-500 text-[10px] font-bold uppercase tracking-wider mb-1">Contraseña</label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Lock className="h-4 w-4 text-slate-400" />
              </span>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-white border border-slate-200 text-slate-900 rounded-xl pl-9 pr-3 py-2.5 text-xs focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-medium"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-6 bg-indigo-650 hover:bg-indigo-700 text-white font-bold py-3.5 rounded-xl text-xs transition-all duration-300 flex items-center justify-center gap-2 shadow-lg shadow-indigo-650/20 disabled:opacity-50 disabled:cursor-not-allowed group cursor-pointer"
          >
            {loading ? 'Procesando...' : isLogin ? 'Ingresar a EmpleaIA' : 'Crear Cuenta Profesional'}
            {!loading && <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />}
          </button>
        </form>
      </div>

      {/* Footer académico */}
      <footer className="mt-8 text-center text-slate-450 text-[10px] max-w-xs font-semibold">
        Proyecto de Tesis - PI-1. Prototipo Funcional de Investigación Inicial (Sprint 1).
      </footer>
    </main>
  );
}
