import { useEffect, useRef } from 'react';
import { ArrowLeft, Shield, X } from 'lucide-react';

const headingStyle = 'text-lg font-bold text-slate-900 dark:text-slate-100';
const linkStyle = 'font-semibold text-indigo-700 underline underline-offset-4 dark:text-indigo-300';

function PolicyHeading({ heading: Heading, onClose }) {
  return (
    <div className="shrink-0 border-b border-indigo-100 bg-indigo-50/70 px-5 py-5 dark:border-slate-700 dark:bg-indigo-950/25 sm:px-8">
      <div className="flex items-start gap-3 sm:gap-4">
        <span className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-200 sm:flex">
          <Shield className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-indigo-700 dark:text-indigo-300">EmpleaIA · Piloto académico PI2</p>
          <Heading id="aviso-de-datos-titulo" className="mt-1 text-xl font-bold leading-tight text-slate-900 dark:text-white sm:text-2xl">
            Política de privacidad
          </Heading>
        </div>
        {onClose && (
          <button
            type="button"
            aria-label="Cerrar política de privacidad"
            onClick={onClose}
            className="inline-flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-indigo-100 focus-visible:outline-2 focus-visible:outline-indigo-500 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-indigo-500/20"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
}

function PolicyContent({ heading: Heading }) {
  const contactEmail = import.meta.env.VITE_PRIVACY_CONTACT_EMAIL?.trim();

  return (
    <div className="space-y-6 px-5 py-6 text-sm leading-relaxed sm:px-8 sm:text-base">
      <p>El equipo del proyecto EmpleaIA usa los datos para ofrecer funciones de preparación laboral y evaluar el piloto académico cuando te inscribes en él.</p>
      <section className="space-y-2">
        <Heading className={headingStyle}>Qué datos guardamos y para qué</Heading>
        <p>Usamos Supabase para gestionar tu acceso y guardar tus datos de contacto y perfil profesional, los documentos que guardas y las entrevistas con sus preguntas, respuestas, puntajes y recomendaciones. Así puedes retomar borradores y consultar tu historial.</p>
        <p>Si aceptas participar en Validación PI2, guardamos tu inscripción, mediciones de uso y respuestas de encuestas. El equipo autorizado consulta los resultados del piloto con un código de participante.</p>
      </section>

      <section className="space-y-2">
        <Heading className={headingStyle}>Qué se comparte con los proveedores de IA</Heading>
        <ul className="list-disc space-y-1 pl-5">
          <li><strong>Importar un CV.</strong> Enviamos el texto extraído, que puede incluir los datos de contacto y cualquier otra información escrita en el CV.</li>
          <li><strong>Generar documentos.</strong> Enviamos los datos del perfil usados en el documento, como formación, experiencia y habilidades, y los datos de la vacante. Al regenerar el CV, también podemos enviar partes de la versión anterior.</li>
          <li><strong>Simular y evaluar entrevistas.</strong> Enviamos el contexto profesional, la vacante y los intercambios de la sesión para generar preguntas y retroalimentación. Para recomendar mejoras entre sesiones, usamos extractos de las entrevistas que selecciones.</li>
        </ul>
        <p>El proveedor de texto depende de tu configuración. Puede ser OpenAI, Anthropic o Google. Si usas la transcripción de EmpleaIA, el audio de tu respuesta se envía a OpenAI. El reconocimiento de voz del navegador también puede intervenir si se usa como alternativa. Estos servicios pueden procesar datos fuera del Perú.</p>
      </section>

      <section className="space-y-2">
        <Heading className={headingStyle}>Cuánto tiempo conservamos los datos</Heading>
        <p>En el piloto, los datos del perfil, documentos e historial se conservan para que puedas volver a consultarlos. Los registros de validación se usan para el análisis académico del piloto. Esta versión no aplica un plazo automático de eliminación. Las copias de respaldo y los registros de proveedores siguen los plazos del servicio correspondiente.</p>
      </section>

      <section className="space-y-2">
        <Heading className={headingStyle}>Cómo consultar, corregir o eliminar tus datos</Heading>
        <p>Puedes corregir tu información en <strong>Mi perfil</strong>. En <strong>Configuración → Privacidad y mis datos</strong>, la opción <strong>Exportar mis datos (JSON)</strong> descarga una copia de los datos disponibles del perfil, documentos, entrevistas y preferencias.</p>
        <p>La opción <strong>Eliminar mi cuenta</strong> pide tu contraseña actual. Al confirmar, elimina tu acceso y los datos vinculados en EmpleaIA, como el perfil, los documentos guardados, las entrevistas y los registros del piloto, y cierra tu sesión. Los archivos que ya descargaste permanecen en tu dispositivo. Para consultas sobre tus datos o solicitudes de privacidad, contacta al equipo del piloto.</p>
      </section>

      <section className="space-y-2">
        <Heading className={headingStyle}>Contacto y derechos en Perú</Heading>
        {contactEmail ? (
          <p>Para consultas o solicitudes de privacidad, escribe a <a href={`mailto:${contactEmail}`} className={`${linkStyle} break-all`}>{contactEmail}</a>.</p>
        ) : (
          <p>Si participas en el piloto, contacta al equipo de EmpleaIA por el canal por el que recibiste tu invitación.</p>
        )}
        <p>En Perú, la Ley N.º 29733 y su reglamento regulan la protección de datos personales. Puedes consultar la <a href="https://www.gob.pe/9270" className={linkStyle}>guía sobre tus derechos de la Autoridad Nacional de Protección de Datos Personales</a>.</p>
      </section>
    </div>
  );
}

export function AvisoDeDatosDialog({ onClose }) {
  const dialogRef = useRef(null);
  const pressedBackdrop = useRef(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog.open) dialog.showModal();
  }, []);

  const isBackdrop = (event) => {
    if (event.target !== event.currentTarget) return false;
    const { left, right, top, bottom } = event.currentTarget.getBoundingClientRect();
    return event.clientX < left || event.clientX >= right || event.clientY < top || event.clientY >= bottom;
  };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="aviso-de-datos-titulo"
      onClose={onClose}
      onPointerDown={(event) => { pressedBackdrop.current = isBackdrop(event); }}
      onPointerCancel={() => { pressedBackdrop.current = false; }}
      onClick={(event) => {
        if (pressedBackdrop.current && isBackdrop(event)) event.currentTarget.close();
        pressedBackdrop.current = false;
      }}
      className="fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-3xl overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 text-slate-700 shadow-2xl backdrop:bg-slate-950/60 backdrop:backdrop-blur-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
    >
      <div className="flex max-h-[calc(100dvh-2rem)] flex-col sm:max-h-[min(85dvh,52rem)]">
        <PolicyHeading heading="h2" onClose={() => dialogRef.current.close()} />
        <div className="min-h-0 overflow-y-auto overscroll-contain" tabIndex={0} aria-label="Contenido de la política">
          <PolicyContent heading="h3" />
        </div>
      </div>
    </dialog>
  );
}

export default function AvisoDeDatos({ signedIn }) {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-700 dark:bg-slate-950 dark:text-slate-200 sm:px-6">
      <article className="mx-auto max-w-3xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="px-5 py-4 sm:px-8">
          <a href={signedIn ? '/settings' : '/'} className={`inline-flex items-center gap-2 text-sm ${linkStyle}`}>
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            {signedIn ? 'Volver a Configuración' : 'Volver a EmpleaIA'}
          </a>
        </div>
        <PolicyHeading heading="h1" />
        <PolicyContent heading="h2" />
      </article>
    </main>
  );
}
