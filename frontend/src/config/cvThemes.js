export const CV_TEMPLATES = [
  { id: "classic", name: "Clásico profesional", atsLevel: "friendly" },
  { id: "modern-sidebar", name: "Moderno lateral", atsLevel: "visual" },
  { id: "minimal", name: "Minimalista", atsLevel: "friendly" },
  { id: "executive", name: "Ejecutivo", atsLevel: "moderate" },
  { id: "tech", name: "Tecnológico", atsLevel: "visual" },
  { id: "creative-simple", name: "Creativo simple", atsLevel: "visual" }
];

export const CV_FONTS = [
  { id: "inter", name: "Inter", css: "'Inter', sans-serif" },
  { id: "roboto", name: "Roboto", css: "'Roboto', sans-serif" },
  { id: "open-sans", name: "Open Sans", css: "'Open Sans', sans-serif" },
  { id: "lato", name: "Lato", css: "'Lato', sans-serif" },
  { id: "montserrat", name: "Montserrat", css: "'Montserrat', sans-serif" },
  { id: "poppins", name: "Poppins", css: "'Poppins', sans-serif" },
  { id: "source-sans-3", name: "Source Sans 3", css: "'Source Sans 3', sans-serif" },
  { id: "nunito-sans", name: "Nunito Sans", css: "'Nunito Sans', sans-serif" },
  { id: "merriweather", name: "Merriweather", css: "'Merriweather', serif" },
  { id: "playfair", name: "Playfair Display", css: "'Playfair Display', serif" }
];

export const CV_COLORS = [
  { id: "blue", name: "Azul profesional", value: "#2563EB" },
  { id: "navy", name: "Azul oscuro", value: "#1E3A8A" },
  { id: "purple", name: "Morado EmpleaIA", value: "#4F46E5" },
  { id: "petrol", name: "Verde petróleo", value: "#0F766E" },
  { id: "gray", name: "Gris ejecutivo", value: "#374151" },
  { id: "black", name: "Negro clásico", value: "#111827" },
  { id: "wine", name: "Vino oscuro", value: "#7F1D1D" },
  { id: "teal", name: "Teal", value: "#0D9488" },
  { id: "indigo", name: "Índigo", value: "#4338CA" },
  { id: "orange", name: "Naranja sobrio", value: "#C2410C" }
];

export const CV_FONT_SIZES = [
  { id: "small", name: "Pequeño", textClass: "text-[9px] leading-relaxed", headingClass: "text-[11px] font-bold" },
  { id: "normal", name: "Normal", textClass: "text-[10px] leading-relaxed", headingClass: "text-[12px] font-bold" },
  { id: "large", name: "Grande", textClass: "text-[11px] leading-relaxed", headingClass: "text-[13px] font-bold" }
];

export const CV_SPACINGS = [
  { id: "compact", name: "Compacto", gapClass: "space-y-1 mt-1 mb-2", pyClass: "py-0.5", myClass: "my-1" },
  { id: "normal", name: "Normal", gapClass: "space-y-2.5 mt-2.5 mb-4", pyClass: "py-1.5", myClass: "my-2.5" },
  { id: "wide", name: "Amplio", gapClass: "space-y-4.5 mt-4 mb-6", pyClass: "py-2.5", myClass: "my-4.5" }
];

export const CV_HEADER_STYLES = [
  { id: "centered", name: "Centrado" },
  { id: "left", name: "Izquierda" },
  { id: "top-band", name: "Con banda superior" },
  { id: "sidebar", name: "Con columna lateral" }
];

export const CV_SECTIONS_DEFAULT = {
  personalInfo: true,
  phone: true,
  email: true,
  location: true,
  linkedin: true,
  portfolio: true,
  skillsSoft: true,
  skillsTech: true,
  professionalSummary: true,
  experience: true,
  education: true,
  projects: true
};

export const CV_SECTION_ORDER_DEFAULT = [
  "summary",
  "experience",
  "education",
  "projects",
  "skills"
];
