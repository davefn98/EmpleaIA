# Registro de Cambios — EmpleaIA

## [2026-07-07] Corrección del error 500 en POST /api/cv-generate

### Módulos Afectados
- **Generar CV con IA (wizard de /documents/cv)**: El botón "Generar CV con IA" devolvía `500 Internal Server Error` con el mensaje genérico "Ocurrió un error interno no controlado en el servidor".

### Causa Raíz
La tabla `generated_cvs` en Supabase Cloud **no tiene las columnas `document_title`, `status` ni `updated_at`** (sí tiene `cv_style`): la migración `migration_fix_all.sql`, dejada como pendiente en la entrada del 2026-07-01, nunca se ejecutó. El `INSERT` de `cvService.generateCv` fallaba con `PGRST204 — Could not find the 'document_title' column of 'generated_cvs' in the schema cache`; el servicio lanzaba un error 500 tipado que la ruta re-lanzaba al manejador global, el cual respondía con el mensaje genérico. Ni la IA, ni la plantilla `executive`, ni el payload del frontend eran el problema (el contrato `{ profileId, cv_style }` es correcto).

### Archivos Modificados
- `[MOD] [cvService.js](file:///d:/Personal/Proyectos/IA%20Empleabilidad/backend/services/cvService.js)`: Guardado resiliente — si el `INSERT` falla por una columna de metadatos inexistente (`DB_SCHEMA_MISMATCH`), se reintenta sin esa columna (nunca se omiten `profile_id` ni `cv_data`). El CV se genera y guarda aunque la migración esté pendiente, conservando `cv_style` (tema). Cada reintento loguea qué columna falta y qué migración ejecutar. Si aun así falla, lanza un error tipado con mensaje claro.
- `[MOD] [cv.js](file:///d:/Personal/Proyectos/IA%20Empleabilidad/backend/routes/cv.js)`: La ruta `POST /cv-generate` ahora devuelve al cliente el mensaje real de cualquier error de aplicación tipado (incluidos los 500 controlados con `code`), en vez de delegarlos al mensaje genérico del manejador global.
- `[MOD] [server.js](file:///d:/Personal/Proyectos/IA%20Empleabilidad/backend/server.js)`: El manejador global de errores loguea el stack trace con método y URL, y responde con la forma estándar `{ success: false, error }`.

### Validaciones Realizadas
- Reproducido el 500 con el usuario de prueba y el payload exacto del wizard (`template: executive, primaryColor: wine, spacing: compact`) → capturado el `PGRST204` real en logs.
- Tras el fix: `POST /api/cv-generate` responde **200** con `cvId` y `cvData`; los logs muestran los reintentos omitiendo `document_title` y `status`.
- Suite de tests del backend: 26/26 en verde (`npm test`).
- Sin cambios en el frontend: la previsualización y el diseño del CV quedan intactos; `apiRequest` ya propaga el mensaje real del backend.
- Backend del puerto 5000 reiniciado con el código corregido.

### Pendientes
- **Ejecutar [migration_fix_all.sql](file:///d:/Personal/Proyectos/IA%20Empleabilidad/supabase/migration_fix_all.sql) en el SQL Editor de Supabase Cloud** (pendiente desde el 2026-07-01). Mientras no se ejecute, los CVs se guardan sin `document_title`/`status` (el módulo de borradores HU13 los necesita) y `PUT /api/cv/:id` fallará al escribir `updated_at`.

## [2026-07-01] Solución de Persistencia (CV/Carta) y Lanzamiento de Modo Claro/Oscuro

### Módulos Afectados
- **Generar Documentos (CV y Carta de Presentación)**: Reparación del guardado de borradores y generación de documentos en Supabase.
- **Modo Claro / Oscuro (Global)**: Implementación de interruptor de tema persistente en la cabecera superior.
- **Backend / Routing**: Robustecimiento de validaciones, logs seguros y creación de endpoints de guardado.

### Archivos Modificados / Creados
- `[NEW] [migration_fix_all.sql](file:///d:/Personal/Proyectos/IA%20Empleabilidad/supabase/migration_fix_all.sql)`: Migración SQL unificada que agrega todas las columnas requeridas por `cover_letters` y `generated_cvs` (incluyendo `cv_style`, `document_title`, `status`, etc.) en Supabase de forma segura.
- `[MOD] [index.css](file:///d:/Personal/Proyectos/IA%20Empleabilidad/frontend/src/index.css)`: Añadidos overrides globales bajo la clase `.dark` (fondos, bordes, textos, formularios y sidebars) para un modo oscuro consistente sin alterar la sintaxis en JSX.
- `[MOD] [App.jsx](file:///d:/Personal/Proyectos/IA%20Empleabilidad/frontend/src/App.jsx)`: Integración del estado `theme` con sincronización en `localStorage` y toggle de clase en la raíz del documento.
- `[MOD] [AppLayout.jsx](file:///d:/Personal/Proyectos/IA%20Empleabilidad/frontend/src/components/layout/AppLayout.jsx)` y `[Header.jsx](file:///d:/Personal/Proyectos/IA%20Empleabilidad/frontend/src/components/layout/Header.jsx)`: Propagación de las propiedades del tema y renderizado de un botón Sol/Luna premium en la barra superior.

### Causa Raíz
* **CV y Cartas**: La base de datos carecía de las columnas añadidas en el último desarrollo en Supabase. Esto generaba errores de caché del esquema en llamadas a `generated_cvs` y `cover_letters`.
* **Tema**: Se requería una implementación de tema de alto nivel y excelente estética sin realizar modificaciones intrusivas de clases.

### Validaciones Realizadas
* **Compilación**: Bundle de producción exitoso con `npm run build` en 2.39 segundos.
* **Integración del Tema**: Pruebas en navegador automatizadas que certifican la inserción correcta de la clase `.dark` en el elemento raíz y una transición visual fluida de colores.
* **Validación de API**: Mapeos correctos de los códigos de error Postgres a `DB_SCHEMA_MISMATCH`.

### Pendientes
- Ejecutar la migración unificada [migration_fix_all.sql](file:///d:/Personal/Proyectos/IA%20Empleabilidad/supabase/migration_fix_all.sql) en el SQL Editor de tu consola de Supabase Cloud.

## [2026-06-29] Rediseño de Navegación, Ajuste Visual de Configuración e Integración BYOK

### Módulos Afectados
- **Navegación / Sidebar**: Limpieza de menús redundantes.
- **Configuración (Settings)**: Rediseño visual del módulo, integración real de la API de credenciales de IA (BYOK) y control defensivo de estado.
- **Backend / API**: Registro correcto de routers y soporte de variables de entorno para criptografía.

### Archivos Modificados / Creados
- `[MOD] [navigation.js](file:///d:/Personal/Proyectos/IA%20Empleabilidad/frontend/src/components/layout/navigation.js)`: Se eliminó el grupo "Recursos" y su submenú redundante.
- `[MOD] [SettingsView.jsx](file:///d:/Personal/Proyectos/IA%20Empleabilidad/frontend/src/views/SettingsView.jsx)`: Rediseño visual completo a un grid de 3 columnas para aprovechar el ancho disponible. Integración real con el endpoint `/api/ai-credentials` mediante `apiRequest`. Manejo defensivo si el backend no responde (muestra banner de advertencia).
- `[MOD] [App.jsx](file:///d:/Personal/Proyectos/IA%20Empleabilidad/frontend/src/App.jsx)`: Se pasó el estado `profile` al componente `SettingsView` para renderizar el nombre y rol del usuario.
- `[MOD] [server.js](file:///d:/Personal/Proyectos/IA%20Empleabilidad/backend/server.js)`: Asegurado el registro de `aiCredentialsRouter` bajo la API principal.
- `[MOD] [.env](file:///d:/Personal/Proyectos/IA%20Empleabilidad/backend/.env)`: Se añadió la variable de entorno ENCRYPTION_KEY para habilitar el cifrado AES-256-GCM de las API Keys. No se debe exponer el valor real de esta variable en documentación, consola ni repositorio público.
- `[NEW] [migration_v5.sql](file:///d:/Personal/Proyectos/IA%20Empleabilidad/supabase/migration_v5.sql)`: Script DDL/DML para crear las tablas de credenciales de proveedores y preferencias de modelo por caso de uso en Supabase, incluyendo políticas RLS.

### Validación Técnica
- Se ejecutó `npm run build` en el frontend y compiló sin errores críticos.
- Se reinició el backend para cargar el router actualizado de credenciales IA.
- Se validó que el endpoint `/api/ai-credentials` responde correctamente después de reiniciar el proceso del puerto 5000.
- Se validó que el menú Recursos ya no aparece en el sidebar.
- Se validó que Configuración permanece como módulo independiente.

### Detalles de la Validación y Pruebas
1. **Navegación**:
   - Se validó que el menú redundante "Recursos" ya no aparece en el sidebar.
   - El enlace de "Configuración" resalta correctamente y se mantiene en un módulo independiente.
2. **Causa del error 404 anterior**:
   - El proceso de backend que corría en el puerto `5000` en el sistema del usuario estaba ejecutando una versión antigua del código sin el router de credenciales.
   - **Solución**: Se identificó y detuvo el proceso colgado en el puerto 5000 y se inició un nuevo proceso `npm run dev` en segundo plano. Los endpoints `/api/ai-credentials` ahora responden correctamente (HTTP 200/201).
3. **Robustez Frontend**:
   - Si el backend se detiene o no está disponible, `SettingsView.jsx` lo maneja de forma controlada (mide la respuesta, no satura la consola de errores fatales, y muestra un banner indicando que el servicio de credenciales está temporalmente offline sin impedir el uso de la app).
4. **Diseño Visual**:
   - Se amplió el contenedor a `max-w-7xl` para pantallas grandes.
   - Diseño organizado en columnas (Cuenta de Usuario + Proveedores a la izquierda; Configuración de API Key, modelo y modo de generación a la derecha).
   - Sección informativa de "Uso de IA por módulo" al final de la vista.

### Pendientes
- Ejecutar `supabase/migration_v5.sql` en el SQL Editor de Supabase Cloud.
- Validar el guardado real de API Key desde la pantalla Configuración.
- Validar que la API Key se muestre únicamente enmascarada.
- Confirmar que los controladores `cv.js`, `letter.js` e `interview.js` usen progresivamente `AIProviderService.generateWithFallback(...)`.
- No subir valores reales de `.env` al repositorio.

## [2026-06-29] Corrección de Títulos Duplicados, Códigos de Error BYOK y Reestructuración de Rutas

### Módulos Afectados
- **UI / Frontend**: Configuración, Mis métricas y Entrevistas.
- **Backend / Routing**: Middleware de Auth y API de credenciales de IA.

### Archivos Modificados
- `[MOD] [SettingsView.jsx](file:///d:/Personal/Proyectos/IA%20Empleabilidad/frontend/src/views/SettingsView.jsx)`: Eliminado el encabezado redundante del body. Mapeo dinámico del estado `errorCode` (`BYOK_MIGRATION_MISSING`, `BYOK_PERMISSION_ERROR`, `AUTH_REQUIRED`, `NETWORK_ERROR`, `UNKNOWN_ERROR`) para mostrar banners específicos en lugar de un mensaje genérico.
- `[MOD] [App.jsx](file:///d:/Personal/Proyectos/IA%20Empleabilidad/frontend/src/App.jsx)`: Se removió el bloque de título y descripción redundante del body en la vista "Mis métricas".
- `[MOD] [Interviews.jsx](file:///d:/Personal/Proyectos/IA%20Empleabilidad/frontend/src/views/Interviews.jsx)`: Se eliminó el título gigante "Nueva entrevista simulada" y se reemplazó por una tarjeta contextual compacta y elegante.
- `[MOD] [aiCredentials.js](file:///d:/Personal/Proyectos/IA%20Empleabilidad/backend/routes/aiCredentials.js)`: Se cambiaron las rutas internas a relativas para ser montadas modularmente bajo `/api/ai-credentials` en `server.js`.
- `[MOD] [authMiddleware.js](file:///d:/Personal/Proyectos/IA%20Empleabilidad/backend/lib/authMiddleware.js)`: Se modificó la respuesta 401 de sesión expirada para que devuelva un formato estandarizado JSON (`code: 'AUTH_REQUIRED'`).
- `[MOD] [server.js](file:///d:/Personal/Proyectos/IA%20Empleabilidad/backend/server.js)`: Se montó el router bajo el path exacto `app.use('/api/ai-credentials', aiCredentialsRouter)`.
- `[MOD] [api.js](file:///d:/Personal/Proyectos/IA%20Empleabilidad/frontend/src/utils/api.js)`: Se adaptó el helper `apiRequest` para capturar y propagar tanto el campo `data.message` como el `data.code` devuelto por el servidor cuando `response.ok` es falso.

### Validación Técnica
- Se ejecutó `npm run build` en el frontend y finalizó con éxito en 590ms con 0 errores de compilación o sintaxis.
- Se balancearon y verificaron todos los tags JSX afectados en `Interviews.jsx` y `SettingsView.jsx`.
- Se confirmó que el sidebar mantiene el menú Configuración independiente y que Recursos no aparece.
- Se comprobó que el Header superior muestra correctamente las categorías y títulos mapeados según el pathname actual.

### Pendientes
- Ejecutar la migración `migration_v5.sql` en Supabase Cloud.
- Forzar recarga de cache con `NOTIFY pgrst, 'reload schema';` si Supabase no expone las nuevas tablas en el schema cache inmediatamente.

## [2026-06-29] Normalización de UI y Eliminación de Encabezados Duplicados en Body

### Módulos Afectados
- **UI / Frontend**: Dashboard, Mi Perfil, Curriculum Vitae, Carta de Presentación y Mis borradores.

### Archivos Modificados
- `[MOD] [Dashboard.jsx](file:///d:/Personal/Proyectos/IA%20Empleabilidad/frontend/src/views/Dashboard.jsx)`: Se removió el título `"Dashboard"` redundante tanto en la vista final como en el estado de carga skeleton.
- `[MOD] [ProfileView.jsx](file:///d:/Personal/Proyectos/IA%20Empleabilidad/frontend/src/views/ProfileView.jsx)`: Se eliminaron el título `"Mi perfil"` y la descripción redundante. El botón `"Editar perfil"` ahora se alinea correctamente arriba a la derecha.
- `[MOD] [Documents.jsx](file:///d:/Personal/Proyectos/IA%20Empleabilidad/frontend/src/views/Documents.jsx)`:
  * *Sección CV*: Se removió el bloque superior con `"Generar CV"` y `"Asistente inteligente"`. La barra de pasos (wizard) se centró en la parte superior.
  * *Sección Carta*: Se eliminó el título `"Carta de presentación"` de la página. La descripción secundaria se integró de forma natural como texto explicativo dentro de la tarjeta de `"Nueva carta de presentación"`.
- `[MOD] [Drafts.jsx](file:///d:/Personal/Proyectos/IA%20Empleabilidad/frontend/src/views/Drafts.jsx)`: Se eliminó el encabezado duplicado `"Mis borradores"` y su descripción, de modo que la vista inicia directamente con los filtros de búsqueda y la tabla de documentos.
- `[MOD] [CvCustomize.jsx](file:///d:/Personal/Proyectos/IA%20Empleabilidad/frontend/src/views/CvCustomize.jsx)`: Se retiró el título duplicado de personalización. Las acciones de guardar borrador y descargar CV quedan limpiamente alineadas arriba a la derecha.

### Validación Técnica
- Compilación de producción con Vite completada con éxito (`npm run build` finalizó en 1.70s con 0 errores).
- Validación de que los títulos principales solo aparecen en el Header superior global en base al pathname actual de forma unificada.
- Comprobación de espaciado adaptativo (padding y margins) para evitar zonas vacías en pantallas grandes y móviles.
- Habilitación de los modelos `GPT-4o` y `GPT-4 Turbo` en el selector de la pantalla Configuración, ya que el backend de OpenAIProvider los soporta dinámicamente.

## [2026-06-29] Reorganización de Navegación y Optimización Integral del Layout

### Módulos Afectados
- **UI / Layout**: Sidebar, Cabecera (Header), Navegación Móvil (MobileDrawer).
- **Vistas del Sistema**: Dashboard, Mi Perfil, Curriculum Vitae, Carta de Presentación, Mis Borradores, Entrevistas, Métricas y Configuración.

### Archivos Modificados
- `[MOD] [navigation.js](file:///d:/Personal/Proyectos/IA%20Empleabilidad/frontend/src/components/layout/navigation.js)`: Añadido `hideInSidebar: true` para ocultar la ruta de configuración del sidebar sin romper la resolución del pathname activo en la cabecera.
- `[MOD] [Sidebar.jsx](file:///d:/Personal/Proyectos/IA%20Empleabilidad/frontend/src/components/layout/Sidebar.jsx)`: Filtrado de grupos con `hideInSidebar` y eliminación definitiva del footer de logout fijo.
- `[MOD] [MobileDrawer.jsx](file:///d:/Personal/Proyectos/IA%20Empleabilidad/frontend/src/components/layout/MobileDrawer.jsx)`: Ajustado de igual manera que el sidebar para ocultar configuración y remover botón fijo de cerrar sesión en móviles.
- `[NEW] [UserMenu.jsx](file:///d:/Personal/Proyectos/IA%20Empleabilidad/frontend/src/components/layout/UserMenu.jsx)`: Creado el componente dropdown flotante de cuenta con avatar inicial, nombre, rol y correo, más enlaces para Configuración y Cerrar sesión. Cierre automático con clic externo o tecla `Escape`.
- `[MOD] [Header.jsx](file:///d:/Personal/Proyectos/IA%20Empleabilidad/frontend/src/components/layout/Header.jsx)`: Habilitado el avatar del usuario interactivo en todas las resoluciones (móvil y desktop) como disparador del menú flotante.
- `[MOD] [AppLayout.jsx](file:///d:/Personal/Proyectos/IA%20Empleabilidad/frontend/src/components/layout/AppLayout.jsx)`: Enrutados los eventos de navegación y desconexión hacia la cabecera.
- `[MOD] [Dashboard.jsx](file:///d:/Personal/Proyectos/IA%20Empleabilidad/frontend/src/views/Dashboard.jsx)`: Expandido el contenedor principal a un máximo de `1600px`.
- `[MOD] [ProfileView.jsx](file:///d:/Personal/Proyectos/IA%20Empleabilidad/frontend/src/views/ProfileView.jsx)`: Expandido el ancho a `1600px` e integrado el botón "Editar Perfil" al extremo derecho de la barra de pestañas para eliminar elementos flotantes sueltos.
- `[MOD] [Profile.jsx](file:///d:/Personal/Proyectos/IA%20Empleabilidad/frontend/src/views/Profile.jsx)`: Agrupadas la cabecera y el formulario bajo un contenedor de `1600px` para alineación consistente.
- `[MOD] [Documents.jsx](file:///d:/Personal/Proyectos/IA%20Empleabilidad/frontend/src/views/Documents.jsx)`: Actualizados los contenedores a `max-w-[1600px]` en flujos de CV y carta. El editor de la carta de presentación se distribuyó en un grid simétrico de 5 columnas para formulario y 7 columnas para previsualización.
- `[MOD] [CvCustomize.jsx](file:///d:/Personal/Proyectos/IA%20Empleabilidad/frontend/src/views/CvCustomize.jsx)`: Corregido el espaciado lateral del personalizador y alertas subiendo el ancho máximo a `1600px`.
- `[MOD] [Drafts.jsx](file:///d:/Personal/Proyectos/IA%20Empleabilidad/frontend/src/views/Drafts.jsx)`: Ensanchada la tabla de documentos a `1600px` útiles y alineación horizontal de filtros de búsqueda.
- `[MOD] [Interviews.jsx](file:///d:/Personal/Proyectos/IA%20Empleabilidad/frontend/src/views/Interviews.jsx)`: Compactado el aviso superior del simulador reubicándolo dentro de la propia tarjeta del selector de dificultad. Ancho aumentado a `1600px`.
- `[MOD] [SettingsView.jsx](file:///d:/Personal/Proyectos/IA%20Empleabilidad/frontend/src/views/SettingsView.jsx)`: Corregidos los márgenes a `1600px` y distribuido el panel en columnas lógicas (Cuenta/Proveedores a la izquierda, BYOK a la derecha).
- `[MOD] [App.jsx](file:///d:/Personal/Proyectos/IA%20Empleabilidad/frontend/src/App.jsx)`: Modificadas las vistas de Métricas y Recursos didácticos para usar el nuevo límite adaptativo de `1600px`.

### Validación Técnica
- Compilación de producción con Vite completada con éxito (`npm run build` finalizó en 672ms con 0 errores de sintaxis o importaciones).
- Pruebas visuales del menú flotante (dropdown) comprobando su correcto posicionamiento absolute y cierre dinámico.

## [2026-06-29] Unificación de Header, Refinamiento de Branding y Limpieza de Vista

### Módulos Afectados
- **UI / Layout**: Cabecera (Header), Barra de Navegación Lateral (Sidebar), Navegación Móvil (MobileDrawer).
- **Vistas del Sistema**: Generar Documentos (Carta de presentación).

### Archivos Modificados
- `[NEW] [Logo.jsx](file:///d:/Personal/Proyectos/IA%20Empleabilidad/frontend/src/components/layout/Logo.jsx)`: Creado un componente de logo independiente y responsivo con gradiente lineal (`from-indigo-600 to-violet-500`) en el icono, destello animado (Sparkles) y efecto hover de escalado. Soporta estados normales y compactados.
- `[MOD] [Sidebar.jsx](file:///d:/Personal/Proyectos/IA%20Empleabilidad/frontend/src/components/layout/Sidebar.jsx)`: Reemplazado el marcado de marca antiguo por el componente `<Logo />` y enlazado su evento `onClick` a la ruta `'dashboard'` (Inicio) con cursor tipo puntero.
- `[MOD] [MobileDrawer.jsx](file:///d:/Personal/Proyectos/IA%20Empleabilidad/frontend/src/components/layout/MobileDrawer.jsx)`: Reemplazada la cabecera por `<Logo />` con redirección a inicio y cierre automático del menú al hacer clic.
- `[MOD] [Header.jsx](file:///d:/Personal/Proyectos/IA%20Empleabilidad/frontend/src/components/layout/Header.jsx)`: Unificado el nombre de usuario, rol y avatar circular dentro de un único botón contenedor (`button`) reactivo a clics. Se integró un chevron interactivo que gira 180° cuando el menú está abierto y se agregó soporte de accesibilidad mediante etiquetas `aria-label`.
- `[MOD] [Documents.jsx](file:///d:/Personal/Proyectos/IA%20Empleabilidad/frontend/src/views/Documents.jsx)`: Eliminado el botón redundante "Volver" (anteriormente ubicado encima del formulario de Carta de presentación) para limpiar el espacio vertical de la vista de redacción de carta de presentación.

### Validación Técnica
- Compilación de producción con Vite completada con éxito (`npm run build` finalizó en 501ms con 0 errores o warnings).
- Pruebas de accesibilidad de marca e indicador de usuario validadas.





