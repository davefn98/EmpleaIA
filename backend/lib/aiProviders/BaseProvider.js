/**
 * BaseProvider.js — Contrato abstracto para todos los proveedores de IA.
 *
 * Todos los proveedores DEBEN extender esta clase e implementar los tres métodos.
 * Si un método no está implementado, lanza NotImplementedError al ser llamado.
 *
 * Patrón: Strategy — permite intercambiar proveedores sin modificar
 * los controladores ni los servicios de dominio.
 */

export class NotImplementedError extends Error {
  constructor(methodName, providerName) {
    super(
      `[${providerName}] El método '${methodName}' no está implementado. ` +
      `Extiende BaseProvider e implementa este método.`
    );
    this.name = 'NotImplementedError';
  }
}

export class BaseProvider {
  /**
   * Nombre identificador del proveedor (debe ser sobreescrito).
   * @type {string}
   */
  name = 'base';

  /**
   * Genera texto usando el modelo especificado.
   *
   * @param {object} params
   * @param {string} params.apiKey      - API key del proveedor (puede ser del usuario o del servidor)
   * @param {string} params.model       - Identificador del modelo (ej: 'gpt-4o-mini')
   * @param {Array}  params.messages    - Array de mensajes en formato [{role, content}]
   * @param {number} [params.temperature=0.7] - Temperatura de generación (0.0 - 1.0)
   * @param {number} [params.maxTokens]       - Límite de tokens de salida
   * @returns {Promise<string>} Texto generado
   */
  async generateText({ apiKey, model, messages, temperature = 0.7, maxTokens }) {
    throw new NotImplementedError('generateText', this.name);
  }

  /**
   * Verifica que la API key sea válida haciendo una llamada mínima al proveedor.
   *
   * @param {object} params
   * @param {string} params.apiKey - API key a verificar
   * @returns {Promise<{ ok: boolean, error?: string, models?: string[] }>}
   */
  async verifyConnection({ apiKey }) {
    throw new NotImplementedError('verifyConnection', this.name);
  }

  /**
   * Lista los modelos disponibles para el proveedor y la API key dados.
   *
   * @param {object} params
   * @param {string} params.apiKey - API key con permisos de listar modelos
   * @returns {Promise<string[]>} Lista de IDs de modelos disponibles
   */
  async listModels({ apiKey }) {
    throw new NotImplementedError('listModels', this.name);
  }
}
