/**
 * AIProviderService.js — Orquestador central de proveedores de IA.
 *
 * Es el ÚNICO punto de entrada para los controladores y rutas que
 * necesiten generar texto con IA. Nunca importan proveedores directamente.
 *
 * Responsabilidades:
 * - Delegar al proveedor correcto mediante providerRegistry
 * - Resolver las credenciales del usuario desde la DB (generateWithFallback)
 * - Hacer fallback al OpenAI del servidor si el usuario no tiene creds
 * - Descifrar la API key solo en memoria, para la llamada al proveedor
 * - No loguear keys completas
 *
 * Patrón: Service Layer + Strategy (via registry)
 */

import './loadEnv.js';
import { getProvider, isValidProvider } from './aiProviders/providerRegistry.js';
import { decryptApiKey }                from './encryption.js';

// API key del servidor (fallback cuando el usuario no tiene cuenta propia)
const SERVER_OPENAI_KEY = process.env.OPENAI_API_KEY || '';
const SERVER_OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

/**
 * Genera texto usando el proveedor y API key especificados.
 * Usado directamente cuando ya se conoce la key (ruta aiCredentials).
 *
 * @param {object} params
 * @param {string} params.providerName  - 'openai' | 'anthropic' | 'gemini'
 * @param {string} params.apiKey        - API key en claro (NUNCA almacenar, solo usar)
 * @param {string} params.model         - ID del modelo
 * @param {Array}  params.messages      - [{role, content}]
 * @param {number} [params.temperature] - 0.0 - 1.0
 * @param {number} [params.maxTokens]   - Límite de tokens de salida
 * @param {boolean} [params.jsonMode]   - Si true, solicita salida JSON
 * @param {object} [params.responseSchema] - JSON Schema para proveedores compatibles
 * @returns {Promise<string>}
 */
export async function generateText({
  providerName,
  apiKey,
  model,
  messages,
  temperature = 0.7,
  maxTokens,
  jsonMode = false,
  responseSchema
}) {
  const provider = getProvider(providerName);
  if (!provider) {
    throw new Error(`[AIProviderService] Proveedor desconocido: '${providerName}'`);
  }

  console.log(`[AIProviderService] generateText → proveedor: ${providerName}, modelo: ${model}`);

  const result = await provider.generateText({ apiKey, model, messages, temperature, maxTokens, jsonMode, responseSchema });
  // Compatibilidad: si un proveedor aún devuelve un string, lo envolvemos en el objeto estándar.
  return typeof result === 'string' ? { content: result, usage: undefined } : result;
}

/**
 * Verifica si una API key es válida para el proveedor indicado.
 *
 * @param {object} params
 * @param {string} params.providerName
 * @param {string} params.apiKey - En claro (viene del request, se descarta tras la verificación)
 * @returns {Promise<{ ok: boolean, error?: string, models?: string[] }>}
 */
export async function verifyConnection({ providerName, apiKey }) {
  if (!isValidProvider(providerName)) {
    return { ok: false, error: `Proveedor '${providerName}' no reconocido.` };
  }

  const provider = getProvider(providerName);
  console.log(`[AIProviderService] verifyConnection → proveedor: ${providerName}`);
  return provider.verifyConnection({ apiKey });
}

/**
 * Lista los modelos disponibles para el proveedor y key dados.
 *
 * @param {object} params
 * @param {string} params.providerName
 * @param {string} params.apiKey
 * @returns {Promise<string[]>}
 */
export async function listModels({ providerName, apiKey }) {
  const provider = getProvider(providerName);
  if (!provider) return [];
  return provider.listModels({ apiKey });
}

/**
 * Genera texto con resolución automática de credenciales.
 *
 * Flujo:
 * 1. Busca credenciales activas del usuario en la DB para el proveedor preferido
 * 2. Si existe → descifra la key y llama al proveedor del usuario
 * 3. Si no existe → usa OpenAI del servidor (comportamiento actual)
 *
 * Este método es el que los controladores de CV, carta y entrevista
 * usarán en Fase 2, cuando se integren.
 *
 * @param {object} params
 * @param {string} params.useCase      - 'cv_generation' | 'cover_letter' | 'interview_questions' | 'interview_feedback'
 * @param {Array}  params.messages     - [{role, content}]
 * @param {object} params.db           - Cliente Supabase autenticado (req.db)
 * @param {string} params.userId       - ID del usuario autenticado
 * @param {boolean} [params.jsonMode]  - Si true, solicita salida JSON
 * @param {number}  [params.maxTokens] - Límite de tokens
 * @param {object}  [params.responseSchema] - JSON Schema para Structured Outputs
 * @returns {Promise<string>} El texto generado (sin metadatos de uso).
 */
export async function generateWithFallback(params) {
  const { content } = await generateWithFallbackDetailed(params);
  return content;
}

/**
 * Igual que generateWithFallback pero devuelve además el uso de tokens.
 * Útil para controladores que llevan un presupuesto de tokens (ej. entrevistas).
 *
 * @param {object} params - Mismos parámetros que generateWithFallback.
 * @returns {Promise<{ content: string, usage: object|undefined }>}
 */
export async function generateWithFallbackDetailed({
  useCase,
  messages,
  db,
  userId,
  jsonMode = false,
  maxTokens,
  responseSchema
}) {
  let pref = null;
  let userCred = null;
  let userApiKey = null;

  // 1. Resolver preferencia de use case + credencial ACTIVA del usuario
  //    (en paralelo: son independientes y esto era latencia fija por llamada).
  const credStart = Date.now();
  try {
    const [prefRes, credRes] = await Promise.all([
      db.from('ai_model_preferences')
        .select('provider, model')
        .eq('user_id', userId)
        .eq('use_case', useCase)
        .maybeSingle(),
      db.from('ai_provider_credentials')
        .select('provider, encrypted_api_key, default_model, generation_mode')
        .eq('user_id', userId)
        .eq('is_active', true)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle()
    ]);
    pref = prefRes.data || null;
    userCred = credRes.data || null;
  } catch (dbErr) {
    // Error de DB no debe romper la generación — caer en fallback del servidor
    console.warn('[AIProviderService] generateWithFallback → error al consultar creds del usuario:', dbErr.message);
  }
  const credMs = Date.now() - credStart;

  if (userCred?.encrypted_api_key) {
    try {
      userApiKey = decryptApiKey(userCred.encrypted_api_key);
    } catch (decErr) {
      // Key indescifrable (ENCRYPTION_KEY cambió, etc.) → fallback del servidor
      console.warn('[AIProviderService] No se pudo descifrar la key del usuario:', decErr.message);
      userApiKey = null;
    }
  }

  if (userApiKey) {
    const providerName = userCred.provider;
    // El modelo de la preferencia solo aplica si es del mismo proveedor activo.
    const model = (pref?.provider === providerName && pref?.model) || userCred.default_model || undefined;
    const temperature = modeToTemperature(userCred.generation_mode);

    console.log(`[timing][ai] credenciales=${credMs}ms proveedor=${providerName} modelo=${model || 'default'} useCase=${useCase}`);

    const callStart = Date.now();
    try {
      const result = await generateText({
        providerName,
        apiKey: userApiKey,
        model,
        messages,
        temperature,
        maxTokens,
        jsonMode,
        responseSchema,
      });
      console.log(`[timing][ai] llamada=${Date.now() - callStart}ms proveedor=${providerName}`);
      return {...result,provider:providerName,model:model || null};
    } catch (providerErr) {
      // Fallback honesto: el usuario eligió este proveedor; no cambiamos de
      // proveedor en silencio. Se devuelve un error controlado con el nombre.
      console.error(`[AIProviderService] Falló el proveedor activo '${providerName}' tras ${Date.now() - callStart}ms:`, providerErr.message);
      const err = new Error(`Tu proveedor de IA activo (${providerName}) devolvió un error: ${providerErr.message}`);
      err.provider = providerName;
      err.status = providerErr.status;
      throw err;
    }
  }

  // 2. Fallback: usar OpenAI del servidor (sin credenciales propias del usuario)
  console.log(`[timing][ai] credenciales=${credMs}ms proveedor=openai(servidor) modelo=${SERVER_OPENAI_MODEL} useCase=${useCase}`);
  const callStart = Date.now();
  const result = await generateText({
    providerName: 'openai',
    apiKey: SERVER_OPENAI_KEY,
    model: SERVER_OPENAI_MODEL,
    messages,
    temperature: 0.7,
    maxTokens,
    jsonMode,
    responseSchema,
  });
  console.log(`[timing][ai] llamada=${Date.now() - callStart}ms proveedor=openai(servidor)`);
  return {...result,provider:'openai',model:SERVER_OPENAI_MODEL};
}

/**
 * Convierte el modo de generación a temperatura.
 * @param {'fast'|'balanced'|'detailed'|null} mode
 * @returns {number}
 */
function modeToTemperature(mode) {
  switch (mode) {
    case 'fast':     return 0.3;
    case 'balanced': return 0.7;
    case 'detailed': return 1.0;
    default:         return 0.7;
  }
}
