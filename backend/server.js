// Carga las variables de entorno antes que cualquier otro módulo que las use.
import './lib/loadEnv.js';

import express from 'express';
import cors from 'cors';

// Importar Routers
import cvRouter           from './routes/cv.js';
import letterRouter       from './routes/letter.js';
import interviewRouter    from './routes/interview.js';
import profileRouter      from './routes/profile.js';
import aiCredentialsRouter from './routes/aiCredentials.js';
import accountRouter       from './routes/account.js';
import userDataRouter       from './routes/userData.js';
import { swaggerUi, swaggerSpec } from './lib/swagger.js';
import { aiLimiter } from './lib/rateLimiters.js';

const app = express();
const PORT = process.env.PORT || 5000;

// Configurar CORS. Los orígenes permitidos salen de la variable de entorno
// CORS_ORIGINS (lista separada por comas); si no está, se usan los locales.
const allowedOrigins = (process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map(o => o.trim()).filter(Boolean)
  : ['http://localhost:3000', 'http://localhost:5173', 'http://localhost:3001']);
app.use(cors({
  origin: function (origin, callback) {
    // Permitir solicitudes sin origen (como apps móviles o curl)
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = 'El origen CORS para este sitio no ha sido autorizado.';
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  },
  credentials: true
}));

// Middleware para parsear cuerpos de solicitudes JSON
app.use(express.json());

// Ruta de estado básica para monitoreo
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Servidor API de EmpleaIA en ejecución.' });
});

// Aplicar rate limiting solo a los endpoints costosos (que llaman a IA).
// app.use con prefijo de ruta cubre también sus subrutas (ej. /interview/*).
app.use(
  ['/api/cv-generate', '/api/cv-parse', '/api/cv/parse-import', '/api/letter-generate', '/api/interview', '/api/profile/import-cv'],
  aiLimiter
);

// Registrar Rutas del Sistema
app.use('/api', cvRouter);
app.use('/api', letterRouter);
app.use('/api', interviewRouter);
app.use('/api', profileRouter);
app.use('/api', accountRouter);
app.use('/api', userDataRouter); // Exportar / eliminar datos personales (HU10)
app.use('/api/ai-credentials', aiCredentialsRouter); // Credenciales y preferencias de IA por usuario

// Exponer especificación OpenAPI en JSON
app.get('/openapi.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});

// Exponer la documentación interactiva de Swagger UI
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Manejar rutas inexistentes
app.use((req, res) => {
  res.status(404).json({ error: `Ruta de API no encontrada: ${req.originalUrl}` });
});

// Manejador global de errores. Loguea el stack real en el servidor y responde
// con la misma forma JSON del resto de la API ({ success, error }); el detalle
// interno no se filtra al cliente.
app.use((err, req, res, next) => {
  console.error(`Error no controlado en servidor (${req.method} ${req.originalUrl}):`, err.stack || err);
  res.status(500).json({
    success: false,
    error: 'Ocurrió un error interno no controlado en el servidor',
  });
});

// Arrancar Escucha del Servidor
app.listen(PORT, () => {
  console.log(`==================================================`);
  console.log(`  EmpleaIA Backend API - Capa de Negocio          `);
  console.log(`  Servidor corriendo en: http://localhost:${PORT}  `);
  console.log(`==================================================`);
});
