/**
 * account.js — Gestión de datos personales del usuario (HU10, Ley 29733).
 *
 * - GET  /api/account/export/:userId : exporta TODOS los datos del usuario en JSON.
 * - DELETE /api/account/:userId/close : cierra la cuenta tras verificar su contraseña.
 *
 * requireAuth comprueba la titularidad. La exportación usa RLS y solo incluye
 * la versión enmascarada de las claves. El cierre usa Supabase Auth Admin.
 */

import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { createClient } from '@supabase/supabase-js';
import { requireAuth } from '../lib/authMiddleware.js';
import { supabaseAdmin } from '../lib/supabaseClient.js';

const router = Router();
const accountCloseLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  keyGenerator: (req) => req.user.id,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Hiciste varios intentos. Espera unos minutos y vuelve a intentarlo.' },
});

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

router.delete('/account/:userId/close', requireAuth, accountCloseLimiter, async (req, res) => {
  const { id: userId, email } = req.user;
  const { password } = req.body ?? {};

  if (typeof password !== 'string' || !password || password.length > 1024) {
    return res.status(400).json({ error: 'Escribe tu contraseña actual.' });
  }
  if (!supabaseAdmin || !email) {
    return res.status(503).json({ error: 'El cierre de cuenta no está disponible en este momento.' });
  }

  // Esta sesión temporal verifica la contraseña sin modificar la sesión de la aplicación.
  const verification = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  let verifiedSession = false;
  let closed = false;
  try {
    const { data, error: verificationError } = await verification.auth.signInWithPassword({ email, password });
    verifiedSession = Boolean(data?.session);
    if (verificationError?.code === 'invalid_credentials' || (!verificationError && data?.user?.id !== userId)) {
      return res.status(403).json({ error: 'La contraseña no es correcta. Vuelve a intentarlo.' });
    }
    if (verificationError || !verifiedSession) {
      const limited = verificationError?.status === 429;
      return res.status(limited ? 429 : 503).json({
        error: 'No pudimos verificar tu contraseña. Espera unos minutos y vuelve a intentarlo.',
      });
    }

    // Las FK ON DELETE CASCADE eliminan los datos vinculados en la misma operación.
    // Evitamos borrar el perfil primero para que un fallo de Auth no deje un cierre parcial.
    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId, false);
    if (error && error.code !== 'user_not_found') throw error;

    closed = true;
    return res.json({ success: true });
  } catch (err) {
    console.error('[/account close] Error:', err.code || err.status || err.name);
    return res.status(502).json({ error: 'No pudimos confirmar la eliminación de tu cuenta. Vuelve a intentarlo.' });
  } finally {
    if (verifiedSession && !closed) {
      await verification.auth.signOut({ scope: 'local' }).catch(() => {});
    }
  }
});

export default router;
