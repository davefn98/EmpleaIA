import logoImg from '../../assets/logo.png';

export default function Logo({ collapsed, onClick }) {
  return (
    <button
      onClick={onClick}
      aria-label="Ir al inicio"
      className={`flex items-center text-left transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 rounded-2xl p-1.5 hover:bg-slate-50 cursor-pointer ${
        collapsed ? 'justify-center w-full' : 'gap-3 w-auto'
      }`}
    >
      {/* Icono con la imagen del logo */}
      <div className={`flex items-center justify-center bg-indigo-600/5 dark:bg-indigo-400/5 shadow-sm transition-transform duration-300 hover:scale-105 overflow-hidden ${
        collapsed ? 'h-9 w-9 rounded-xl' : 'h-10 w-10 rounded-2xl'
      }`}>
        <img src={logoImg} alt="EmpleaIA Logo" className="h-full w-full object-cover" />
      </div>
    </button>
  );
}
