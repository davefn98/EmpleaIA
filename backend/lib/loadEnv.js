/**
 * loadEnv.js — Carga centralizada de variables de entorno.
 *
 * Importa este módulo (por su efecto secundario) al inicio de cualquier archivo
 * que necesite process.env:  import './loadEnv.js';
 *
 * Ventajas frente a la carga dispersa anterior:
 * - Una sola fuente de verdad (antes se cargaba en server.js, supabaseClient.js
 *   y openaiClient.js, este último con process.cwd() que se rompía según desde
 *   dónde se arrancara).
 * - Resuelve las rutas desde la carpeta del backend vía import.meta.url, así que
 *   funciona igual arrancando desde /backend o desde la raíz del repo.
 * - Solo se ejecuta una vez (módulos ES cacheados), aunque se importe en varios sitios.
 *
 * Prioridad: .env.local sobrescribe .env.
 */

import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, '..');

for (const file of ['.env.local', '.env']) {
  const fullPath = path.resolve(backendRoot, file);
  if (fs.existsSync(fullPath)) {
    dotenv.config({ path: fullPath });
  }
}
