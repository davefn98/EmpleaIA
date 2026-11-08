import { ChartNoAxesColumnIncreasing, FileText, MessagesSquare } from 'lucide-react';
import Brand from './Brand';
import ThemeToggle from './ThemeToggle';
import './publicAccess.css';

export default function PublicAccessLayout({ theme, onToggleTheme, children }) {
  return (
    <main className="public-access">
      <div className="public-access__shell">
        <header className="public-access__header">
          <Brand />
          <ThemeToggle theme={theme} onToggleTheme={onToggleTheme} />
        </header>

        <section className="public-access__auth" aria-labelledby="access-form-title">
          {children}
        </section>

        <section className="public-access__intro" aria-labelledby="access-title">
          <p className="public-access__eyebrow">Preparación laboral con IA</p>
          <h1 id="access-title">Prepárate para tu próxima entrevista.</h1>
          <p className="public-access__lead">Crea tus documentos de postulación y practica antes de conversar con un reclutador.</p>
          <ul className="public-access__features">
            <li><span><FileText aria-hidden="true" /></span>Adapta tu CV y tu carta a una vacante</li>
            <li><span><MessagesSquare aria-hidden="true" /></span>Simula una entrevista por voz o por escrito</li>
            <li><span><ChartNoAxesColumnIncreasing aria-hidden="true" /></span>Revisa tu desempeño y tus recomendaciones</li>
          </ul>
          <p className="public-access__project">EmpleaIA · Proyecto académico PI2</p>
        </section>
      </div>
    </main>
  );
}
