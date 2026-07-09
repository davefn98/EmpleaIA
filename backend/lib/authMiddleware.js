import { createClient } from '@supabase/supabase-js';

export const requireAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No autorizado. No se proporcionó un token de sesión válido.' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const supabaseClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    );

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();

    if (authError || !user) {
      console.warn('[MIDDLEWARE AUTH] Error de autenticación Supabase:', authError?.message || 'Usuario no encontrado');
      return res.status(401).json({
        success: false,
        code: 'AUTH_REQUIRED',
        message: 'Debes iniciar sesión para acceder a las credenciales de IA.'
      });
    }

    // Verificar si hay un parámetro userId en la ruta y validar que coincida con el usuario autenticado
    const routeUserId = req.params.userId || req.body.profileId || req.body.userId || req.body.user_id;
    if (routeUserId && routeUserId !== user.id) {
      console.warn(`[MIDDLEWARE AUTH] Conflicto de ID de usuario. Autenticado: ${user.id}, Solicitado: ${routeUserId}`);
      return res.status(403).json({ error: 'No tienes permisos para acceder o modificar los datos de otro usuario.' });
    }

    // Guardar el usuario y el cliente autenticado en el objeto request
    req.user = user;
    req.db = supabaseClient;
    next();
  } catch (error) {
    console.error('[MIDDLEWARE AUTH] Error crítico:', error);
    return res.status(500).json({ error: 'Error interno de autenticación en el servidor.' });
  }
};
