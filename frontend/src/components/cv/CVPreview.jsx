import React from 'react';
import {
  CV_FONTS,
  CV_COLORS,
  CV_FONT_SIZES,
  CV_SPACINGS,
  CV_SECTIONS_DEFAULT,
  CV_SECTION_ORDER_DEFAULT
} from '../../config/cvThemes';

// ============================================================
// CVPreview — Motor de renderizado unificado para todos los
// templates del CV. Cada template tiene su propio layout real.
// ============================================================
export default function CVPreview({
  profile = {},
  cvData = null,
  theme = {},
  sections = {},
  sectionOrder = [],
  // Backward compatibility
  template: legacyTemplate,
  color: legacyColor,
  font: legacyFont,
  headerStyle: legacyHeaderStyle
}) {
  // ── 1. RESOLUCIÓN DE PROPS ─────────────────────────────────
  const selectedTemplate = theme?.template || legacyTemplate || 'classic';
  const selectedColor    = theme?.primaryColor || legacyColor || 'purple';
  const selectedFont     = theme?.fontFamily || legacyFont || 'inter';
  const selectedFontSize  = theme?.fontSize || 'normal';
  const selectedSpacing   = theme?.spacing || 'normal';
  const selectedHeaderStyle = theme?.headerStyle || legacyHeaderStyle || 'centered';

  // Audit logs requeridos
  console.log('Template renderizado en CVPreview:', selectedTemplate);
  console.log('Theme recibido en CVPreview:', theme);

  // ── 2. CONFIGURACIONES DINÁMICAS ──────────────────────────
  const foundColor     = CV_COLORS.find(c => c.id === selectedColor || c.value === selectedColor) || CV_COLORS[2];
  const COLOR          = foundColor.value; // hex del color principal

  const foundFont      = CV_FONTS.find(f => f.id === selectedFont || f.name === selectedFont) || CV_FONTS[0];
  const FONT_CSS       = foundFont.css;

  const sizeObj        = CV_FONT_SIZES.find(s => s.id === selectedFontSize) || CV_FONT_SIZES[1];
  const spacingObj     = CV_SPACINGS.find(s => s.id === selectedSpacing) || CV_SPACINGS[1];

  const activeSections = { ...CV_SECTIONS_DEFAULT, ...sections };
  const activeSectionOrder = Array.isArray(sectionOrder) && sectionOrder.length > 0
    ? sectionOrder
    : CV_SECTION_ORDER_DEFAULT;

  // ── 3. EXTRACCIÓN Y NORMALIZACIÓN DE CONTENIDO ────────────
  const firstName  = profile.first_name || 'Tu';
  const lastName   = profile.last_name  || 'Nombre';
  const email      = profile.email      || '';
  const phone      = profile.phone      || '';
  const location   = profile.location || profile.ubicacion || profile.address || profile.city || '';
  const targetRole = profile.target_role || profile.career || 'Profesional en TI';

  const rawBio     = profile.bio || 'Profesional con experiencia en desarrollo de soluciones tecnológicas y habilidades comprobadas en el campo.';
  const summaryText = cvData?.professional_summary || rawBio;

  const expList    = cvData?.work_experience || profile.work_experience || [];
  const eduList    = cvData?.academic_background || profile.academic_background || [];

  const techSkills = profile.technical_skills || [];
  const softSkills = profile.soft_skills || [];
  const linkedin   = profile.linkedin || profile.linkedIn || profile.linkedin_url || profile.linkedInUrl || '';
  const portfolio  = profile.portfolio || '';

  let techSkillsArr = [...techSkills];
  let softSkillsArr = [...softSkills];

  if (cvData?.skills_categories) {
    const cats = cvData.skills_categories;
    const tList = [...(cats.languages_and_frameworks || []), ...(cats.tools_and_databases || [])];
    if (tList.length > 0) techSkillsArr = tList;
    const sListCv = cats.methodologies_and_soft_skills || [];
    if (sListCv.length > 0) softSkillsArr = sListCv;
  }

  const techSkillsString = techSkillsArr.join(', ') || 'No declaradas';
  const softSkillsString = softSkillsArr.join(', ') || 'No declaradas';

  const projectsList = cvData?.projects || profile.projects || [];

  // ── 4. ESTILOS BASE (inline para máxima compatibilidad con html2pdf) ──
  // La hoja debe medir exactamente el ancho A4 (210mm): html2pdf clona el nodo
  // dentro de un contenedor de 210mm, y cualquier ancho menor deja una franja
  // blanca a la derecha del PDF. minHeight queda en 296mm (no 297mm) para que
  // el redondeo del canvas no derrame una segunda página en blanco.
  const PAGE = {
    fontFamily: FONT_CSS,
    width: '210mm',
    minHeight: '296mm',
    boxSizing: 'border-box',
    backgroundColor: '#ffffff',
    color: '#1e293b',
    position: 'relative',
    overflow: 'visible',
  };

  const FS   = sizeObj.textClass;    // ej: "text-[10px] leading-relaxed"
  const FSH  = sizeObj.headingClass; // ej: "text-[12px] font-bold"

  // ── BLOQUE HELPERS REUTILIZABLES ──────────────────────────
  const ContactItems = () => {
    const items = [];
    if (activeSections.email    && email)    items.push({ label: email });
    if (activeSections.phone    && phone)    items.push({ label: phone });
    if (activeSections.location && location) items.push({ label: location });
    if (activeSections.linkedin && linkedin) items.push({ label: linkedin });
    if (activeSections.portfolio && portfolio) items.push({ label: portfolio });
    return items;
  };

  const contactItems = ContactItems();
  const SECTION_HEADER_GUARD = {
    breakInside: 'avoid',
    pageBreakInside: 'avoid',
    breakAfter: 'avoid',
    pageBreakAfter: 'avoid'
  };
  const SECTION_WRAPPER_GUARD = {
    breakInside: 'avoid',
    pageBreakInside: 'avoid',
    paddingTop: '6px'
  };

  // ── 5. DISPATCH DE TEMPLATES ───────────────────────────────
  switch (selectedTemplate) {

    // ════════════════════════════════════════════════════════
    // TEMPLATE 1 — CLÁSICO PROFESIONAL
    // Una columna, encabezado centrado, divisores horizontales
    // ════════════════════════════════════════════════════════
    case 'classic': {
      console.log('Renderizando ClassicCVTemplate');

      const SectionHeader = ({ title }) => (
        <div style={{ ...SECTION_HEADER_GUARD, borderBottom: `2px solid ${COLOR}20`, marginBottom: '6px', marginTop: '18px', paddingBottom: '4px' }}>
          <h4 style={{ color: COLOR, fontSize: '9px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.12em', margin: 0 }}>
            {title}
          </h4>
        </div>
      );

      const renderSection = (secId) => {
        switch (secId) {
          case 'summary':
            return activeSections.professionalSummary && summaryText ? (
              <div key="summary">
                <SectionHeader title="Perfil Profesional" />
                <p className={FS} style={{ color: '#475569', textAlign: 'justify', margin: 0 }}>{summaryText}</p>
              </div>
            ) : null;

          case 'experience':
            return activeSections.experience && expList.length > 0 ? (
              <div key="exp">
                <SectionHeader title="Experiencia Laboral" />
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {expList.map((exp, i) => (
                    <div key={i}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                        <span className={FSH} style={{ color: '#0f172a' }}>{exp.role}</span>
                        <span style={{ fontSize: '8px', color: '#94a3b8', fontWeight: 600 }}>{exp.period || exp.start_date}</span>
                      </div>
                      <div style={{ fontSize: '9px', color: COLOR, fontWeight: 700 }}>{exp.company}</div>
                      <p className={FS} style={{ color: '#475569', margin: '2px 0 0', textAlign: 'justify' }}>{exp.impact_description || exp.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null;

          case 'education':
            return activeSections.education && eduList.length > 0 ? (
              <div key="edu">
                <SectionHeader title="Educación" />
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {eduList.map((edu, i) => (
                    <div key={i}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                        <span className={FSH} style={{ color: '#0f172a' }}>{edu.degree}</span>
                        <span style={{ fontSize: '8px', color: '#94a3b8', fontWeight: 600 }}>{edu.period || edu.start_date}</span>
                      </div>
                      <div style={{ fontSize: '9px', color: '#64748b', fontWeight: 600 }}>{edu.institution}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null;

          case 'skills':
            return (activeSections.skillsTech || activeSections.skillsSoft) ? (
              <div key="skills">
                <SectionHeader title="Habilidades" />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  {activeSections.skillsTech && (
                    <div>
                      <div style={{ fontSize: '8px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#64748b', marginBottom: '3px' }}>Técnicas</div>
                      <p className={FS} style={{ color: '#475569' }}>{techSkillsString}</p>
                    </div>
                  )}
                  {activeSections.skillsSoft && (
                    <div>
                      <div style={{ fontSize: '8px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#64748b', marginBottom: '3px' }}>Blandas</div>
                      <p className={FS} style={{ color: '#475569' }}>{softSkillsString}</p>
                    </div>
                  )}
                </div>
              </div>
            ) : null;

          case 'projects':
            return activeSections.projects && projectsList.length > 0 ? (
              <div key="proj">
                <SectionHeader title="Proyectos Destacados" />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  {projectsList.map((p, i) => (
                    <div key={i} style={{ border: '1px solid #f1f5f9', borderRadius: '6px', padding: '8px', background: '#fafafa' }}>
                      <div style={{ fontSize: '10px', fontWeight: 700, color: '#0f172a' }}>{p.title || p.name}</div>
                      <div style={{ fontSize: '8px', color: COLOR, fontWeight: 700, marginTop: '2px' }}>{p.tech || p.technologies}</div>
                      <p style={{ fontSize: '9px', color: '#64748b', margin: '3px 0 0' }}>{p.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null;

          default: return null;
        }
      };

      return (
        <div id="cv-sheet-a4-canvas" style={{ ...PAGE, padding: '40px' }}>
          {/* Encabezado centrado */}
          {activeSections.personalInfo && (
            <div style={{ textAlign: 'center', borderBottom: `3px solid ${COLOR}`, paddingBottom: '14px', marginBottom: '8px' }}>
              <h1 style={{ fontSize: '22px', fontWeight: 900, color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 4px' }}>
                {firstName} {lastName}
              </h1>
              <p style={{ fontSize: '10px', color: COLOR, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em', margin: '0 0 8px' }}>
                {targetRole}
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '4px 12px', fontSize: '8.5px', color: '#64748b', fontWeight: 600 }}>
                {contactItems.map((c, i) => (
                  <React.Fragment key={i}>
                    {i > 0 && <span style={{ color: '#cbd5e1' }}>•</span>}
                    <span>{c.label}</span>
                  </React.Fragment>
                ))}
              </div>
            </div>
          )}
          {/* Secciones */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: spacingObj.id === 'compact' ? '4px' : spacingObj.id === 'wide' ? '18px' : '10px' }}>
            {activeSectionOrder.map(s => {
              const sec = renderSection(s);
              if (!sec) return null;
              return <div key={s} style={SECTION_WRAPPER_GUARD}>{sec}</div>;
            })}
          </div>
          {/* Footer */}
          <div style={{ position: 'absolute', bottom: '16px', left: '40px', right: '40px', borderTop: '1px solid #f1f5f9', paddingTop: '6px', display: 'flex', justifyContent: 'space-between', fontSize: '7px', color: '#cbd5e1' }}>
            <span>Optimizado por EmpleaIA</span>
            <span>Formato ATS — Plantilla Clásica</span>
          </div>
        </div>
      );
    }

    // ════════════════════════════════════════════════════════
    // TEMPLATE 2 — MODERNO LATERAL
    // Sidebar oscuro izquierdo + cuerpo principal derecho
    // ════════════════════════════════════════════════════════
    case 'modern-sidebar': {
      console.log('Renderizando ModernSidebarCVTemplate');

      const mainSections = activeSectionOrder.filter(s => !['skills'].includes(s));

      const SectionHeaderMain = ({ title }) => (
        <div style={{ ...SECTION_HEADER_GUARD, borderBottom: `2px solid ${COLOR}30`, marginBottom: '6px', marginTop: '18px', paddingBottom: '4px' }}>
          <h4 style={{ color: '#0f172a', fontSize: '9px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.12em', margin: 0 }}>{title}</h4>
        </div>
      );

      const renderMain = (secId) => {
        switch (secId) {
          case 'summary':
            return activeSections.professionalSummary && summaryText ? (
              <div key="sum">
                <SectionHeaderMain title="Perfil Profesional" />
                <p className={FS} style={{ color: '#475569', textAlign: 'justify', margin: 0 }}>{summaryText}</p>
              </div>
            ) : null;

          case 'experience':
            return activeSections.experience && expList.length > 0 ? (
              <div key="exp">
                <SectionHeaderMain title="Experiencia Laboral" />
                {expList.map((exp, i) => (
                  <div key={i} style={{ marginBottom: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span className={FSH} style={{ color: '#0f172a' }}>{exp.role}</span>
                      <span style={{ fontSize: '8px', color: '#94a3b8', fontWeight: 600 }}>{exp.period || exp.start_date}</span>
                    </div>
                    <div style={{ fontSize: '9px', color: COLOR, fontWeight: 700 }}>{exp.company}</div>
                    <p className={FS} style={{ color: '#475569', margin: '2px 0 0', textAlign: 'justify' }}>{exp.impact_description || exp.description}</p>
                  </div>
                ))}
              </div>
            ) : null;

          case 'education':
            return activeSections.education && eduList.length > 0 ? (
              <div key="edu">
                <SectionHeaderMain title="Educación" />
                {eduList.map((edu, i) => (
                  <div key={i} style={{ marginBottom: '6px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span className={FSH} style={{ color: '#0f172a' }}>{edu.degree}</span>
                      <span style={{ fontSize: '8px', color: '#94a3b8' }}>{edu.period || edu.start_date}</span>
                    </div>
                    <div style={{ fontSize: '9px', color: '#64748b', fontWeight: 600 }}>{edu.institution}</div>
                  </div>
                ))}
              </div>
            ) : null;

          case 'projects':
            return activeSections.projects && projectsList.length > 0 ? (
              <div key="proj">
                <SectionHeaderMain title="Proyectos" />
                {projectsList.map((p, i) => (
                  <div key={i} style={{ marginBottom: '6px' }}>
                    <div style={{ fontSize: '10px', fontWeight: 700, color: '#0f172a' }}>{p.title || p.name}</div>
                    <div style={{ fontSize: '8px', color: COLOR, fontWeight: 700 }}>{p.tech || p.technologies}</div>
                    <p className={FS} style={{ color: '#64748b', margin: '2px 0 0' }}>{p.description}</p>
                  </div>
                ))}
              </div>
            ) : null;

          default: return null;
        }
      };

      return (
        <div id="cv-sheet-a4-canvas" style={{ ...PAGE, display: 'flex' }}>
          {/* SIDEBAR OSCURO */}
          <div style={{ width: '230px', backgroundColor: '#0f172a', color: '#e2e8f0', padding: '28px 20px', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
            {/* Avatar + nombre */}
            {activeSections.personalInfo && (
              <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                <div style={{ width: '64px', height: '64px', borderRadius: '50%', backgroundColor: COLOR, margin: '0 auto 10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px', fontWeight: 900, color: '#fff', border: '3px solid #1e293b' }}>
                  {firstName.charAt(0)}{lastName.charAt(0)}
                </div>
                <h2 style={{ fontSize: '13px', fontWeight: 900, color: '#fff', margin: '0 0 4px', lineHeight: 1.2 }}>{firstName}<br />{lastName}</h2>
                <p style={{ fontSize: '8px', color: COLOR, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0 }}>{targetRole}</p>
              </div>
            )}

            {/* Contacto */}
            {activeSections.personalInfo && contactItems.length > 0 && (
              <div style={{ marginBottom: '16px' }}>
                <div style={{ fontSize: '8px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#475569', borderBottom: '1px solid #1e293b', paddingBottom: '4px', marginBottom: '8px' }}>Contacto</div>
                {contactItems.map((c, i) => (
                  <p key={i} style={{ fontSize: '9px', color: '#94a3b8', margin: '0 0 4px', wordBreak: 'break-word' }}>{c.label}</p>
                ))}
              </div>
            )}

            {/* Habilidades en sidebar */}
            {activeSections.skillsTech && (
              <div style={{ marginBottom: '14px' }}>
                <div style={{ fontSize: '8px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#475569', borderBottom: '1px solid #1e293b', paddingBottom: '4px', marginBottom: '8px' }}>Habilidades Técnicas</div>
                <p style={{ fontSize: '9px', color: '#94a3b8', lineHeight: 1.6, margin: 0 }}>{techSkillsString}</p>
              </div>
            )}
            {activeSections.skillsSoft && (
              <div>
                <div style={{ fontSize: '8px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#475569', borderBottom: '1px solid #1e293b', paddingBottom: '4px', marginBottom: '8px' }}>Habilidades Blandas</div>
                <p style={{ fontSize: '9px', color: '#94a3b8', lineHeight: 1.6, margin: 0 }}>{softSkillsString}</p>
              </div>
            )}

            <div style={{ marginTop: 'auto', fontSize: '7px', color: '#334155', textAlign: 'center', paddingTop: '20px' }}>Optimizado por EmpleaIA</div>
          </div>

          {/* CUERPO PRINCIPAL */}
          <div style={{ flex: 1, padding: '28px 24px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {mainSections.map(s => {
              const sec = renderMain(s);
              if (!sec) return null;
              return <div key={s} style={SECTION_WRAPPER_GUARD}>{sec}</div>;
            })}
          </div>
        </div>
      );
    }

    // ════════════════════════════════════════════════════════
    // TEMPLATE 3 — MINIMALISTA
    // Mucho espacio, tipografía ligera, sin bloques oscuros,
    // divisores casi invisibles, diseño austero
    // ════════════════════════════════════════════════════════
    case 'minimal': {
      console.log('Renderizando MinimalCVTemplate');

      const SectionHeader = ({ title }) => (
        <div style={{ ...SECTION_HEADER_GUARD, display: 'flex', alignItems: 'center', gap: '10px', margin: '22px 0 8px', paddingTop: '2px' }}>
          <div style={{ width: '20px', height: '1px', backgroundColor: COLOR }} />
          <span style={{ fontSize: '8px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.18em', color: '#94a3b8' }}>{title}</span>
          <div style={{ flex: 1, height: '1px', backgroundColor: '#f1f5f9' }} />
        </div>
      );

      const renderSection = (secId) => {
        switch (secId) {
          case 'summary':
            return activeSections.professionalSummary && summaryText ? (
              <div key="sum">
                <SectionHeader title="Sobre mí" />
                <p className={FS} style={{ color: '#64748b', textAlign: 'justify', lineHeight: '1.7', margin: 0 }}>{summaryText}</p>
              </div>
            ) : null;

          case 'experience':
            return activeSections.experience && expList.length > 0 ? (
              <div key="exp">
                <SectionHeader title="Experiencia" />
                {expList.map((exp, i) => (
                  <div key={i} style={{ display: 'flex', gap: '16px', marginBottom: '12px', paddingBottom: '12px', borderBottom: i < expList.length - 1 ? '1px solid #f8fafc' : 'none' }}>
                    <div style={{ width: '80px', flexShrink: 0, textAlign: 'right' }}>
                      <span style={{ fontSize: '8px', color: '#94a3b8', lineHeight: '1.5', display: 'block', marginTop: '2px' }}>{exp.period || exp.start_date}</span>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div className={FSH} style={{ color: '#0f172a', fontWeight: 700 }}>{exp.role}</div>
                      <div style={{ fontSize: '9px', color: COLOR, fontWeight: 500, marginBottom: '4px' }}>{exp.company}</div>
                      <p className={FS} style={{ color: '#64748b', margin: 0, textAlign: 'justify' }}>{exp.impact_description || exp.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : null;

          case 'education':
            return activeSections.education && eduList.length > 0 ? (
              <div key="edu">
                <SectionHeader title="Educación" />
                {eduList.map((edu, i) => (
                  <div key={i} style={{ display: 'flex', gap: '16px', marginBottom: '8px' }}>
                    <div style={{ width: '80px', flexShrink: 0, textAlign: 'right' }}>
                      <span style={{ fontSize: '8px', color: '#94a3b8' }}>{edu.period || edu.start_date}</span>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div className={FSH} style={{ color: '#0f172a', fontWeight: 700 }}>{edu.degree}</div>
                      <div style={{ fontSize: '9px', color: '#64748b' }}>{edu.institution}</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : null;

          case 'skills':
            return (activeSections.skillsTech || activeSections.skillsSoft) ? (
              <div key="skills">
                <SectionHeader title="Competencias" />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  {activeSections.skillsTech && (
                    <div>
                      <div style={{ fontSize: '8px', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '4px' }}>Técnicas</div>
                      <p className={FS} style={{ color: '#64748b', margin: 0 }}>{techSkillsString}</p>
                    </div>
                  )}
                  {activeSections.skillsSoft && (
                    <div>
                      <div style={{ fontSize: '8px', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '4px' }}>Blandas</div>
                      <p className={FS} style={{ color: '#64748b', margin: 0 }}>{softSkillsString}</p>
                    </div>
                  )}
                </div>
              </div>
            ) : null;

          case 'projects':
            return activeSections.projects && projectsList.length > 0 ? (
              <div key="proj">
                <SectionHeader title="Proyectos" />
                {projectsList.map((p, i) => (
                  <div key={i} style={{ marginBottom: '8px' }}>
                    <span style={{ fontSize: '10px', fontWeight: 600, color: '#1e293b' }}>{p.title || p.name}</span>
                    {(p.tech || p.technologies) && <span style={{ fontSize: '8px', color: COLOR, marginLeft: '8px', fontWeight: 500 }}>· {p.tech || p.technologies}</span>}
                    <p className={FS} style={{ color: '#64748b', margin: '2px 0 0' }}>{p.description}</p>
                  </div>
                ))}
              </div>
            ) : null;

          default: return null;
        }
      };

      return (
        <div id="cv-sheet-a4-canvas" style={{ ...PAGE, padding: '48px 52px' }}>
          {/* Encabezado minimal: nombre izquierda, rol sutil */}
          {activeSections.personalInfo && (
            <div style={{ marginBottom: '28px' }}>
              <h1 style={{ fontSize: '28px', fontWeight: 300, color: '#0f172a', letterSpacing: '-0.02em', margin: '0 0 4px' }}>
                <span style={{ fontWeight: 700 }}>{firstName}</span> {lastName}
              </h1>
              <p style={{ fontSize: '11px', color: COLOR, fontWeight: 400, letterSpacing: '0.04em', margin: '0 0 12px' }}>{targetRole}</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 20px', fontSize: '8.5px', color: '#94a3b8', fontWeight: 400 }}>
                {contactItems.map((c, i) => <span key={i}>{c.label}</span>)}
              </div>
            </div>
          )}
          {/* Cuerpo con líneas de tiempo */}
          {activeSectionOrder.map(s => {
            const sec = renderSection(s);
            if (!sec) return null;
            return <div key={s} style={SECTION_WRAPPER_GUARD}>{sec}</div>;
          })}

          <div style={{ position: 'absolute', bottom: '18px', right: '52px', fontSize: '7px', color: '#e2e8f0' }}>EmpleaIA · Minimalista</div>
        </div>
      );
    }

    // ════════════════════════════════════════════════════════
    // TEMPLATE 4 — EJECUTIVO
    // Banda de color al tope, tipografía grande, estructura
    // formal con separadores fuertes y jerarquía clara
    // ════════════════════════════════════════════════════════
    case 'executive': {
      console.log('Renderizando ExecutiveCVTemplate');

      const SectionHeader = ({ title }) => (
        <div style={{ ...SECTION_HEADER_GUARD, display: 'flex', alignItems: 'center', gap: '8px', margin: '22px 0 8px', paddingTop: '2px' }}>
          <span style={{ fontSize: '9px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.14em', color: '#0f172a', whiteSpace: 'nowrap' }}>{title}</span>
          <div style={{ flex: 1, height: '2px', backgroundColor: COLOR }} />
        </div>
      );

      const renderSection = (secId) => {
        switch (secId) {
          case 'summary':
            return activeSections.professionalSummary && summaryText ? (
              <div key="sum">
                <SectionHeader title="Resumen Ejecutivo" />
                <p className={FS} style={{ color: '#334155', textAlign: 'justify', lineHeight: '1.7', padding: '8px 12px', borderLeft: `3px solid ${COLOR}`, background: `${COLOR}08`, margin: 0 }}>{summaryText}</p>
              </div>
            ) : null;

          case 'experience':
            return activeSections.experience && expList.length > 0 ? (
              <div key="exp">
                <SectionHeader title="Trayectoria Profesional" />
                {expList.map((exp, i) => (
                  <div key={i} style={{ marginBottom: '10px', paddingBottom: '10px', borderBottom: i < expList.length - 1 ? `1px solid ${COLOR}20` : 'none' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div className={FSH} style={{ color: '#0f172a', fontWeight: 900 }}>{exp.role}</div>
                      <div style={{ fontSize: '8px', backgroundColor: `${COLOR}15`, color: COLOR, fontWeight: 700, padding: '2px 8px', borderRadius: '4px' }}>{exp.period || exp.start_date}</div>
                    </div>
                    <div style={{ fontSize: '9.5px', color: '#475569', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>{exp.company}</div>
                    <p className={FS} style={{ color: '#475569', margin: 0, textAlign: 'justify' }}>{exp.impact_description || exp.description}</p>
                    {exp.achievements?.length > 0 && (
                      <ul style={{ paddingLeft: '14px', margin: '4px 0 0', color: '#475569' }}>
                        {exp.achievements.map((a, ai) => <li key={ai} className={FS} style={{ marginBottom: '2px' }}>{a}</li>)}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            ) : null;

          case 'education':
            return activeSections.education && eduList.length > 0 ? (
              <div key="edu">
                <SectionHeader title="Formación Académica" />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  {eduList.map((edu, i) => (
                    <div key={i} style={{ padding: '8px', border: `1px solid ${COLOR}25`, borderRadius: '4px' }}>
                      <div className={FSH} style={{ color: '#0f172a' }}>{edu.degree}</div>
                      <div style={{ fontSize: '9px', color: '#64748b', fontWeight: 600 }}>{edu.institution}</div>
                      <div style={{ fontSize: '8px', color: '#94a3b8', marginTop: '2px' }}>{edu.period || edu.start_date}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null;

          case 'skills':
            return (activeSections.skillsTech || activeSections.skillsSoft) ? (
              <div key="skills">
                <SectionHeader title="Competencias Profesionales" />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  {activeSections.skillsTech && (
                    <div style={{ padding: '8px 12px', background: `${COLOR}06`, borderRadius: '4px', borderLeft: `3px solid ${COLOR}` }}>
                      <div style={{ fontSize: '8px', fontWeight: 800, textTransform: 'uppercase', color: '#64748b', marginBottom: '4px' }}>Técnicas</div>
                      <p className={FS} style={{ color: '#334155', margin: 0 }}>{techSkillsString}</p>
                    </div>
                  )}
                  {activeSections.skillsSoft && (
                    <div style={{ padding: '8px 12px', background: '#f8fafc', borderRadius: '4px', borderLeft: '3px solid #e2e8f0' }}>
                      <div style={{ fontSize: '8px', fontWeight: 800, textTransform: 'uppercase', color: '#64748b', marginBottom: '4px' }}>Blandas</div>
                      <p className={FS} style={{ color: '#334155', margin: 0 }}>{softSkillsString}</p>
                    </div>
                  )}
                </div>
              </div>
            ) : null;

          case 'projects':
            return activeSections.projects && projectsList.length > 0 ? (
              <div key="proj">
                <SectionHeader title="Proyectos Clave" />
                {projectsList.map((p, i) => (
                  <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'baseline', marginBottom: '6px' }}>
                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: COLOR, flexShrink: 0, marginTop: '4px' }} />
                    <div>
                      <span style={{ fontSize: '10px', fontWeight: 700, color: '#0f172a' }}>{p.title || p.name}</span>
                      {(p.tech || p.technologies) && <span style={{ fontSize: '8px', color: COLOR, fontWeight: 600, marginLeft: '6px' }}>({p.tech || p.technologies})</span>}
                      <p className={FS} style={{ color: '#475569', margin: '2px 0 0' }}>{p.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : null;

          default: return null;
        }
      };

      return (
        <div id="cv-sheet-a4-canvas" style={{ ...PAGE }}>
          {/* BANDA DE ENCABEZADO EJECUTIVO */}
          {activeSections.personalInfo && (
            <div style={{ backgroundColor: COLOR, padding: '24px 36px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h1 style={{ fontSize: '22px', fontWeight: 900, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 4px' }}>
                  {firstName} {lastName}
                </h1>
                <p style={{ fontSize: '10px', color: '#ffffff99', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', margin: 0 }}>{targetRole}</p>
              </div>
              <div style={{ textAlign: 'right', fontSize: '8.5px', color: '#ffffff99', lineHeight: '1.8' }}>
                {contactItems.map((c, i) => <div key={i}>{c.label}</div>)}
              </div>
            </div>
          )}

          {/* CUERPO */}
          <div style={{ padding: '20px 36px 40px' }}>
            {activeSectionOrder.map(s => {
              const sec = renderSection(s);
              if (!sec) return null;
              return <div key={s} style={SECTION_WRAPPER_GUARD}>{sec}</div>;
            })}
          </div>

          <div style={{ position: 'absolute', bottom: '10px', left: '36px', right: '36px', borderTop: '1px solid #f1f5f9', paddingTop: '5px', display: 'flex', justifyContent: 'space-between', fontSize: '7px', color: '#cbd5e1' }}>
            <span>Optimizado por EmpleaIA</span><span>Plantilla Ejecutiva</span>
          </div>
        </div>
      );
    }

    // ════════════════════════════════════════════════════════
    // TEMPLATE 5 — TECNOLÓGICO
    // Estilo developer: monospace en roles, chips de skills,
    // header con borde inferior grueso, indicador de estado
    // ════════════════════════════════════════════════════════
    case 'tech': {
      console.log('Renderizando TechCVTemplate');

      const SectionHeader = ({ title }) => (
        <div style={{ ...SECTION_HEADER_GUARD, display: 'flex', alignItems: 'center', gap: '8px', margin: '20px 0 8px', paddingTop: '2px' }}>
          <span style={{ fontSize: '9px', color: '#94a3b8', fontFamily: 'monospace', fontWeight: 700 }}>{'// '}</span>
          <span style={{ fontSize: '9px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#0f172a' }}>{title}</span>
        </div>
      );

      const SkillBadge = ({ label }) => (
        <span style={{ display: 'inline-block', backgroundColor: `${COLOR}12`, border: `1px solid ${COLOR}30`, color: COLOR, fontSize: '8px', fontWeight: 700, padding: '2px 8px', borderRadius: '4px', margin: '2px' }}>{label}</span>
      );

      const renderSection = (secId) => {
        switch (secId) {
          case 'summary':
            return activeSections.professionalSummary && summaryText ? (
              <div key="sum">
                <SectionHeader title="about_me" />
                <p className={FS} style={{ color: '#475569', textAlign: 'justify', margin: 0, lineHeight: '1.7' }}>{summaryText}</p>
              </div>
            ) : null;

          case 'experience':
            return activeSections.experience && expList.length > 0 ? (
              <div key="exp">
                <SectionHeader title="work_experience" />
                {expList.map((exp, i) => (
                  <div key={i} style={{ marginBottom: '10px', paddingLeft: '10px', borderLeft: `2px solid ${COLOR}40` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <code style={{ fontSize: '10px', fontWeight: 700, color: COLOR, fontFamily: 'monospace' }}>{exp.role}</code>
                      <span style={{ fontSize: '8px', color: '#64748b', fontFamily: 'monospace' }}>{exp.period || exp.start_date}</span>
                    </div>
                    <div style={{ fontSize: '9px', color: '#334155', fontWeight: 600, marginBottom: '3px' }}>{exp.company}</div>
                    <p className={FS} style={{ color: '#475569', margin: 0 }}>{exp.impact_description || exp.description}</p>
                  </div>
                ))}
              </div>
            ) : null;

          case 'education':
            return activeSections.education && eduList.length > 0 ? (
              <div key="edu">
                <SectionHeader title="education" />
                {eduList.map((edu, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', alignItems: 'baseline' }}>
                    <div>
                      <span className={FSH} style={{ color: '#0f172a' }}>{edu.degree}</span>
                      <span style={{ fontSize: '9px', color: '#64748b', marginLeft: '8px' }}>{edu.institution}</span>
                    </div>
                    <span style={{ fontSize: '8px', color: '#94a3b8', fontFamily: 'monospace' }}>{edu.period || edu.start_date}</span>
                  </div>
                ))}
              </div>
            ) : null;

          case 'skills':
            return (activeSections.skillsTech || activeSections.skillsSoft) ? (
              <div key="skills">
                <SectionHeader title="skills &amp; tools" />
                {activeSections.skillsTech && techSkillsArr.length > 0 && (
                  <div style={{ marginBottom: '8px' }}>
                    <div style={{ fontSize: '8px', color: '#94a3b8', fontFamily: 'monospace', fontWeight: 700, marginBottom: '4px' }}>{'// tech_stack'}</div>
                    <div>{techSkillsArr.map((s, i) => <SkillBadge key={i} label={s} />)}</div>
                  </div>
                )}
                {activeSections.skillsSoft && softSkillsArr.length > 0 && (
                  <div>
                    <div style={{ fontSize: '8px', color: '#94a3b8', fontFamily: 'monospace', fontWeight: 700, marginBottom: '4px' }}>{'// soft_skills'}</div>
                    <p className={FS} style={{ color: '#475569', margin: 0 }}>{softSkillsString}</p>
                  </div>
                )}
                {!techSkillsArr.length && !softSkillsArr.length && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    {activeSections.skillsTech && <p className={FS} style={{ color: '#475569' }}>{techSkillsString}</p>}
                    {activeSections.skillsSoft && <p className={FS} style={{ color: '#475569' }}>{softSkillsString}</p>}
                  </div>
                )}
              </div>
            ) : null;

          case 'projects':
            return activeSections.projects && projectsList.length > 0 ? (
              <div key="proj">
                <SectionHeader title="projects" />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  {projectsList.map((p, i) => (
                    <div key={i} style={{ border: `1px solid ${COLOR}30`, borderRadius: '6px', padding: '8px', background: `${COLOR}04` }}>
                      <div style={{ fontSize: '10px', fontWeight: 700, color: '#0f172a' }}>{p.title || p.name}</div>
                      {(p.tech || p.technologies) && <code style={{ fontSize: '8px', color: COLOR, fontFamily: 'monospace' }}>{p.tech || p.technologies}</code>}
                      <p className={FS} style={{ color: '#475569', margin: '4px 0 0' }}>{p.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null;

          default: return null;
        }
      };

      return (
        <div id="cv-sheet-a4-canvas" style={{ ...PAGE, padding: '32px' }}>
          {/* HEADER TECH */}
          {activeSections.personalInfo && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: `4px solid ${COLOR}`, paddingBottom: '16px', marginBottom: '4px' }}>
              <div>
                <h1 style={{ fontSize: '22px', fontWeight: 900, color: '#0f172a', margin: '0 0 2px', letterSpacing: '-0.01em' }}>{firstName} {lastName}</h1>
                <code style={{ fontSize: '10px', color: COLOR, fontFamily: 'monospace', fontWeight: 700 }}>&lt; {targetRole} /&gt;</code>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', marginTop: '6px', fontSize: '8.5px', color: '#64748b', fontWeight: 500 }}>
                  {contactItems.map((c, i) => <span key={i}>{c.label}</span>)}
                </div>
              </div>
              {/* Status pill */}
              <div style={{ backgroundColor: '#ecfdf5', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '8px 12px', textAlign: 'center' }}>
                <div style={{ fontSize: '7px', fontWeight: 900, color: '#16a34a', textTransform: 'uppercase', letterSpacing: '0.1em' }}>● DISPONIBLE</div>
                <div style={{ fontSize: '7px', color: '#4ade80', fontWeight: 600, marginTop: '1px' }}>Para contratar</div>
              </div>
            </div>
          )}
          {/* Secciones */}
          {activeSectionOrder.map(s => {
            const sec = renderSection(s);
            if (!sec) return null;
            return <div key={s} style={SECTION_WRAPPER_GUARD}>{sec}</div>;
          })}

          <div style={{ position: 'absolute', bottom: '12px', left: '32px', right: '32px', borderTop: '1px solid #f1f5f9', paddingTop: '5px', display: 'flex', justifyContent: 'space-between', fontSize: '7px', color: '#94a3b8', fontFamily: 'monospace' }}>
            <span>// EmpleaIA Tech Template</span><span>STATUS: SYSTEM_READY ✓</span>
          </div>
        </div>
      );
    }

    // ════════════════════════════════════════════════════════
    // TEMPLATE 6 — CREATIVO SIMPLE
    // Acento de color en franja lateral, grid asimétrico,
    // tipografía grande para nombre, composición moderna
    // ════════════════════════════════════════════════════════
    case 'creative-simple': {
      console.log('Renderizando CreativeSimpleCVTemplate');

      const SectionHeader = ({ title }) => (
        <div style={{ ...SECTION_HEADER_GUARD, margin: '22px 0 8px', position: 'relative', paddingLeft: '10px', paddingTop: '2px', borderLeft: `3px solid ${COLOR}` }}>
          <h4 style={{ fontSize: '9px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.14em', color: '#334155', margin: 0 }}>{title}</h4>
        </div>
      );

      const renderSection = (secId) => {
        switch (secId) {
          case 'summary':
            return activeSections.professionalSummary && summaryText ? (
              <div key="sum">
                <SectionHeader title="Perfil" />
                <p className={FS} style={{ color: '#475569', textAlign: 'justify', lineHeight: '1.7', margin: 0 }}>{summaryText}</p>
              </div>
            ) : null;

          case 'experience':
            return activeSections.experience && expList.length > 0 ? (
              <div key="exp">
                <SectionHeader title="Experiencia" />
                {expList.map((exp, i) => (
                  <div key={i} style={{ marginBottom: '10px', paddingBottom: '10px', borderBottom: i < expList.length - 1 ? '1px dashed #f1f5f9' : 'none' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                      <span className={FSH} style={{ color: '#0f172a' }}>{exp.role}</span>
                      <span style={{ fontSize: '8px', color: '#94a3b8', fontStyle: 'italic' }}>{exp.period || exp.start_date}</span>
                    </div>
                    <div style={{ fontSize: '9px', color: COLOR, fontWeight: 600, marginBottom: '3px' }}>{exp.company}</div>
                    <p className={FS} style={{ color: '#64748b', margin: 0, textAlign: 'justify' }}>{exp.impact_description || exp.description}</p>
                  </div>
                ))}
              </div>
            ) : null;

          case 'education':
            return activeSections.education && eduList.length > 0 ? (
              <div key="edu">
                <SectionHeader title="Educación" />
                {eduList.map((edu, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', alignItems: 'baseline' }}>
                    <div>
                      <span className={FSH} style={{ color: '#0f172a' }}>{edu.degree}</span>
                      <span style={{ fontSize: '9px', color: '#64748b', display: 'block' }}>{edu.institution}</span>
                    </div>
                    <span style={{ fontSize: '8px', color: '#94a3b8', flexShrink: 0, marginLeft: '8px' }}>{edu.period || edu.start_date}</span>
                  </div>
                ))}
              </div>
            ) : null;

          case 'skills':
            return (activeSections.skillsTech || activeSections.skillsSoft) ? (
              <div key="skills">
                <SectionHeader title="Habilidades" />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  {activeSections.skillsTech && (
                    <div style={{ background: `${COLOR}08`, borderRadius: '6px', padding: '8px' }}>
                      <div style={{ fontSize: '8px', fontWeight: 700, color: COLOR, textTransform: 'uppercase', marginBottom: '4px' }}>Técnicas</div>
                      <p className={FS} style={{ color: '#334155', margin: 0 }}>{techSkillsString}</p>
                    </div>
                  )}
                  {activeSections.skillsSoft && (
                    <div style={{ background: '#f8fafc', borderRadius: '6px', padding: '8px' }}>
                      <div style={{ fontSize: '8px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '4px' }}>Blandas</div>
                      <p className={FS} style={{ color: '#334155', margin: 0 }}>{softSkillsString}</p>
                    </div>
                  )}
                </div>
              </div>
            ) : null;

          case 'projects':
            return activeSections.projects && projectsList.length > 0 ? (
              <div key="proj">
                <SectionHeader title="Proyectos" />
                {projectsList.map((p, i) => (
                  <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', marginBottom: '8px' }}>
                    <div style={{ width: '4px', height: '4px', borderRadius: '50%', backgroundColor: COLOR, flexShrink: 0, marginTop: '5px' }} />
                    <div>
                      <span style={{ fontSize: '10px', fontWeight: 700, color: '#0f172a' }}>{p.title || p.name}</span>
                      {(p.tech || p.technologies) && <span style={{ fontSize: '8px', color: COLOR, marginLeft: '6px', fontWeight: 500 }}>{p.tech || p.technologies}</span>}
                      <p className={FS} style={{ color: '#64748b', margin: '2px 0 0' }}>{p.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : null;

          default: return null;
        }
      };

      return (
        <div id="cv-sheet-a4-canvas" style={{ ...PAGE, display: 'flex' }}>
          {/* Franja lateral de color */}
          <div style={{ width: '8px', backgroundColor: COLOR, flexShrink: 0 }} />

          {/* Contenido principal */}
          <div style={{ flex: 1, padding: '36px 36px 36px 28px' }}>
            {/* Encabezado creativo asimétrico */}
            {activeSections.personalInfo && (
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '16px', alignItems: 'end', borderBottom: `1px solid #f1f5f9`, paddingBottom: '16px', marginBottom: '4px' }}>
                <div>
                  <h1 style={{ fontSize: '26px', fontWeight: 900, color: '#0f172a', letterSpacing: '-0.02em', margin: '0 0 4px', lineHeight: 1.1 }}>
                    {firstName}<br />{lastName}
                  </h1>
                  <p style={{ fontSize: '10px', color: COLOR, fontWeight: 600, margin: 0 }}>{targetRole}</p>
                </div>
                <div style={{ textAlign: 'right', fontSize: '8.5px', color: '#64748b', lineHeight: '1.8' }}>
                  {contactItems.map((c, i) => <div key={i}>{c.label}</div>)}
                </div>
              </div>
            )}

            {/* Secciones */}
            {activeSectionOrder.map(s => {
              const sec = renderSection(s);
              if (!sec) return null;
              return <div key={s} style={SECTION_WRAPPER_GUARD}>{sec}</div>;
            })}

            <div style={{ position: 'absolute', bottom: '14px', left: '44px', right: '36px', borderTop: '1px solid #f1f5f9', paddingTop: '5px', display: 'flex', justifyContent: 'space-between', fontSize: '7px', color: '#cbd5e1' }}>
              <span>Optimizado por EmpleaIA</span><span>Plantilla Creativo Simple</span>
            </div>
          </div>
        </div>
      );
    }

    // ════════════════════════════════════════════════════════
    // FALLBACK → Classic
    // ════════════════════════════════════════════════════════
    default: {
      console.warn('CVPreview: Template desconocido, usando classic como fallback:', selectedTemplate);
      return (
        <div id="cv-sheet-a4-canvas" style={{ ...PAGE, padding: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ color: '#94a3b8', fontSize: '12px' }}>Cargando plantilla...</p>
        </div>
      );
    }
  }
}
