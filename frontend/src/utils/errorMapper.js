/**
 * Mapeador de errores técnicos a mensajes amigables y legibles en español.
 * 
 * @param {Error|object|string} error - El error original capturado
 * @returns {string} Mensaje traducido y apto para mostrar al usuario final
 */
export function mapError(error) {
  if (!error) {
    return 'Ocurrió un inconveniente inesperado. Por favor, inténtalo de nuevo.';
  }

  // Extraer mensaje e identificar si es un string directo o un objeto Error
  const rawMessage = typeof error === 'string' 
    ? error 
    : (error.message || error.error || error.error_description || error.description || '');
  
  const code = error.code || '';
  const messageLower = rawMessage.toLowerCase();

  // 1. Errores de Red y Conectividad
  if (
    messageLower.includes('failed to fetch') ||
    messageLower.includes('network') ||
    messageLower.includes('connect') ||
    messageLower.includes('load failed') ||
    code === 'NETWORK_ERROR'
  ) {
    return 'No pudimos establecer conexión con el servidor. Por favor, verifica tu conexión a internet.';
  }

  // 2. Errores de Autenticación de Supabase (Registro y Login)
  if (messageLower.includes('user already registered') || messageLower.includes('email_exists') || messageLower.includes('already exists')) {
    return 'Esta dirección de correo electrónico ya está registrada. Por favor, intenta iniciar sesión.';
  }

  if (messageLower.includes('invalid login credentials') || messageLower.includes('invalid_credentials') || messageLower.includes('invalid claim')) {
    return 'El correo electrónico o la contraseña ingresados son incorrectos. Por favor, verifica tus datos.';
  }

  if (messageLower.includes('email not confirmed') || messageLower.includes('confirmation')) {
    return 'Debes confirmar tu correo electrónico. Por favor, revisa tu bandeja de entrada o spam.';
  }

  if (messageLower.includes('session expired') || messageLower.includes('sesión expiró') || code === 'AUTH_REQUIRED') {
    return 'Tu sesión ha expirado. Por favor, vuelve a iniciar sesión para continuar.';
  }

  // 3. Errores del Servidor e Inteligencia Artificial
  if (messageLower.includes('too many requests') || messageLower.includes('429') || messageLower.includes('rate limit')) {
    return 'Has excedido el límite de solicitudes. Por favor, espera un momento e inténtalo de nuevo.';
  }

  if (messageLower.includes('timeout') || messageLower.includes('tiempo de espera')) {
    return 'El servidor tardó demasiado en responder. Por favor, intenta realizar la acción nuevamente.';
  }

  // 4. Errores de Base de Datos y Permisos (Supabase/RLS)
  if (code === 'BYOK_MIGRATION_MISSING') {
    return 'Configuración BYOK pendiente de migración. Por favor, ejecuta las migraciones SQL en Supabase.';
  }

  if (code === 'BYOK_PERMISSION_ERROR' || messageLower.includes('permission denied') || messageLower.includes('row-level security')) {
    return 'No tienes permisos suficientes para realizar esta acción. Verifica tu cuenta o las políticas RLS.';
  }

  // 5. Respuestas genéricas del backend
  if (rawMessage === 'Ocurrió un error interno no controlado en el servidor') {
    return 'El sistema experimentó un fallo interno temporal. Nuestro equipo ha sido notificado.';
  }

  // Mensaje por defecto si no coincide con ninguno anterior, pero traduciendo partes conocidas o haciéndolo más suave
  if (rawMessage) {
    // Si ya está en español y es una cadena amigable, la dejamos pasar
    if (/^[A-ZÁÉÍÓÚÑ]/.test(rawMessage) && !messageLower.includes('error') && rawMessage.length < 100) {
      return rawMessage;
    }
    return `No se pudo completar la operación: ${rawMessage}`;
  }

  return 'Ocurrió un inconveniente inesperado. Por favor, vuelve a intentarlo.';
}
