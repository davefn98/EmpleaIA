# Capa de servicios

Lógica de negocio de la aplicación. Un servicio por dominio: `letterService.js`,
`cvService.js`, `profileService.js`, `interviewService.js`.

Responsabilidades:
- Orquestar la lógica (validaciones de negocio, llamadas a la IA vía
  `AIProviderService`, fallbacks honestos, presupuesto de tokens, etc.).
- Llamar a los **repositorios** para leer/escribir datos (no habla con Supabase
  directamente).
- NO conoce `req`/`res` ni códigos HTTP: recibe datos, devuelve datos o lanza
  errores. Eso lo hace testeable en aislamiento.

Los controladores (rutas) llaman a estos servicios; los servicios llaman a los
repositorios.
