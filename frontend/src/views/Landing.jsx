import React from 'react';
import { ArrowRight, BookOpen, FileText, MessageSquare, Mail } from 'lucide-react';
import logoImg from '../assets/logo.png';

export default function Landing({ onStart }) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans relative overflow-hidden select-none">
      
      {/* Estilos CSS Inline para Animaciones Personalizadas y Efecto de Flotación */}
      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px) scale(1); }
          50% { transform: translateY(-15px) scale(1.03); }
        }
        @keyframes float-slow {
          0%, 100% { transform: translateY(0px) scale(1); }
          50% { transform: translateY(-25px) scale(0.97); }
        }
        @keyframes pulse-glow {
          0%, 100% { opacity: 0.25; transform: scale(1); }
          50% { opacity: 0.45; transform: scale(1.1); }
        }
        .animate-float {
          animation: float 6s ease-in-out infinite;
        }
        .animate-float-delayed {
          animation: float 8s ease-in-out infinite;
          animation-delay: 2s;
        }
        .animate-float-slow {
          animation: float-slow 10s ease-in-out infinite;
        }
        .animate-pulse-glow {
          animation: pulse-glow 4s ease-in-out infinite;
        }
      `}</style>

      {/* Luces y Gradientes de Fondo (Estilo Mockup) */}
      <div className="absolute top-[-10%] left-[-10%] w-[600px] h-[600px] rounded-full bg-indigo-500/10 blur-[150px] pointer-events-none" />
      <div className="absolute top-[25%] right-[-10%] w-[500px] h-[500px] rounded-full bg-blue-500/15 blur-[130px] pointer-events-none animate-pulse-glow" />
      <div className="absolute bottom-[-10%] left-[-5%] w-[600px] h-[600px] rounded-full bg-purple-500/10 blur-[150px] pointer-events-none" />

      {/* Esferas Flotantes 3D en las Esquinas (Estilo Mockup) */}
      <div className="absolute top-[25%] left-[8%] w-12 h-12 rounded-full bg-gradient-to-tr from-sky-400 to-indigo-600 opacity-60 shadow-lg animate-float pointer-events-none hidden md:block" />
      <div className="absolute top-[35%] right-[6%] w-16 h-16 rounded-full bg-gradient-to-tr from-violet-500 to-fuchsia-600 opacity-55 shadow-lg animate-float-delayed pointer-events-none hidden md:block" />
      <div className="absolute bottom-[20%] left-[5%] w-14 h-14 rounded-full bg-gradient-to-tr from-indigo-500 to-sky-500 opacity-50 shadow-lg animate-float-slow pointer-events-none hidden md:block" />
      <div className="absolute bottom-[35%] right-[15%] w-10 h-10 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-500 opacity-60 shadow-lg animate-float pointer-events-none hidden md:block" />

      {/* Capa de Dashboards Faded de Fondo (Recreación del Mockup) */}
      {/* Panel Izquierdo */}
      <div className="absolute left-[3%] top-[190px] w-72 h-80 bg-slate-950/40 border border-slate-900/60 backdrop-blur-[4px] rounded-3xl p-5 shadow-2xl pointer-events-none hidden xl:flex flex-col gap-4 opacity-[0.18] transition-opacity duration-300 hover:opacity-25">
        <div className="flex items-center gap-2 border-b border-slate-900/80 pb-3">
          <div className="w-3 h-3 rounded-full bg-slate-850" />
          <div className="w-3 h-3 rounded-full bg-slate-850" />
          <div className="w-20 h-3 rounded bg-slate-900" />
        </div>
        <div className="w-full h-8 bg-slate-900/50 rounded-xl" />
        <div className="grid grid-cols-2 gap-3">
          <div className="h-16 bg-slate-900/50 rounded-xl p-2 flex flex-col gap-2">
            <div className="w-10 h-2 bg-slate-850 rounded" />
            <div className="w-16 h-4 bg-slate-800 rounded" />
          </div>
          <div className="h-16 bg-slate-900/50 rounded-xl p-2 flex flex-col gap-2">
            <div className="w-8 h-2 bg-slate-850 rounded" />
            <div className="w-12 h-4 bg-slate-800 rounded" />
          </div>
        </div>
        <div className="flex-1 bg-slate-900/50 rounded-xl p-3 flex flex-col justify-end gap-2">
          <div className="w-full h-2 bg-slate-850 rounded" />
          <div className="w-2/3 h-2 bg-slate-850 rounded" />
        </div>
      </div>

      {/* Panel Derecho */}
      <div className="absolute right-[3%] top-[190px] w-72 h-80 bg-slate-950/40 border border-slate-900/60 backdrop-blur-[4px] rounded-3xl p-5 shadow-2xl pointer-events-none hidden xl:flex flex-col gap-4 opacity-[0.18] transition-opacity duration-300 hover:opacity-25">
        <div className="flex items-center gap-2 border-b border-slate-900/80 pb-3">
          <div className="w-3 h-3 rounded-full bg-slate-850" />
          <div className="w-3 h-3 rounded-full bg-slate-850" />
          <div className="w-20 h-3 rounded bg-slate-900" />
        </div>
        <div className="flex-1 bg-slate-900/50 rounded-xl p-3 flex flex-col gap-3">
          <div className="flex justify-between items-center">
            <div className="w-16 h-3 bg-slate-800 rounded" />
            <div className="w-10 h-3 bg-indigo-900/40 rounded" />
          </div>
          <div className="flex justify-between items-center">
            <div className="w-20 h-3 bg-slate-800 rounded" />
            <div className="w-8 h-3 bg-indigo-900/40 rounded" />
          </div>
          <div className="flex justify-between items-center">
            <div className="w-14 h-3 bg-slate-800 rounded" />
            <div className="w-12 h-3 bg-indigo-900/40 rounded" />
          </div>
          <div className="flex justify-between items-center">
            <div className="w-24 h-3 bg-slate-800 rounded" />
            <div className="w-6 h-3 bg-indigo-900/40 rounded" />
          </div>
        </div>
      </div>

      {/* Barra Superior de Navegación (Transparente - Estilo Mockup) */}
      <nav className="max-w-7xl mx-auto w-full px-6 h-20 flex items-center justify-between z-20 relative" role="navigation">
        {/* Marca a la izquierda */}
        <div className="flex items-center gap-3">
          <img src={logoImg} alt="EmpleaIA Logo" className="h-9 w-9 object-cover rounded-xl" />
          <span className="text-lg font-black tracking-tight text-white select-none">
            EmpleaIA
          </span>
        </div>
        
        {/* Acciones a la derecha */}
        <div className="flex items-center gap-3">
          {/* Botón de Registro (Estilo Mockup) */}
          <button
            onClick={onStart}
            className="bg-sky-500 hover:bg-sky-400 text-white text-xs font-bold px-6 py-2.5 rounded-full shadow-lg shadow-sky-500/25 hover:shadow-sky-500/40 hover:scale-105 active:scale-95 transition-all duration-200 cursor-pointer"
          >
            Registro
          </button>
        </div>
      </nav>

      {/* HERO SECTION */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-6 py-12 md:py-20 z-10 relative flex flex-col items-center text-center justify-center">
        
        {/* Logotipo Centrado de la Maleta de IA (Estilo Mockup Gigante) */}
        <div className="mb-10 flex justify-center relative">
          {/* Aura de brillo de neón violeta e índigo */}
          <div className="absolute inset-[-15px] bg-gradient-to-tr from-sky-500 via-indigo-500 to-purple-600 blur-2xl rounded-full opacity-40 animate-pulse-glow pointer-events-none" />
          
          <div className="relative z-10 h-64 w-64 md:h-72 md:w-72 overflow-hidden rounded-[2.5rem] shadow-2xl transition-transform duration-350 hover:scale-[1.03] select-none bg-slate-950">
            <img src={logoImg} alt="EmpleaIA Briefcase Logo" className="h-full w-full object-cover" />
          </div>
        </div>

        {/* Título Principal (Estilo Mockup) */}
        <h1 className="text-4xl sm:text-5xl md:text-6.5xl font-extrabold tracking-tight max-w-4xl text-white leading-[1.12] text-center select-none">
          Lleva tu empleabilidad técnica al siguiente nivel con Inteligencia Artificial
        </h1>

        {/* Subtítulo (Estilo Mockup) */}
        <p className="text-slate-400 mt-6 text-sm sm:text-base md:text-[17px] max-w-3xl leading-relaxed text-center font-medium">
          Impulsa tu carrera tecnológica con nuestra plataforma inteligente: optimiza tu perfil, potencia tus habilidades y conecta con las mejores oportunidades del mercado.
        </p>

        {/* Botón CTA Principal (Estilo Mockup) */}
        <div className="mt-10 flex flex-col sm:flex-row gap-4 items-center">
          <button
            onClick={onStart}
            className="w-full sm:w-auto bg-sky-500 hover:bg-sky-400 text-white font-bold px-10 py-4 rounded-full transition-all duration-300 flex items-center justify-center gap-2 shadow-xl shadow-sky-500/35 hover:shadow-sky-500/50 hover:scale-[1.03] active:scale-95 group cursor-pointer"
          >
            Comenzar Ahora
            <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
          </button>
        </div>

        {/* SECCIÓN DE CARACTERÍSTICAS / CARDS */}
        <div className="mt-28 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 w-full text-left">
          
          {/* Card 1: Perfil */}
          <div className="bg-slate-900/40 backdrop-blur-md border border-slate-800/60 rounded-3xl p-6 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 space-y-3">
            <div className="bg-indigo-950/40 h-10 w-10 rounded-xl flex items-center justify-center border border-indigo-900/40">
              <BookOpen className="h-5 w-5 text-indigo-400" />
            </div>
            <h3 className="text-xs font-bold text-slate-100 uppercase tracking-wider">1. Mi Perfil Profesional</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Consolida tus proyectos autónomos, estudios académicos y habilidades técnicas de forma organizada.
            </p>
          </div>

          {/* Card 2: CV */}
          <div className="bg-slate-900/40 backdrop-blur-md border border-slate-800/60 rounded-3xl p-6 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 space-y-3">
            <div className="bg-indigo-950/40 h-10 w-10 rounded-xl flex items-center justify-center border border-indigo-900/40">
              <FileText className="h-5 w-5 text-indigo-400" />
            </div>
            <h3 className="text-xs font-bold text-slate-100 uppercase tracking-wider">2. Optimización de CV</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Genera currículums redactados con verbos de acción según el estándar ATS listos para descargar en PDF.
            </p>
          </div>

          {/* Card 3: Carta */}
          <div className="bg-slate-900/40 backdrop-blur-md border border-slate-800/60 rounded-3xl p-6 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 space-y-3">
            <div className="bg-indigo-950/40 h-10 w-10 rounded-xl flex items-center justify-center border border-indigo-900/40">
              <Mail className="h-5 w-5 text-indigo-400" />
            </div>
            <h3 className="text-xs font-bold text-slate-100 uppercase tracking-wider">3. Carta de Presentación</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Adapta automáticamente tus fortalezas a los requisitos de la vacante, mejorando tu tasa de respuesta.
            </p>
          </div>

          {/* Card 4: Simulador */}
          <div className="bg-slate-900/40 backdrop-blur-md border border-slate-800/60 rounded-3xl p-6 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 space-y-3">
            <div className="bg-indigo-950/40 h-10 w-10 rounded-xl flex items-center justify-center border border-indigo-900/40">
              <MessageSquare className="h-5 w-5 text-indigo-400" />
            </div>
            <h3 className="text-xs font-bold text-slate-100 uppercase tracking-wider">4. Simulador Entrevista</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Entrena tus respuestas por chat escrito (General, Técnica o Behavioral) y recibe feedback analítico inmediato.
            </p>
          </div>

        </div>

      </main>

      {/* PIE DE PÁGINA */}
      <footer className="bg-slate-950 border-t border-slate-900/80 py-8 z-10 relative">
        <div className="max-w-7xl mx-auto px-6 text-center space-y-2">
          <p className="text-xs text-slate-400 font-semibold">
            © 2026 EmpleaIA. Todos los derechos reservados.
          </p>
          <p className="text-[10px] text-slate-500 max-w-md mx-auto leading-relaxed">
            Este software es de código abierto con fines de investigación académica en ingeniería y empleabilidad para el curso de Proyecto de Investigación 1.
          </p>
        </div>
      </footer>
    </div>
  );
}
