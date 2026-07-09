import { supabase } from './supabaseClient';

export const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000/api';

/**
 * Orquestador genérico de peticiones Fetch hacia el Backend de Express
 * @param {string} endpoint - Ruta del endpoint (ej. '/cv-generate' o '/interview/start')
 * @param {string} method - Método HTTP (por defecto POST)
 * @param {object} body - Payload JSON a enviar
 * @returns {Promise<object>} - Respuesta JSON deserializada
 */
export async function apiRequest(endpoint, method = 'POST', body = null, timeoutMs = 60000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;

    const headers = {
      'Content-Type': 'application/json',
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const config = {
      method,
      headers,
      signal: controller.signal,
    };

    if (body) {
      config.body = JSON.stringify(body);
    }

    const response = await fetch(`${BACKEND_URL}${endpoint}`, config);
    clearTimeout(timeoutId);

    // Sesión expirada o inválida: cerrar sesión limpiamente.
    // onAuthStateChange (SIGNED_OUT) en App.jsx redirige al login.
    if (response.status === 401) {
      await supabase.auth.signOut();
      throw new Error('Tu sesión expiró. Vuelve a iniciar sesión.');
    }

    // Si la respuesta no es JSON (ej. error crítico del servidor web)
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      throw new Error(`Respuesta no esperada del servidor (${response.status})`);
    }

    const data = await response.json();

    if (!response.ok) {
      const err = new Error(data.error || data.message || 'Error en la petición de red.');
      err.code = data.code; // Preserva el código de error (ej. BYOK_MIGRATION_MISSING)
      throw err;
    }

    return data;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      const timeoutErr = new Error('La generación tardó demasiado. Inténtalo nuevamente.');
      timeoutErr.code = 'TIMEOUT';
      throw timeoutErr;
    }
    console.error(`[apiRequest] Falló la petición a ${endpoint}:`, error.message);
    throw error;
  }
}

/**
 * Variante de apiRequest para subir archivos con FormData.
 * No fija Content-Type: el navegador agrega el boundary de multipart.
 * @param {string} endpoint - Ruta del endpoint (ej. '/cv/parse-import')
 * @param {FormData} formData
 * @returns {Promise<object>} - Respuesta JSON deserializada
 */
export async function apiUpload(endpoint, formData, timeoutMs = 60000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;

    const headers = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${BACKEND_URL}${endpoint}`, {
      method: 'POST',
      headers,
      body: formData,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (response.status === 401) {
      await supabase.auth.signOut();
      throw new Error('Tu sesión expiró. Vuelve a iniciar sesión.');
    }

    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      throw new Error(`Respuesta no esperada del servidor (${response.status})`);
    }

    const data = await response.json();

    if (!response.ok) {
      const err = new Error(data.error || data.message || 'Error en la petición de red.');
      err.code = data.code;
      throw err;
    }

    return data;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      const timeoutErr = new Error('La generación tardó demasiado. Inténtalo nuevamente.');
      timeoutErr.code = 'TIMEOUT';
      throw timeoutErr;
    }
    console.error(`[apiUpload] Falló la petición a ${endpoint}:`, error.message);
    throw error;
  }
}
