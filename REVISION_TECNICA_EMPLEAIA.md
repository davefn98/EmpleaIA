# Revisión técnica de EmpleaIA

Fecha de revisión: 2026-07-12

## Resumen de validación

- Backend: 26 pruebas ejecutadas y aprobadas.
- Frontend: compilación de producción aprobada con advertencias por tamaño de bundles.
- Frontend lint: línea base de 120 errores y 9 advertencias en 40 archivos. El objetivo de esta revisión no incluye corregirlos.
- Alcance: análisis estático y comandos locales. No se ejecutaron flujos end-to-end contra una instancia real de Supabase o proveedores de IA.

## Hallazgos importantes

### BE-01 — Actualización masiva de campos del perfil

- Tipo: riesgo de seguridad e integridad.
- Ubicación: `backend/routes/profile.js`, handler `PUT /profile/:userId`.
- Evidencia: el objeto de actualización incorpora todo `req.body` y solo elimina `id`; no existe una lista permitida ni validación Zod en esa ruta.
- Impacto: un cliente puede intentar modificar columnas que la interfaz no expone. RLS limita al propietario, pero no determina qué campos del propio registro son editables.
- Recomendación: definir un esquema Zod estricto, construir el payload desde campos permitidos y rechazar propiedades desconocidas.

### BE-02 — Detalles internos de Supabase expuestos al cliente

- Tipo: defecto comprobado por inspección.
- Ubicación: `backend/routes/interview.js`, handlers `GET /interview/pending/:userId` y `GET /metrics/:userId`.
- Evidencia: ambos devuelven `error.message` directamente en respuestas HTTP 400.
- Impacto: los mensajes pueden revelar nombres de tablas, columnas, políticas o detalles operativos.
- Recomendación: registrar el error completo en servidor y devolver un mensaje público estable con código de error.

### BE-03 — Errores ignorados durante el borrado de cuenta

- Tipo: riesgo de integridad y privacidad.
- Ubicación: `backend/routes/account.js`, handler `DELETE /account/:userId`.
- Evidencia: los resultados de los borrados de `ai_provider_credentials` y `ai_model_preferences` no se inspeccionan antes de borrar el perfil y devolver éxito.
- Impacto: la operación podría informar que los datos fueron eliminados aunque queden registros residuales.
- Recomendación: comprobar todos los resultados y ejecutar el proceso mediante una operación transaccional o función SQL atómica.

### FE-01 — Reemplazos destructivos no atómicos

- Tipo: riesgo de pérdida de datos.
- Ubicación: `frontend/src/views/Documents.jsx` y `frontend/src/views/Profile.jsx`.
- Evidencia: educación y experiencia se eliminan primero y se insertan después mediante varias solicitudes independientes.
- Impacto: si una inserción falla después del borrado, la información anterior ya se perdió y el perfil queda incompleto.
- Recomendación: trasladar el reemplazo al backend y ejecutarlo dentro de una transacción; conservar la versión previa si falla cualquier paso.

### FE-02 — Problemas de hooks detectados por ESLint

- Tipo: defectos y riesgos comprobados por análisis estático.
- Ubicación principal: `frontend/src/App.jsx`, `frontend/src/views/Interviews.jsx`, `Dashboard.jsx`, `Documents.jsx`, `SettingsView.jsx` y componentes comunes.
- Evidencia: ESLint reporta actualizaciones síncronas de estado dentro de efectos, dependencias omitidas, funciones accedidas antes de declararse e impureza durante renderizado.
- Impacto: renderizados encadenados, closures con datos antiguos, comportamiento no determinista y regresiones difíciles de reproducir.
- Recomendación: resolver primero reglas de hooks y pureza; después eliminar imports y variables sin uso. Añadir pruebas de componentes y flujos afectados antes de refactorizar.

### FE-03 — Métricas por categoría derivadas sin medición real

- Tipo: defecto de integridad del producto.
- Ubicación: `frontend/src/App.jsx`, vista de métricas.
- Evidencia: comunicación, conocimiento, confianza y resolución de problemas se calculan multiplicando `avgScore` por factores fijos.
- Impacto: la interfaz presenta puntuaciones específicas que no provienen de evaluaciones independientes.
- Recomendación: mostrar únicamente métricas respaldadas por evaluaciones almacenadas o etiquetarlas explícitamente como estimaciones hasta disponer de datos reales.

### FE-04 — Ruta de perfil conduce a documentos

- Tipo: riesgo funcional que requiere confirmación de producto.
- Ubicación: `frontend/src/App.jsx`, resolución y redirección de `currentPath`.
- Evidencia: `/profile` y `/mi-perfil` se traducen y redirigen a `/documents/cv`, mientras `/profile/view` abre el perfil.
- Impacto: enlaces históricos o externos al perfil pueden llevar al módulo equivocado.
- Recomendación: confirmar la ruta canónica; si el destino esperado es el perfil, redirigir a `/profile/view` y cubrir navegación directa, atrás y adelante.

## Hallazgos menores

### BE-04 — Datos personales registrados en consola

- Ubicación: `backend/routes/profile.js`, handler `PUT /profile/:userId`.
- Evidencia: el log incluye `req.body` completo.
- Impacto: datos del perfil pueden terminar en sistemas de logs y copias de diagnóstico.
- Recomendación: registrar solo identificadores, acción y resultado; aplicar redacción estructurada de campos sensibles.

### FE-05 — Código sin uso

- Ubicación: múltiples vistas y componentes del frontend.
- Evidencia: la mayor parte de los errores de lint incluye imports, variables y asignaciones sin uso.
- Impacto: aumenta ruido, tamaño y dificultad de mantenimiento, y puede ocultar rutas incompletas.
- Recomendación: eliminar código muerto en cambios pequeños, verificando cada vista tras la limpieza.

## Deuda arquitectónica y rendimiento

- `backend/routes/interview.js` tiene aproximadamente 1.273 líneas y mezcla HTTP, reglas de sesión, consultas y orquestación de IA. Separar gradualmente en validadores, servicios y repositorios, protegido por tests de caracterización.
- `frontend/src/views/Interviews.jsx` tiene aproximadamente 2.516 líneas y `Documents.jsx` 2.336. Extraer hooks de sesión/medios/datos y componentes por estado del flujo.
- El frontend accede directamente a Supabase desde distintas vistas. Consolidar lógica de negocio y mutaciones en la API para uniformar autorización, validación y transacciones.
- El build genera chunks aproximados de 826 KB y 965 KB, además de una imagen de 1,39 MB. Aplicar imports dinámicos por vista, cargar exportación PDF bajo demanda y optimizar imágenes.

## Cobertura y próximos controles

Las pruebas existentes cubren helpers de respuesta, `asyncHandler`, cifrado, registro de proveedores, prompts y fallback de extracción de CV. Faltan pruebas de:

- autorización y propiedad de recursos;
- validación de rutas y payloads maliciosos;
- RLS con usuarios diferentes;
- inicio, respuesta, finalización y abandono de entrevistas;
- eliminación de cuenta con fallos parciales;
- endpoints de credenciales BYOK;
- navegación, hooks y operaciones destructivas del frontend;
- flujos end-to-end con dependencias externas simuladas.

## Orden recomendado de corrección

1. Evitar exposición de errores, actualización masiva, logs de datos personales y borrados parciales.
2. Hacer atómicos los reemplazos de educación y experiencia.
3. Corregir errores de hooks y establecer lint sin errores como puerta de integración.
4. Sustituir métricas derivadas por datos reales y resolver la ruta canónica del perfil.
5. Añadir cobertura de rutas y refactorizar los archivos de mayor tamaño de forma incremental.

## Estado de correcciones (2026-07-12)

- Corregidos BE-01, BE-02, BE-03, BE-04, FE-01, FE-03 y FE-04.
- Rendimiento: las vistas privadas usan carga diferida; el bundle inicial baj? de ~826 KB a ~465 KB. html2pdf permanece como chunk bajo demanda.
- Pendiente de despliegue: ejecutar `supabase/migration_v9_atomic_profile_account.sql` antes de usar guardado integral o borrado de cuenta.
- Pendiente de refactor dedicado: FE-02/FE-05 y la divisi?n interna de `Interviews.jsx`/`Documents.jsx`. ESLint conserva la l?nea base de 120 errores y 9 advertencias; no se desactivaron reglas para ocultarla.
- Validaci?n: 26 pruebas backend aprobadas y build frontend aprobado.

## Cierre de correcciones (2026-07-12)

- Migraci?n v9 aplicada en Supabase por el propietario del proyecto.
- Frontend sin consultas directas `.from(...)`; todas las vistas consumen API autenticada.
- ESLint: 0 errores, 0 advertencias.
- Backend: 32 pruebas aprobadas. Frontend: 2 pruebas aprobadas.
- Build de producci?n aprobado; html2pdf ya no forma parte del bundle.
- Logo optimizado de 1,39 MB a 324 KB.
- Helpers de entrevistas extra?dos a servicio y datos de usuario centralizados en rutas/API.
- El intento de health-check con proceso local fue bloqueado por el l?mite externo del revisor de aprobaciones; no hubo fallo de aplicaci?n.
