/**
 * providerRegistry.js — Registro central de proveedores de IA (Factory/Registry).
 *
 * Para agregar un nuevo proveedor en el futuro:
 *   1. Crear la clase en ./NuevoProvider.js extendiendo BaseProvider
 *   2. Importarla aquí y agregarla al objeto `registry`
 *   3. NADA MÁS CAMBIA — ni AIProviderService, ni controladores, ni rutas
 *
 * Patrón: Factory + Registry
 */

import { OpenAIProvider }    from './OpenAIProvider.js';
import { AnthropicProvider } from './AnthropicProvider.js';
import { GeminiProvider }    from './GeminiProvider.js';

/**
 * Registro de instancias de proveedores.
 * Una instancia por tipo — son stateless (no guardan estado por usuario).
 */
const registry = {
  openai:    new OpenAIProvider(),
  anthropic: new AnthropicProvider(),
  gemini:    new GeminiProvider(),
};

/**
 * Obtiene la instancia del proveedor registrado.
 * @param {string} providerName - 'openai' | 'anthropic' | 'gemini'
 * @returns {BaseProvider | null} Instancia del proveedor, o null si no existe
 */
export function getProvider(providerName) {
  return registry[providerName] ?? null;
}

/**
 * Verifica si un proveedor está registrado.
 * @param {string} providerName
 * @returns {boolean}
 */
export function isValidProvider(providerName) {
  return providerName in registry;
}

/**
 * Lista los proveedores registrados con su metadata.
 * @returns {Array<{ id: string, available: boolean }>}
 */
export function listProviders() {
  return Object.keys(registry).map(id => ({
    id,
    // Los tres proveedores tienen implementación real (BYOK).
    available: true,
  }));
}
