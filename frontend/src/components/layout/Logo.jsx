import Brand from './Brand';

export default function Logo({ collapsed, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="EmpleaIA, ir al inicio"
      className={`flex items-center text-left transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 rounded-2xl p-1.5 hover:bg-slate-50 cursor-pointer ${
        collapsed ? 'justify-center w-full' : 'gap-3 w-auto'
      }`}
    >
      <Brand iconOnly={collapsed} />
    </button>
  );
}
