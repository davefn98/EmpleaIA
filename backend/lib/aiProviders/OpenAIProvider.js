/**
 * OpenAIProvider.js — Implementación del proveedor OpenAI.
 *
 * Implementa la interfaz BaseProvider para que AIProviderService
 * pueda usarlo de forma intercambiable con otros proveedores.
 *
 * Los controladores NO importan este archivo directamente.
 * Solo AIProviderService y providerRegistry lo conocen.
 */

import OpenAI from 'openai';
import { BaseProvider } from './BaseProvider.js';

// Modelos disponibles para selección del usuario
export const OPENAI_AVAILABLE_MODELS = [
  'gpt-4o-mini',
  'gpt-4o',
  'gpt-4.1-mini',
  'gpt-4.1',
  'gpt-4-turbo',
];

export class OpenAIProvider extends BaseProvider {
  name = 'openai';

  /**
   * Crea una instancia de OpenAI con la API key proporcionada.
   * Cada llamada crea su propio cliente para soportar keys distintas por usuario.
   * @param {string} apiKey
   * @returns {OpenAI}
   */
  _buildClient(apiKey) {
    // timeout/maxRetries: evita requests colgados indefinidamente y el doble
    // reintento silencioso por defecto del SDK, que duplicaba la latencia.
    return new OpenAI({ apiKey, timeout: 60000, maxRetries: 1 });
  }

  /**
   * Genera texto usando la API de OpenAI.
   * @param {object} params
   * @param {string} params.apiKey
   * @param {string} params.model
   * @param {Array}  params.messages
   * @param {number} [params.temperature=0.7]
   * @param {number} [params.maxTokens]
   * @param {boolean} [params.jsonMode=false] - Si true, usa response_format: json_object
   * @returns {Promise<string>}
   */
  async generateText({ apiKey, model, messages, temperature = 0.7, maxTokens, jsonMode = false }) {
    const client = this._buildClient(apiKey);

    const requestParams = {
      model: model || 'gpt-4o-mini',
      messages,
      temperature,
    };

    if (maxTokens) requestParams.max_tokens = maxTokens;
    if (jsonMode)  requestParams.response_format = { type: 'json_object' };

    console.log(`[OpenAIProvider] generateText → modelo: ${requestParams.model}, mensajes: ${messages.length}`);

    const response = await client.chat.completions.create(requestParams);
    return {
      content: response.choices[0].message.content,
      usage: response.usage
    };
  }

  /**
   * Verifica que la API key de OpenAI es válida realizando
   * la llamada más barata posible (listar modelos).
   * @param {object} params
   * @param {string} params.apiKey
   * @returns {Promise<{ ok: boolean, error?: string, models?: string[] }>}
   */
  async verifyConnection({ apiKey }) {
    if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length < 20) {
      return { ok: false, error: 'La API key proporcionada parece inválida o está vacía.' };
    }

    try {
      const client = this._buildClient(apiKey);
      const modelsResponse = await client.models.list();

      // Filtrar solo los modelos GPT disponibles para el usuario
      const availableGptModels = modelsResponse.data
        .map(m => m.id)
        .filter(id => id.startsWith('gpt-'))
        .sort();

      console.log(`[OpenAIProvider] verifyConnection → OK. Modelos GPT disponibles: ${availableGptModels.length}`);
      return { ok: true, models: availableGptModels };
    } catch (err) {
      const errorInfo = this._classifyError(err);
      console.warn(`[OpenAIProvider] verifyConnection → FALLO: ${errorInfo.message}`);
      return { ok: false, error: errorInfo.message };
    }
  }

  /**
   * Lista los modelos GPT disponibles para la API key dada.
   * @param {object} params
   * @param {string} params.apiKey
   * @returns {Promise<string[]>}
   */
  async listModels({ apiKey }) {
    try {
      const client = this._buildClient(apiKey);
      const response = await client.models.list();
      return response.data
        .map(m => m.id)
        .filter(id => id.startsWith('gpt-'))
        .sort();
    } catch {
      // Fallback a lista estática si la key no tiene permisos de listar
      return OPENAI_AVAILABLE_MODELS;
    }
  }

  /**
   * Clasifica errores de la API de OpenAI en mensajes amigables.
   * @param {Error} err
   * @returns {{ message: string, code: string }}
   */
  _classifyError(err) {
    const status = err?.status || err?.response?.status;
    const msg = (err?.message || '').toLowerCase();

    if (status === 401 || msg.includes('incorrect api key') || msg.includes('invalid api key')) {
      return { message: 'API key inválida o incorrecta.', code: 'invalid_key' };
    }
    if (status === 429 || msg.includes('rate limit')) {
      return { message: 'Límite de solicitudes alcanzado. Intenta más tarde.', code: 'rate_limit' };
    }
    if (status === 402 || msg.includes('quota') || msg.includes('billing')) {
      return { message: 'Cuota agotada o problema de facturación en tu cuenta OpenAI.', code: 'quota_exceeded' };
    }
    if (status === 503 || msg.includes('unavailable') || msg.includes('overloaded')) {
      return { message: 'El servicio de OpenAI no está disponible temporalmente.', code: 'service_unavailable' };
    }
    return { message: err?.message || 'Error desconocido al conectar con OpenAI.', code: 'unknown' };
  }
}
