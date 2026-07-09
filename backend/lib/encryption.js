/**
 * encryption.js — Cifrado AES-256-GCM para API Keys de proveedores de IA.
 *
 * Seguridad:
 * - Algoritmo: AES-256-GCM (autenticado, detecta manipulación)
 * - IV: 12 bytes aleatorios por operación (nunca reutilizado)
 * - Auth tag: 16 bytes incluidos en el payload cifrado
 * - Clave: 32 bytes desde variable de entorno ENCRYPTION_KEY (hex)
 * - NUNCA se loguea el plaintext ni la clave completa
 * - Sin dependencias externas: usa módulo `crypto` nativo de Node.js
 */

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES   = 12;  // 96 bits — recomendado por NIST para GCM
const TAG_BYTES  = 16;  // 128 bits de auth tag

/**
 * Obtiene y valida la clave de cifrado desde env.
 * @returns {Buffer} 32 bytes
 */
function getEncryptionKey() {
  const keyHex = process.env.ENCRYPTION_KEY;
  if (!keyHex || keyHex.length < 64) {
    throw new Error(
      '[encryption] ENCRYPTION_KEY no configurada o inválida. ' +
      'Genera una con: openssl rand -hex 32'
    );
  }
  return Buffer.from(keyHex.slice(0, 64), 'hex'); // 32 bytes
}

/**
 * Cifra una API key en claro.
 * @param {string} plaintext - La API key en claro
 * @returns {string} Payload cifrado en base64 (iv + ciphertext + authTag)
 */
export function encryptApiKey(plaintext) {
  if (!plaintext || typeof plaintext !== 'string') {
    throw new Error('[encryption] plaintext inválido para cifrar');
  }

  const key = getEncryptionKey();
  const iv  = crypto.randomBytes(IV_BYTES);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final()
  ]);
  const authTag = cipher.getAuthTag();

  // Formato: [iv (12B)][authTag (16B)][ciphertext (nB)] → base64
  const payload = Buffer.concat([iv, authTag, encrypted]);
  console.log('[encryption] API key cifrada. Longitud del payload:', payload.length, 'bytes');
  return payload.toString('base64');
}

/**
 * Descifra una API key previamente cifrada con encryptApiKey().
 * @param {string} encryptedBase64 - Payload cifrado en base64
 * @returns {string} API key en claro
 */
export function decryptApiKey(encryptedBase64) {
  if (!encryptedBase64 || typeof encryptedBase64 !== 'string') {
    throw new Error('[encryption] payload inválido para descifrar');
  }

  const key     = getEncryptionKey();
  const payload = Buffer.from(encryptedBase64, 'base64');

  if (payload.length < IV_BYTES + TAG_BYTES + 1) {
    throw new Error('[encryption] payload demasiado corto, puede estar corrupto');
  }

  const iv         = payload.subarray(0, IV_BYTES);
  const authTag    = payload.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const ciphertext = payload.subarray(IV_BYTES + TAG_BYTES);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  try {
    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final()
    ]);
    return decrypted.toString('utf8');
  } catch {
    throw new Error('[encryption] Falló la autenticación del payload. Puede estar corrupto o manipulado.');
  }
}

/**
 * Genera una versión enmascarada de una API key para mostrar en UI.
 * Ejemplo: "sk-proj-aBcDeFgH..." → "sk-proj-••••••••gH..."
 * @param {string} plaintext
 * @returns {string} Versión enmascarada
 */
export function maskApiKey(plaintext) {
  if (!plaintext || plaintext.length < 8) return '••••••••';
  const prefix = plaintext.slice(0, 7);      // ej: "sk-proj"
  const suffix = plaintext.slice(-4);         // últimos 4 chars
  return `${prefix}-••••••••${suffix}`;
}
