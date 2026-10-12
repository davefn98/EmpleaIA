/**
 * account.js — Gestión de datos personales del usuario (HU10, Ley 29733).
 *
 * - GET  /api/account/export/:userId : exporta TODOS los datos del usuario en JSON.
 * - DELETE /api/account/:userId      : elimina todos los datos del usuario.
 *
 * Seguridad: requireAuth en todo; el cliente va con el token del usuario, así
 * que RLS garantiza que solo accede/borra sus propios datos. La API key cifrada
 * NUNCA se incluye en la exportación (solo la versión enmascarada).
 */

import { Router } from 'express';
import { requireAuth } from '../lib/authMiddleware.js';

const router = Router();

// GET /api/account/export/:userId — descarga JSON con todos los datos del usuario
router.get('/account/export/:userId', requireAuth, async (req, res) => {
  const db = req.db;
  const userId = req.user.id;

  try {
    const [profile, academic, work, cvs, letters, interviews, credentials, preferences] = await Promise.all([
      db.from('profiles').select('*').eq('id', userId).single(),
      db.from('academic_background').select('*').eq('profile_id', userId),
      db.from('work_experience').select('*').eq('profile_id', userId),
      db.from('generated_cvs').select('*').eq('profile_id', userId),
      db.from('cover_letters').select('*').eq('profile_id', userId),
      db.from('interviews').select('*, interview_messages(*)').eq('profile_id', userId),
      db.from('ai_provider_credentials')
        .select('provider, masked_api_key, default_model, generation_mode, is_active, created_at')
        .eq('user_id', userId),
      db.from('ai_model_preferences').select('provider, model, use_case').eq('user_id', userId),
    ]);

    const data = {
      exported_at:          new Date().toISOString(),
      user_id:              userId,
      profile:              profile.data || null,
      academic_background:  academic.data || [],
      work_experience:      work.data || [],
      generated_cvs:        cvs.data || [],
      cover_letters:        letters.data || [],
      interviews:           interviews.data || [],
      ai_credentials:       credentials.data || [], // sin la key cifrada, solo enmascarada
      ai_model_preferences: preferences.data || [],
    };

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="empleaia_mis_datos.json"`);
    return res.send(JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('[/account/export] Error:', err.message);
    return res.status(500).json({ error: 'No se pudieron exportar tus datos.' });
  }
});

// DELETE /api/account/:userId — elimina todos los datos del usuario
// El borrado del perfil cascadea a educación, experiencia, CVs, cartas,
// entrevistas y mensajes (FK on delete cascade). Las credenciales/preferencias
// de IA cuelgan de auth.users, así que se borran explícitamente.
router.delete('/account/:userId', requireAuth, async (req, res) => {
  const db = req.db;
  const userId = req.user.id;

  try {
    await db.from('ai_provider_credentials').delete().eq('user_id', userId);
    await db.from('ai_model_preferences').delete().eq('user_id', userId);

    const { error } = await db.from('profiles').delete().eq('id', userId);
    if (error) {
      console.error('[/account delete] Error transaccional:', error.message);
      return res.status(400).json({ error: 'No se pudieron eliminar tus datos.' });
    }

    return res.json({
      success: true,
      message: 'Tus datos personales fueron eliminados de EmpleaIA.'
    });
  } catch (err) {
    console.error('[/account delete] Error:', err.message);
    return res.status(500).json({ error: 'No se pudieron eliminar tus datos.' });
  }
});

export default router;
