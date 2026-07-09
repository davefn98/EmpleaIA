# Capa de repositorios (acceso a datos)

Encapsula TODAS las consultas a Supabase. Un repositorio por tabla/dominio:
`profileRepository.js`, `interviewRepository.js`, `letterRepository.js`, etc.

Responsabilidades:
- Contener las llamadas a `supabase` / `req.db` (el cliente autenticado con el
  token del usuario, para respetar RLS).
- Exponer funciones con intención de negocio: `getProfile(db, userId)`,
  `saveLetter(db, payload)`, `deleteInterview(db, id)`…
- NO contiene lógica de negocio ni de HTTP.

Si mañana se cambia de base de datos o de cliente, solo se toca esta capa.
