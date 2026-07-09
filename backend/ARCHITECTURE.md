# Arquitectura del backend (objetivo del refactor SRP)

Este documento define la estructura por capas hacia la que se está migrando el
backend, siguiendo el principio de responsabilidad única (SRP).

## Capas

```
Request → Ruta (controlador) → Servicio → Repositorio → Supabase
                    │              │
                    │              └── AIProviderService (IA / BYOK)
                    └── Validador (zod)
```

- **Rutas / controladores** (`routes/`): finos. Solo validan la entrada
  (validador), llaman a un servicio y responden con `apiResponse`. Sin SQL ni
  lógica de negocio. Se envuelven con `asyncHandler` para el manejo de errores.
- **Servicios** (`services/`): lógica de negocio. No conocen `req`/`res`.
  Orquestan IA (vía `AIProviderService`), fallbacks honestos y reglas de negocio.
- **Repositorios** (`repositories/`): todo el acceso a Supabase. Reciben el
  cliente autenticado (`req.db`) para respetar RLS.
- **Validadores** (`validators/`): esquemas zod por endpoint.
- **Prompts** (`lib/prompts.js`): todos los system prompts de IA, centralizados.

## Convenciones

- **Errores**: los controladores usan `asyncHandler`; el error se propaga al
  middleware central de `server.js`. Nunca se devuelve `error.message` crudo en
  respuestas 500 (mensaje genérico + log en servidor).
- **Respuestas**: forma estándar `{ success, ... }` vía `lib/apiResponse.js`
  (`ok`, `created`, `fail`).
- **IA**: siempre por `generateWithFallback` / `generateWithFallbackDetailed`
  (BYOK con fallback al servidor). Nunca `openai` directo salvo Whisper.
- **Integridad**: los fallbacks usan SOLO datos reales del usuario. Prohibido
  inventar nombres, empresas, logros o educación.

## Estado de la migración

- [x] Prompts centralizados en `lib/prompts.js`.
- [x] Capa de IA aislada (`AIProviderService`, `aiProviders/`).
- [x] `asyncHandler` y `apiResponse` disponibles.
- [x] Carpetas `services/`, `repositories/`, `validators/` creadas.
- [x] Módulo `letter` migrado (piloto).
- [x] Módulo `cv` migrado.
- [ ] Módulo `profile` migrado.
- [ ] Módulo `interview` migrado.

## Orden de migración recomendado

`letter` (piloto) → `cv` → `profile` → `interview` (el más complejo, al final),
un módulo a la vez, con tests de caracterización antes de tocar cada uno y
validando que `/api/health` sigue respondiendo tras cada cambio.
