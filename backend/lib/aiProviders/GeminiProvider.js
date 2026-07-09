/**
 * GeminiProvider.js — Implementación del proveedor Google Gemini.
 *
 * Implementa la interfaz BaseProvider para que AIProviderService
 * pueda usarlo de forma intercambiable con otros proveedores.
 * Usa el SDK oficial @google/genai (sucesor de @google/generative-ai).
 */

import { GoogleGenAI } from '@google/genai';
import { BaseProvider } from './BaseProvider.js';

// Modelos disponibles para selección del usuario
export const GEMINI_AVAILABLE_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.5-pro',
  'gemini-2.0-flash',
];

const DEFAULT_MODEL = 'gemini-2.5-flash';

export class GeminiProvider extends BaseProvider {
  name = 'gemini';

  _buildClient(apiKey) {
    return new GoogleGenAI({ apiKey });
  }

  /**
   * Genera texto usando la API de Gemini.
   * @returns {Promise<{ content: string, usage: object }>}
   */
  async generateText({ apiKey, model, messages, temperature = 0.7, maxTokens, jsonMode = false }) {
    const ai = this._buildClient(apiKey);

    // Gemini recibe la instrucción de sistema aparte y el resto como contents.
    const systemInstruction = messages
      .filter(m => m.role === 'system')
      .map(m => m.content)
      .join('\n\n') || undefined;

    const contents = messages
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
      }));

    const config = { temperature };
    if (systemInstruction) config.systemInstruction = systemInstruction;
    if (maxTokens) config.maxOutputTokens = maxTokens;
    if (jsonMode) config.responseMimeType = 'application/json';

    console.log(`[GeminiProvider] generateText → modelo: ${model || DEFAULT_MODEL}, mensajes: ${contents.length}`);

    const response = await ai.models.generateContent({
      model: model || DEFAULT_MODEL,
      contents,
      config
    });

    const usage = response.usageMetadata || {};
    return {
      content: response.text || '',
      usage: {
        prompt_tokens: usage.promptTokenCount,
        completion_tokens: usage.candidatesTokenCount,
        total_tokens: usage.totalTokenCount
      }
    };
  }

  /**
   * Verifica que la API key de Gemini es válida listando modelos.
   * @returns {Promise<{ ok: boolean, error?: string, models?: string[] }>}
   */
  async verifyConnection({ apiKey }) {
    if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length < 20) {
      return { ok: false, error: 'La API key proporcionada parece inválida o está vacía.' };
    }

    try {
      const ai = this._buildClient(apiKey);
      const pager = await ai.models.list();
      const models = [];
      for await (const m of pager) {
        const id = (m.name || '').replace(/^models\//, '');
        if (id.startsWith('gemini-')) models.push(id);
        if (models.length >= 50) break;
      }
      console.log(`[GeminiProvider] verifyConnection → OK. Modelos Gemini disponibles: ${models.length}`);
      return { ok: true, models: models.sort() };
    } catch (err) {
      const errorInfo = this._classifyError(err);
      console.warn(`[GeminiProvider] verifyConnection → FALLO: ${errorInfo.message}`);
      return { ok: false, error: errorInfo.message };
    }
  }

  async listModels({ apiKey }) {
    try {
      const result = await this.verifyConnection({ apiKey });
      return result.ok && result.models?.length ? result.models : GEMINI_AVAILABLE_MODELS;
    } catch {
      return GEMINI_AVAILABLE_MODELS;
    }
  }

  _classifyError(err) {
    const status = err?.status || err?.response?.status || err?.error?.code;
    const msg = (err?.message || '').toLowerCase();

    if (status === 400 && msg.includes('api key not valid')) {
      return { message: 'API key de Google Gemini inválida o incorrecta.', code: 'invalid_key' };
    }
    if (status === 401 || status === 403 || msg.includes('permission') || msg.includes('unauthenticated')) {
      return { message: 'API key de Google Gemini inválida o sin permisos.', code: 'invalid_key' };
    }
    if (status === 429 || msg.includes('quota') || msg.includes('rate limit') || msg.includes('resource_exhausted')) {
      return { message: 'Cuota o límite de solicitudes de Gemini alcanzado. Intenta más tarde.', code: 'rate_limit' };
    }
    if (status === 503 || msg.includes('unavailable') || msg.includes('overloaded')) {
      return { message: 'El servicio de Google Gemini no está disponible temporalmente.', code: 'service_unavailable' };
    }
    return { message: err?.message || 'Error desconocido al conectar con Google Gemini.', code: 'unknown' };
  }
}
