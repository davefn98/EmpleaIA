// Se reconocen sólo órdenes completas para evitar cierres por frases citadas o negadas.
export const isFinishInterviewVoiceCommand = (value = '') => {
  const text = String(value).normalize('NFD').replace(/\p{M}/gu, '')
    .toLowerCase().replace(/[¿?¡!.,]/g, '').trim().replace(/\s+/g, ' ');
  return /^(?:por favor )?(?:termina|finaliza|cierra|quiero terminar|quiero finalizar|quiero cerrar)(?: la| esta)? entrevista(?: ahora)?(?: por favor)?$/.test(text);
};
