/**
 * AnthropicProvider.js — Implementación del proveedor Anthropic Claude.
 *
 * Implementa la interfaz BaseProvider para que AIProviderService
 * pueda usarlo de forma intercambiable con otros proveedores.
 *
 * Los controladores NO importan este archivo directamente.
 * Solo AIProviderService y providerRegistry lo conocen.
 */

import Anthropic from '@anthropic-ai/sdk';
import { BaseProvider } from './BaseProvider.js';

// Modelos disponibles para selección del usuario (IDs vigentes de la API de Anthropic)
export const ANTHROPIC_AVAILABLE_MODELS = [
  'claude-opus-4-8',
  'claude-sonnet-5',
  'claude-haiku-4-5',
];

const DEFAULT_MODEL = 'claude-opus-4-8';

export class AnthropicProvider extends BaseProvider {
  name = 'anthropic';

  _buildClient(apiKey) {
    return new Anthropic({ apiKey, timeout: 60000, maxRetries: 1 });
  }

  /**
   * Genera texto usando la Messages API de Anthropic.
   * Nota: los modelos Claude actuales rechazan `temperature` con 400, por lo
   * que este proveedor la ignora deliberadamente. El modo de generación del
   * usuario solo aplica a proveedores que soportan temperature.
   * @returns {Promise<{ content: string, usage: object }>}
   */
  async generateText({ apiKey, model, messages, maxTokens, jsonMode = false }) {
    const client = this._buildClient(apiKey);

    // Anthropic recibe el system prompt como parámetro aparte, no como mensaje.
    const systemParts = messages.filter(m => m.role === 'system').map(m => m.content);
    const chatMessages = messages
      .filter(m => m.role !== 'system')
      .map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }));

    if (jsonMode) {
      systemParts.push('Responde únicamente con un objeto JSON válido, sin bloques de código markdown ni texto adicional.');
    }

    const requestParams = {
      model: model || DEFAULT_MODEL,
      max_tokens: maxTokens || 1024,
      messages: chatMessages,
    };
    if (systemParts.length) requestParams.system = systemParts.join('\n\n');

    console.log(`[AnthropicProvider] generateText → modelo: ${requestParams.model}, mensajes: ${chatMessages.length}`);

    const response = await client.messages.create(requestParams);
    const content = (response.content || [])
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('');

    return {
      content,
      usage: {
        prompt_tokens: response.usage?.input_tokens,
        completion_tokens: response.usage?.output_tokens,
        total_tokens: (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0)
      }
    };
  }

  /**
   * Verifica que la API key de Anthropic es válida con la llamada más barata
   * posible (listar modelos).
   * @returns {Promise<{ ok: boolean, error?: string, models?: string[] }>}
   */
  async verifyConnection({ apiKey }) {
    if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length < 20) {
      return { ok: false, error: 'La API key proporcionada parece inválida o está vacía.' };
    }

    try {
      const client = this._buildClient(apiKey);
      const modelsResponse = await client.models.list();
      const models = (modelsResponse.data || []).map(m => m.id).sort();
      console.log(`[AnthropicProvider] verifyConnection → OK. Modelos disponibles: ${models.length}`);
      return { ok: true, models };
    } catch (err) {
      const errorInfo = this._classifyError(err);
      console.warn(`[AnthropicProvider] verifyConnection → FALLO: ${errorInfo.message}`);
      return { ok: false, error: errorInfo.message };
    }
  }

  async listModels({ apiKey }) {
    try {
      const client = this._buildClient(apiKey);
      const response = await client.models.list();
      return (response.data || []).map(m => m.id).sort();
    } catch {
      return ANTHROPIC_AVAILABLE_MODELS;
    }
  }

  _classifyError(err) {
    const status = err?.status || err?.response?.status;
    const msg = (err?.message || '').toLowerCase();

    if (status === 401 || msg.includes('authentication') || msg.includes('invalid x-api-key')) {
      return { message: 'API key de Anthropic inválida o incorrecta.', code: 'invalid_key' };
    }
    if (status === 429 || msg.includes('rate limit')) {
      return { message: 'Límite de solicitudes de Anthropic alcanzado. Intenta más tarde.', code: 'rate_limit' };
    }
    if (status === 403 || msg.includes('billing') || msg.includes('credit')) {
      return { message: 'Cuota agotada o problema de facturación en tu cuenta de Anthropic.', code: 'quota_exceeded' };
    }
    if (status === 529 || status === 503 || msg.includes('overloaded') || msg.includes('unavailable')) {
      return { message: 'El servicio de Anthropic no está disponible temporalmente.', code: 'service_unavailable' };
    }
    return { message: err?.message || 'Error desconocido al conectar con Anthropic.', code: 'unknown' };
  }
}
