// Utilidades compartidas para la voz de la entrevistadora IA (Web Speech API).
// La preferencia y la voz elegida se guardan en localStorage porque las voces
// disponibles dependen del navegador/SO del usuario (no tiene sentido en backend).

export const VOICE_URI_KEY = 'empleaia_interview_voice_uri';
export const VOICE_PREF_KEY = 'empleaia_interview_voice_pref';

export const VOICE_PREFERENCES = [
  { id: 'auto', label: 'Automática (recomendada)' },
  { id: 'female', label: 'Voz femenina' },
  { id: 'male', label: 'Voz masculina' },
  { id: 'latam', label: 'Español latino' },
  { id: 'spain', label: 'Español de España' }
];

const FEMALE_HINTS = ['female', 'mujer', 'helena', 'sabina', 'paulina', 'monica', 'mónica', 'laura', 'elvira', 'dalia', 'camila', 'lucia', 'lucía', 'isabela', 'sofia', 'sofía', 'francisca', 'elena', 'ximena', 'renata', 'larissa'];
const MALE_HINTS = ['male', 'hombre', 'jorge', 'pablo', 'raul', 'raúl', 'diego', 'andres', 'andrés', 'tomas', 'tomás', 'alvaro', 'álvaro', 'gonzalo', 'juan', 'mario', 'gerardo', 'liberto', 'saul', 'saúl', 'emilio', 'alonso'];
const LATAM_LANGS = ['es-mx', 'es-us', 'es-pe', 'es-co', 'es-ar', 'es-cl', 'es-419'];

export const getSpanishVoices = (voices = []) =>
  voices.filter(v => v.lang?.toLowerCase().startsWith('es'));

// Heurística por nombre: los navegadores no exponen género de la voz.
export const guessVoiceGender = (voice) => {
  const name = (voice?.name || '').toLowerCase();
  if (FEMALE_HINTS.some(h => name.includes(h))) return 'female';
  if (MALE_HINTS.some(h => name.includes(h))) return 'male';
  return 'unknown';
};

export const pickBestSpanishVoice = (voices = []) => {
  const spanishVoices = getSpanishVoices(voices);
  if (!spanishVoices.length) return null;

  const langPriority = ['es-pe', 'es-mx', 'es-us', 'es-es'];
  const namePriority = ['google', 'microsoft', 'natural', 'online', 'sabina', 'jorge', 'helena', 'paulina', 'monica'];

  return [...spanishVoices].sort((a, b) => {
    const aLang = a.lang.toLowerCase();
    const bLang = b.lang.toLowerCase();
    const aName = a.name.toLowerCase();
    const bName = b.name.toLowerCase();
    const aLangScore = langPriority.findIndex(lang => aLang === lang);
    const bLangScore = langPriority.findIndex(lang => bLang === lang);
    const aNameScore = namePriority.findIndex(name => aName.includes(name));
    const bNameScore = namePriority.findIndex(name => bName.includes(name));

    const normalizedALang = aLangScore === -1 ? 99 : aLangScore;
    const normalizedBLang = bLangScore === -1 ? 99 : bLangScore;
    if (normalizedALang !== normalizedBLang) return normalizedALang - normalizedBLang;

    const normalizedAName = aNameScore === -1 ? 99 : aNameScore;
    const normalizedBName = bNameScore === -1 ? 99 : bNameScore;
    if (normalizedAName !== normalizedBName) return normalizedAName - normalizedBName;

    return a.name.localeCompare(b.name);
  })[0];
};

// Elige la mejor voz según la preferencia del usuario. Si el filtro no
// encuentra candidatas, degrada al conjunto completo de voces en español
// (fallback automático; nunca deja al lector sin voz por una preferencia).
export const pickVoiceByPreference = (voices = [], pref = 'auto') => {
  const spanish = getSpanishVoices(voices);
  if (!spanish.length) return null;

  let candidates = spanish;
  if (pref === 'female' || pref === 'male') {
    const filtered = spanish.filter(v => guessVoiceGender(v) === pref);
    if (filtered.length) candidates = filtered;
  } else if (pref === 'latam') {
    const filtered = spanish.filter(v => LATAM_LANGS.includes(v.lang.toLowerCase()));
    if (filtered.length) candidates = filtered;
  } else if (pref === 'spain') {
    const filtered = spanish.filter(v => v.lang.toLowerCase() === 'es-es');
    if (filtered.length) candidates = filtered;
  }

  return pickBestSpanishVoice(candidates) || candidates[0];
};
