/**
 * rateLimiters.js — Limitadores de tasa para proteger los endpoints costosos.
 *
 * Los endpoints que llaman a modelos de IA (generación de CV, carta, entrevista,
 * transcripción) tienen coste por uso. Sin límite, un cliente podría dispararlos
 * en bucle y generar gasto o degradar el servicio. Estos limitadores acotan el
 * número de solicitudes por ventana de tiempo.
 */

import rateLimit from 'express-rate-limit';

// Limitador para endpoints de IA (costosos).
// Clave por usuario autenticado si está disponible; si no, por IP.
export const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 40,                  // 40 solicitudes por ventana y por clave
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id || req.ip,
  message: {
    error: 'Has hecho demasiadas solicitudes en poco tiempo. Espera unos minutos e inténtalo de nuevo.'
  }
});
