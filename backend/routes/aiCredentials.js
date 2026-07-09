/**
 * aiCredentials.js — Endpoints REST para gestión de credenciales de IA del usuario.
 *
 * Seguridad:
 * - requireAuth en todos los endpoints
 * - encrypted_api_key NUNCA se devuelve al frontend
 * - RLS de Supabase garantiza que el usuario solo accede a sus propias filas
 * - Las keys se descifran solo en backend, en memoria, para la verificación
 * - No se logea la key completa en ningún punto
 */

import { Router } from 'express';
import { requireAuth } from '../lib/authMiddleware.js';
import { encryptApiKey, maskApiKey } from '../lib/encryption.js';
import * as AIProviderService from '../lib/AIProviderService.js';
import { isValidProvider, listProviders } from '../lib/aiProviders/providerRegistry.js';

const router = Router();

// ─── Columnas seguras para SELECT (nunca exponer encrypted_api_key) ──────────
const SAFE_CREDENTIAL_COLUMNS = [
  'id',
  'provider',
  'masked_api_key',
  'default_model',
  'generation_mode',
  'is_active',
  'last_verified_at',
  'created_at',
  'updated_at'
].join(', ');

// Helper para clasificar errores de base de datos de manera uniforme
function handleDbError(error, res, action = 'operación') {
  console.error(`[aiCredentials] Error DB durante ${action}:`, error.message);
  
  // PGRST205: Tabla no encontrada en el schema cache (Postgrest)
  // 42P01: Tabla no encontrada (Postgres nativo)
  if (
    error.code === 'PGRST205' || 
    error.code === '42P01' || 
    error.message?.includes('ai_provider_credentials') || 
    error.message?.includes('ai_model_preferences') ||
    error.message?.includes('does not exist')
  ) {
    return res.status(500).json({
      success: false,
      code: 'BYOK_MIGRATION_MISSING',
      message: 'La migración migration_v5.sql no ha sido ejecutada en Supabase.'
    });
  }

  // Caso C: error de RLS o permisos
  if (error.code === '42501' || error.message?.includes('permission') || error.message?.includes('policy')) {
    return res.status(403).json({
      success: false,
      code: 'BYOK_PERMISSION_ERROR',
      message: 'No tienes permisos para leer las credenciales de IA.'
    });
  }

  return res.status(500).json({
    success: false,
    code: 'UNKNOWN_ERROR',
    message: `Error en la base de datos durante ${action}.`
  });
}
// GET /api/ai-credentials
// Lista las credenciales y preferencias de IA del usuario
// ─────────────────────────────────────────────────────────────────────────────
router.get('/', requireAuth, async (req, res) => {
  try {
    // 1. Obtener credenciales del usuario
    const { data: creds, error: credsError } = await req.db
      .from('ai_provider_credentials')
      .select(SAFE_CREDENTIAL_COLUMNS)
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });

    if (credsError) {
      return handleDbError(credsError, res, 'obtener credenciales');
    }

    // 2. Obtener preferencias de modelo por módulo
    const { data: prefs, error: prefsError } = await req.db
      .from('ai_model_preferences')
      .select('provider, model, use_case')
      .eq('user_id', req.user.id);

    if (prefsError) {
      return handleDbError(prefsError, res, 'obtener preferencias');
    }

    const hasCreds = creds && creds.length > 0;

    return res.json({ 
      success: true, 
      credentials: creds || [],
      preferences: prefs || [],
      message: hasCreds ? undefined : 'No hay credenciales configuradas'
    });
  } catch (err) {
    console.error('[GET /ai-credentials] Error crítico:', err.message);
    return res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ai-providers
// Lista los proveedores disponibles (para el selector en el frontend)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/providers', requireAuth, async (req, res) => {
  return res.json({ success: true, providers: listProviders() });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/ai-credentials/verify
// Verifica si una API key es válida ANTES de guardarla.
// La key NO se guarda — solo se prueba.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/verify', requireAuth, async (req, res) => {
  const { provider, apiKey } = req.body;

  if (!provider || !apiKey) {
    return res.status(400).json({ error: 'Faltan campos: provider y apiKey son requeridos.' });
  }

  if (!isValidProvider(provider)) {
    return res.status(400).json({ error: `Proveedor '${provider}' no reconocido.` });
  }

  // Log seguro — solo longitud, nunca la key completa
  console.log(`[POST /ai-credentials/verify] Verificando key para proveedor '${provider}'. Longitud: ${apiKey.length}`);

  try {
    const result = await AIProviderService.verifyConnection({ providerName: provider, apiKey });
    return res.json({ success: result.ok, ...result });
  } catch (err) {
    console.error('[POST /ai-credentials/verify] Error:', err.message);
    return res.status(500).json({ success: false, error: 'Error interno del servidor.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/ai-credentials
// Guarda una nueva credencial de IA.
// La API key se cifra con AES-256-GCM antes de insertar en la DB.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/', requireAuth, async (req, res) => {
  const { provider, apiKey, defaultModel, generationMode } = req.body;

  if (!provider || !apiKey) {
    return res.status(400).json({ error: 'Faltan campos: provider y apiKey son requeridos.' });
  }

  if (!isValidProvider(provider)) {
    return res.status(400).json({ error: `Proveedor '${provider}' no reconocido.` });
  }

  if (apiKey.length < 20) {
    return res.status(400).json({ error: 'La API key proporcionada parece demasiado corta.' });
  }

  try {
    // 1. Cifrar la API key
    const encryptedKey = encryptApiKey(apiKey);
    const maskedKey    = maskApiKey(apiKey);

    // 2. Verificar la key antes de guardarla (UX más clara)
    const verification = await AIProviderService.verifyConnection({ providerName: provider, apiKey });

    // 3. ¿El usuario ya tiene otro proveedor activo? Guardar uno nuevo no debe
    //    robarle el estado "activo"; para eso está PUT /:provider/activate.
    const { data: otherActive } = await req.db
      .from('ai_provider_credentials')
      .select('id')
      .eq('user_id', req.user.id)
      .eq('is_active', true)
      .neq('provider', provider)
      .limit(1)
      .maybeSingle();

    // 4. Upsert en la tabla (un registro por usuario por proveedor)
    const { data, error } = await req.db
      .from('ai_provider_credentials')
      .upsert({
        user_id:         req.user.id,
        provider,
        encrypted_api_key: encryptedKey,
        masked_api_key:    maskedKey,
        default_model:     defaultModel || null,
        generation_mode:   generationMode || 'balanced',
        is_active:         !otherActive,
        last_verified_at:  verification.ok ? new Date().toISOString() : null,
        updated_at:        new Date().toISOString()
      }, { onConflict: 'user_id, provider' })
      .select(SAFE_CREDENTIAL_COLUMNS)
      .single();

    if (error) {
      return handleDbError(error, res, 'guardar la credencial');
    }

    return res.json({
      success: true,
      credential: data,
      verified: verification.ok,
      verificationMessage: verification.ok
        ? `Conexión verificada con ${provider}.`
        : `La key se guardó pero la verificación falló: ${verification.error}`
    });
  } catch (err) {
    console.error('[POST /ai-credentials] Error:', err.message);
    return res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/ai-credentials/:provider
// Actualiza la API key o configuración de un proveedor existente.
// ─────────────────────────────────────────────────────────────────────────────
router.put('/:provider', requireAuth, async (req, res) => {
  const { provider } = req.params;
  const { apiKey, defaultModel, generationMode, isActive } = req.body;

  if (!isValidProvider(provider)) {
    return res.status(400).json({ error: `Proveedor '${provider}' no reconocido.` });
  }

  try {
    const updatePayload = { updated_at: new Date().toISOString() };

    if (apiKey) {
      updatePayload.encrypted_api_key = encryptApiKey(apiKey);
      updatePayload.masked_api_key    = maskApiKey(apiKey);
      // Re-verificar si se cambió la key
      const verification = await AIProviderService.verifyConnection({ providerName: provider, apiKey });
      if (verification.ok) {
        updatePayload.last_verified_at = new Date().toISOString();
      }
    }

    if (defaultModel !== undefined) updatePayload.default_model   = defaultModel;
    if (generationMode !== undefined) updatePayload.generation_mode = generationMode;
    if (isActive !== undefined) updatePayload.is_active = isActive;

    const { data, error } = await req.db
      .from('ai_provider_credentials')
      .update(updatePayload)
      .eq('user_id', req.user.id)
      .eq('provider', provider)
      .select(SAFE_CREDENTIAL_COLUMNS)
      .single();

    if (error) {
      return handleDbError(error, res, 'actualizar la credencial');
    }

    return res.json({ success: true, credential: data });
  } catch (err) {
    console.error('[PUT /ai-credentials] Error:', err.message);
    return res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/ai-credentials/:provider/activate
// Marca el proveedor como el ACTIVO del usuario (y desactiva el resto).
// El proveedor activo es el que usan todos los módulos de IA vía
// generateWithFallback.
// ─────────────────────────────────────────────────────────────────────────────
router.put('/:provider/activate', requireAuth, async (req, res) => {
  const { provider } = req.params;

  if (!isValidProvider(provider)) {
    return res.status(400).json({ error: `Proveedor '${provider}' no reconocido.` });
  }

  try {
    // La credencial debe existir antes de poder activarse
    const { data: cred, error: findErr } = await req.db
      .from('ai_provider_credentials')
      .select('id')
      .eq('user_id', req.user.id)
      .eq('provider', provider)
      .maybeSingle();

    if (findErr) {
      return handleDbError(findErr, res, 'activar el proveedor');
    }
    if (!cred) {
      return res.status(404).json({ error: `No hay credenciales guardadas para ${provider}. Guarda una API Key primero.` });
    }

    // Desactivar el resto de proveedores del usuario
    const { error: deactErr } = await req.db
      .from('ai_provider_credentials')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('user_id', req.user.id)
      .neq('provider', provider);

    if (deactErr) {
      return handleDbError(deactErr, res, 'activar el proveedor');
    }

    const { data, error } = await req.db
      .from('ai_provider_credentials')
      .update({ is_active: true, updated_at: new Date().toISOString() })
      .eq('user_id', req.user.id)
      .eq('provider', provider)
      .select(SAFE_CREDENTIAL_COLUMNS)
      .single();

    if (error) {
      return handleDbError(error, res, 'activar el proveedor');
    }

    console.log(`[PUT /ai-credentials/${provider}/activate] Proveedor activo del usuario ${req.user.id}: ${provider}`);
    return res.json({ success: true, credential: data });
  } catch (err) {
    console.error('[PUT /ai-credentials/:provider/activate] Error:', err.message);
    return res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/ai-credentials/:provider
// Elimina la credencial del proveedor para el usuario actual.
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/:provider', requireAuth, async (req, res) => {
  const { provider } = req.params;

  try {
    const { error } = await req.db
      .from('ai_provider_credentials')
      .delete()
      .eq('user_id', req.user.id)
      .eq('provider', provider);

    if (error) {
      return handleDbError(error, res, 'eliminar la credencial');
    }

    return res.json({ success: true, message: `Credencial de ${provider} eliminada.` });
  } catch (err) {
    console.error('[DELETE /ai-credentials] Error:', err.message);
    return res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ai-model-preferences
// Obtiene las preferencias de modelo por módulo del usuario.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/model-preferences', requireAuth, async (req, res) => {
  try {
    const { data, error } = await req.db
      .from('ai_model_preferences')
      .select('id, provider, model, use_case, created_at')
      .eq('user_id', req.user.id);

    if (error) {
      return handleDbError(error, res, 'obtener las preferencias de modelo');
    }

    return res.json({ success: true, preferences: data || [] });
  } catch (err) {
    console.error('[GET /ai-model-preferences] Error:', err.message);
    return res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/ai-model-preferences
// Guarda o actualiza preferencias de modelo por módulo.
// Body: { preferences: [{ useCase, provider, model }] }
// ─────────────────────────────────────────────────────────────────────────────
router.put('/model-preferences', requireAuth, async (req, res) => {
  const { preferences } = req.body;

  if (!Array.isArray(preferences) || preferences.length === 0) {
    return res.status(400).json({ error: 'Se esperaba un array de preferencias.' });
  }

  const VALID_USE_CASES = ['cv_generation', 'cover_letter', 'interview_questions', 'interview_feedback'];

  try {
    const upsertRows = preferences
      .filter(p => VALID_USE_CASES.includes(p.useCase))
      .map(p => ({
        user_id:  req.user.id,
        use_case: p.useCase,
        provider: p.provider || 'openai',
        model:    p.model || 'gpt-4o-mini',
      }));

    if (upsertRows.length === 0) {
      return res.status(400).json({ error: 'Ninguna preferencia válida recibida.' });
    }

    const { data, error } = await req.db
      .from('ai_model_preferences')
      .upsert(upsertRows, { onConflict: 'user_id, use_case' })
      .select('id, provider, model, use_case, created_at');

    if (error) {
      return handleDbError(error, res, 'guardar las preferencias de modelo');
    }

    return res.json({ success: true, preferences: data });
  } catch (err) {
    console.error('[PUT /ai-model-preferences] Error:', err.message);
    return res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

export default router;
