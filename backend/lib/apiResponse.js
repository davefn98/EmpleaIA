/**
 * apiResponse.js — Helpers para respuestas HTTP con forma estándar.
 *
 * Toda la API comparte la forma { success: boolean, ... }. Estos helpers evitan
 * repetir el shape en cada controlador y unifican los códigos de estado.
 */

// Respuesta exitosa. `data` se fusiona en el cuerpo junto a success:true.
export const ok = (res, data = {}, status = 200) =>
  res.status(status).json({ success: true, ...data });

// Recurso creado (201).
export const created = (res, data = {}) => ok(res, data, 201);

// Respuesta de error. Nunca se filtra el detalle interno: se pasa un mensaje
// seguro para el cliente; el detalle real se loguea aparte en el servidor.
export const fail = (res, message, status = 400, code) =>
  res.status(status).json({ success: false, ...(code ? { code } : {}), error: message });
