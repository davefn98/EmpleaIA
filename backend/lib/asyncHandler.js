/**
 * asyncHandler.js — Envuelve un handler async de Express y reenvía cualquier
 * error rechazado al middleware de errores central (definido en server.js),
 * evitando repetir try/catch en cada controlador.
 *
 * Uso:
 *   router.post('/x', requireAuth, asyncHandler(async (req, res) => {
 *     const data = await service.hacerAlgo(req.body);
 *     return ok(res, { data });
 *   }));
 */
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);
