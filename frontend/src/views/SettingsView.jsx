import React, { useState, useEffect } from 'react';
import { Settings, Sparkles, Key, CheckCircle2, AlertCircle, Loader2, Save, Trash2, Cpu, User, Shield, Info, Download, Volume2, Play, Power } from 'lucide-react';
import { apiRequest } from '../utils/api';
import { supabase } from '../utils/supabaseClient';
import { useNotification } from '../components/common/NotificationContext';
import { mapError } from '../utils/errorMapper';
import { getSpanishVoices, pickVoiceByPreference, VOICE_URI_KEY, VOICE_PREF_KEY, VOICE_PREFERENCES } from '../utils/interviewVoice';

const PROVIDER_MODELS = {
  openai: [
    { id: 'gpt-4o-mini', label: 'GPT-4o mini', desc: 'Rápido y eficiente (modelo recomendado)', available: true },
    { id: 'gpt-4o', label: 'GPT-4o', desc: 'Mayor precisión y contexto', available: true },
    { id: 'gpt-4.1-mini', label: 'GPT-4.1 mini', desc: 'Próxima generación optimizada', available: true },
    { id: 'gpt-4-turbo', label: 'GPT-4 Turbo', desc: 'Modelo avanzado heredado', available: true }
  ],
  anthropic: [
    { id: 'claude-opus-4-8', label: 'Claude Opus 4.8', desc: 'Máxima capacidad (recomendado)', available: true },
    { id: 'claude-sonnet-5', label: 'Claude Sonnet 5', desc: 'Gran equilibrio velocidad / calidad', available: true },
    { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', desc: 'Rápido y económico', available: true }
  ],
  gemini: [
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', desc: 'Rápido y eficiente (recomendado)', available: true },
    { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', desc: 'Mayor capacidad de razonamiento', available: true },
    { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', desc: 'Generación anterior, muy rápido', available: true }
  ]
};

const DEFAULT_MODEL = {
  openai: 'gpt-4o-mini',
  anthropic: 'claude-opus-4-8',
  gemini: 'gemini-2.5-flash'
};

const KEY_PLACEHOLDER = {
  openai: 'sk-...',
  anthropic: 'sk-ant-...',
  gemini: 'AIza...'
};

const AI_MODES = [
  { id: 'fast', label: 'Rápido', desc: 'Respuesta inmediata (T: 0.3)' },
  { id: 'balanced', label: 'Equilibrado', desc: 'Balance óptimo (T: 0.7)' },
  { id: 'detailed', label: 'Detallado', desc: 'Creativo y extenso (T: 1.0)' }
];

const PROVIDERS = [
  { id: 'openai', label: 'OpenAI', icon: 'GPT' },
  { id: 'anthropic', label: 'Anthropic Claude', icon: 'CLA' },
  { id: 'gemini', label: 'Google Gemini', icon: 'GEM' }
];

const VOICE_TEST_PHRASE = 'Hola, soy tu entrevistadora virtual de EmpleaIA. Así sonará mi voz durante la simulación.';

export default function SettingsView({ user, profile }) {
  const { toast, showConfirm } = useNotification();
  const [allCredentials, setAllCredentials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorCode, setErrorCode] = useState(null);

  // Privacidad y datos (HU09 / HU10)
  const [exporting, setExporting] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Form state
  const [apiKey, setApiKey] = useState('');
  const [selectedProvider, setSelectedProvider] = useState('openai');
  const [selectedModel, setSelectedModel] = useState(DEFAULT_MODEL.openai);
  const [selectedMode, setSelectedMode] = useState('balanced');

  // UI state
  const [verifying, setVerifying] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activating, setActivating] = useState(false);
  const [message, setMessage] = useState(null);
  const [verifyFailed, setVerifyFailed] = useState(false);

  // Voz de la entrevistadora IA
  const [availableVoices, setAvailableVoices] = useState([]);
  const [voicePref, setVoicePref] = useState(() => localStorage.getItem(VOICE_PREF_KEY) || 'auto');
  const [voiceURI, setVoiceURI] = useState(() => localStorage.getItem(VOICE_URI_KEY) || '');
  const [testingVoice, setTestingVoice] = useState(false);

  // Credencial del proveedor actualmente seleccionado en la UI
  const credentials = allCredentials.find(c => c.provider === selectedProvider) || null;
  const activeCredential = allCredentials.find(c => c.is_active) || null;
  const providerLabel = PROVIDERS.find(p => p.id === selectedProvider)?.label || selectedProvider;

  useEffect(() => {
    if (user?.id) {
      fetchCredentials();
    }
  }, [user?.id]);

  // Cargar voces del navegador para el selector
  useEffect(() => {
    if (!window.speechSynthesis) return;
    const loadVoices = () => setAvailableVoices(window.speechSynthesis.getVoices());
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
    return () => {
      if (window.speechSynthesis) window.speechSynthesis.onvoiceschanged = null;
      window.speechSynthesis.cancel();
    };
  }, []);

  const fetchCredentials = async () => {
    try {
      setErrorCode(null);
      const data = await apiRequest('/ai-credentials', 'GET');

      if (data.success && Array.isArray(data.credentials)) {
        setAllCredentials(data.credentials);
        const current = data.credentials.find(c => c.provider === selectedProvider);
        if (current) {
          setSelectedModel(current.default_model || DEFAULT_MODEL[selectedProvider]);
          setSelectedMode(current.generation_mode || 'balanced');
        }
      }
    } catch (err) {
      console.warn('[SettingsView] Error al cargar credenciales:', err.message);
      if (err.code) {
        setErrorCode(err.code);
      } else if (err.message?.includes('Failed to fetch') || err.message?.toLowerCase().includes('network') || err.message?.toLowerCase().includes('connect')) {
        setErrorCode('NETWORK_ERROR');
      } else {
        setErrorCode('UNKNOWN_ERROR');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSelectProvider = (providerId) => {
    if (providerId === selectedProvider) return;
    setSelectedProvider(providerId);
    setApiKey('');
    setMessage(null);
    setVerifyFailed(false);
    const cred = allCredentials.find(c => c.provider === providerId);
    setSelectedModel(cred?.default_model || DEFAULT_MODEL[providerId]);
    setSelectedMode(cred?.generation_mode || 'balanced');
  };

  const handleVerify = async () => {
    if (!apiKey) return;
    setVerifying(true);
    setMessage(null);

    try {
      const data = await apiRequest('/ai-credentials/verify', 'POST', {
        provider: selectedProvider,
        apiKey
      });
      if (data.success) {
        setVerifyFailed(false);
        setMessage({ type: 'success', text: `Conexión con ${providerLabel} verificada correctamente.` });
      } else {
        setVerifyFailed(true);
        setMessage({ type: 'error', text: data.error || data.message || 'Fallo de verificación.' });
      }
    } catch (err) {
      setVerifyFailed(true);
      setMessage({ type: 'error', text: err.message || 'Error al conectar con el servidor de verificación.' });
    } finally {
      setVerifying(false);
    }
  };

  const handleSave = async () => {
    if (!apiKey && !credentials) return;
    setSaving(true);
    setMessage(null);

    try {
      const payload = {
        provider: selectedProvider,
        defaultModel: selectedModel,
        generationMode: selectedMode
      };

      if (apiKey) payload.apiKey = apiKey;

      const endpoint = credentials ? `/ai-credentials/${selectedProvider}` : '/ai-credentials';
      const method = credentials ? 'PUT' : 'POST';

      const data = await apiRequest(endpoint, method, payload);
      if (data.success) {
        setMessage({ type: 'success', text: 'Configuración guardada correctamente.' });
        setApiKey(''); // Limpiar key en claro
        setVerifyFailed(false);
        await fetchCredentials();
      } else {
        setMessage({ type: 'error', text: data.error || 'Error al guardar.' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'Error al conectar con el servidor.' });
    } finally {
      setSaving(false);
    }
  };

  const handleActivate = async () => {
    if (!credentials) return;
    setActivating(true);
    try {
      const data = await apiRequest(`/ai-credentials/${selectedProvider}/activate`, 'PUT');
      if (data.success) {
        toast.success(`${providerLabel} es ahora tu proveedor de IA activo.`);
        await fetchCredentials();
      } else {
        toast.error(data.error || 'No se pudo activar el proveedor.');
      }
    } catch (err) {
      toast.error(mapError(err));
    } finally {
      setActivating(false);
    }
  };

  const handleDelete = () => {
    showConfirm({
      title: '¿Eliminar API Key?',
      message: `¿Seguro que deseas eliminar tu API Key de ${providerLabel}? EmpleaIA usará la cuota gratuita del servidor.`,
      onConfirm: async () => {
        try {
          const res = await apiRequest(`/ai-credentials/${selectedProvider}`, 'DELETE');
          if (res.success) {
            setApiKey('');
            toast.success('Credenciales de IA eliminadas correctamente.');
            await fetchCredentials();
          }
        } catch (err) {
          console.error(err);
          toast.error(mapError(err));
        }
      }
    });
  };

  // ─── Voz de la entrevistadora ─────────────────────────────────────────────
  const spanishVoices = getSpanishVoices(availableVoices);

  const persistVoice = (uri) => {
    setVoiceURI(uri);
    if (uri) localStorage.setItem(VOICE_URI_KEY, uri);
  };

  const handleVoicePref = (pref) => {
    setVoicePref(pref);
    localStorage.setItem(VOICE_PREF_KEY, pref);
    const best = pickVoiceByPreference(availableVoices, pref);
    if (best?.voiceURI) persistVoice(best.voiceURI);
  };

  const handleTestVoice = () => {
    if (!window.speechSynthesis) {
      toast.error('Tu navegador no soporta síntesis de voz.');
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(VOICE_TEST_PHRASE);
    const voice = availableVoices.find(v => v.voiceURI === voiceURI)
      || pickVoiceByPreference(availableVoices, voicePref);
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang || 'es-ES';
    } else {
      utterance.lang = 'es-ES';
    }
    utterance.rate = 0.92;
    utterance.onstart = () => setTestingVoice(true);
    utterance.onend = () => setTestingVoice(false);
    utterance.onerror = () => setTestingVoice(false);
    window.speechSynthesis.speak(utterance);
  };

  // HU10: exportar todos mis datos en JSON
  const handleExportData = async () => {
    setExporting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const backend = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000/api';
      const res = await fetch(`${backend}/account/export/${user.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('No se pudieron exportar tus datos.');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'empleaia_mis_datos.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setMessage({ type: 'success', text: 'Descarga de tus datos iniciada.' });
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'No se pudieron exportar tus datos.' });
    } finally {
      setExporting(false);
    }
  };

  // HU10: eliminar todos mis datos y cerrar sesión
  const handleDeleteAccount = async () => {
    setDeletingAccount(true);
    try {
      await apiRequest(`/account/${user.id}`, 'DELETE');
      await supabase.auth.signOut(); // onAuthStateChange redirige al login
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'No se pudieron eliminar tus datos.' });
      setDeletingAccount(false);
      setConfirmDelete(false);
    }
  };

  // Estado visible del proveedor seleccionado en el panel de configuración
  const providerStatus = verifyFailed
    ? { label: 'Error de conexión', cls: 'bg-red-50 text-red-700 border-red-200' }
    : credentials?.is_active
      ? { label: 'Activo', cls: 'bg-indigo-600 text-white border-indigo-600' }
      : credentials
        ? { label: 'Configurado', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' }
        : { label: 'No configurado', cls: 'bg-slate-100 text-slate-500 border-slate-200' };

  const providerBadge = (providerId) => {
    const cred = allCredentials.find(c => c.provider === providerId);
    if (cred?.is_active) return { label: 'Activo', cls: 'bg-indigo-600 text-white shadow-sm' };
    if (cred) return { label: 'Configurado', cls: 'bg-emerald-100 text-emerald-700 border border-emerald-200' };
    return { label: 'Requiere API Key', cls: 'bg-slate-200 text-slate-500 border border-slate-300' };
  };

  if (loading) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-slate-50">
        <div className="text-center space-y-2">
          <Loader2 className="h-8 w-8 text-indigo-600 animate-spin mx-auto" />
          <p className="text-xs text-slate-500 font-bold">Cargando preferencias...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-full overflow-y-auto bg-slate-50 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="mx-auto w-full max-w-[1600px] space-y-8">
        {errorCode === 'BYOK_MIGRATION_MISSING' && (
          <div className="bg-amber-50 border border-amber-250 rounded-2xl p-4 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-bold text-amber-800">Configuración BYOK pendiente de migración en Supabase</p>
              <p className="text-[10px] text-amber-655 leading-relaxed mt-0.5">
                Las tablas de credenciales de IA no existen en tu base de datos. Copia y ejecuta el script en <code className="bg-amber-100 px-1 py-0.5 rounded font-mono">supabase/migration_v5.sql</code> en el SQL Editor de tu Supabase Cloud para poder guardar API Keys.
              </p>
            </div>
          </div>
        )}

        {errorCode === 'BYOK_PERMISSION_ERROR' && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-650 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-bold text-red-800">Acceso denegado</p>
              <p className="text-[10px] text-red-600 leading-relaxed mt-0.5">
                No tienes permisos para leer tus credenciales de IA. Verifica las políticas RLS en tu Supabase.
              </p>
            </div>
          </div>
        )}

        {errorCode === 'AUTH_REQUIRED' && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-655 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-bold text-red-800">Sesión requerida</p>
              <p className="text-[10px] text-red-600 leading-relaxed mt-0.5">
                Debes iniciar sesión nuevamente para configurar tus credenciales de IA.
              </p>
            </div>
          </div>
        )}

        {errorCode === 'NETWORK_ERROR' && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-bold text-red-800">Servidor fuera de línea</p>
              <p className="text-[10px] text-red-600 leading-relaxed mt-0.5">
                No pudimos establecer conexión con el backend de EmpleaIA. La configuración local está activa, pero no se pueden verificar ni guardar claves en la nube de Supabase.
              </p>
            </div>
          </div>
        )}

        {errorCode === 'UNKNOWN_ERROR' && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-bold text-red-800">Error inesperado</p>
              <p className="text-[10px] text-red-650 leading-relaxed mt-0.5">
                Ocurrió un error al cargar la configuración de IA. Por favor, reintenta o contacta a soporte.
              </p>
            </div>
          </div>
        )}

        {/* Layout de Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">

          {/* Columna Izquierda: Información de Cuenta y Proveedores */}
          <div className="space-y-8 lg:col-span-1">

            {/* Card A: Cuenta de Usuario */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-5">
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2 flex items-center gap-2">
                <User className="h-4 w-4 text-indigo-600" />
                Cuenta de Usuario
              </h3>

              <div className="space-y-4">
                <div>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Nombre completo</p>
                  <p className="text-sm font-black text-slate-900 mt-0.5">
                    {profile ? `${profile.first_name} ${profile.last_name}` : 'Usuario EmpleaIA'}
                  </p>
                </div>

                <div>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Perfil profesional</p>
                  <p className="text-xs text-slate-600 font-medium mt-0.5">
                    {profile?.target_role || 'No definido'}
                  </p>
                </div>

                <div>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Correo electrónico</p>
                  <p className="text-xs text-slate-600 font-mono break-all mt-0.5">
                    {user?.email || '—'}
                  </p>
                </div>

                <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-[10px] text-slate-450 font-bold">Estado</span>
                  <span className="bg-emerald-50 text-emerald-700 border border-emerald-100 text-[10px] font-black px-2.5 py-0.5 rounded-lg flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Sesión Activa
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-450 font-bold">Proveedor de Auth</span>
                  <span className="bg-indigo-50 text-indigo-700 border border-indigo-100 text-[10px] font-bold px-2 py-0.5 rounded-lg">
                    Supabase Auth
                  </span>
                </div>
              </div>
            </div>

            {/* Card B: Cuentas de IA (BYOK) - Estado del Proveedor */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2 flex items-center gap-2">
                <Cpu className="h-4 w-4 text-indigo-600" />
                Proveedores de IA
              </h3>

              <div className="space-y-3">
                {PROVIDERS.map(p => {
                  const badge = providerBadge(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handleSelectProvider(p.id)}
                      className={`w-full p-3.5 rounded-xl border flex items-center justify-between transition-all cursor-pointer text-left ${p.id === selectedProvider
                          ? 'border-indigo-500 bg-indigo-50/20 ring-1 ring-indigo-500/20'
                          : 'border-slate-200 bg-slate-50/50 hover:border-indigo-300'
                        }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-7 w-7 rounded-lg bg-slate-900 text-white font-black text-[9px] flex items-center justify-center shadow-sm">
                          {p.icon}
                        </div>
                        <span className="text-xs font-black text-slate-900">{p.label}</span>
                      </div>
                      <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-md ${badge.cls}`}>
                        {badge.label}
                      </span>
                    </button>
                  );
                })}
              </div>

              <p className="text-[10px] text-slate-450 leading-normal flex items-start gap-1.5">
                <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                Selecciona un proveedor para configurar su API Key y modelo. El proveedor "Activo" es el que usan todos los módulos de IA.
              </p>
            </div>

          </div>

          {/* Columna Derecha: Configuración API Key, Modelo, y Modo */}
          <div className="space-y-8 lg:col-span-2">

            {/* Card C + D + E: Preferencias y API Key */}
            <div className="rounded-2xl border border-indigo-150 bg-white shadow-sm overflow-hidden">
              <div className="bg-indigo-50/40 p-6 border-b border-indigo-100">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="h-9 w-9 rounded-lg bg-indigo-600 flex items-center justify-center shadow-sm shadow-indigo-300">
                      <Sparkles className="h-4.5 w-4.5 text-white" />
                    </div>
                    <div>
                      <h3 className="text-sm font-black text-slate-900">Cuentas de IA (Bring Your Own Key)</h3>
                      <p className="text-[10px] text-slate-400 mt-0.5">Configurando: <strong className="text-indigo-600">{providerLabel}</strong>. Conecta tu propia API Key para usar tus límites y modelos.</p>
                    </div>
                  </div>
                  <span className={`text-[9px] font-black uppercase px-2.5 py-1 rounded-lg border shrink-0 ${providerStatus.cls}`}>
                    {providerStatus.label}
                  </span>
                </div>
              </div>

              <div className="p-6 space-y-6">

                {/* Input de API Key */}
                <div className="space-y-2">
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider">
                    API Key de {providerLabel}
                  </label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Key className="h-4 w-4 text-slate-450" />
                      </div>
                      <input
                        type="password"
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        placeholder={credentials ? credentials.masked_api_key : KEY_PLACEHOLDER[selectedProvider]}
                        disabled={!!errorCode}
                        className="block w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-indigo-500 focus:border-indigo-500 bg-white disabled:bg-slate-50"
                      />
                    </div>
                    {apiKey && (
                      <button
                        onClick={handleVerify}
                        disabled={verifying || !!errorCode}
                        className="px-4 py-2 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 text-xs font-bold rounded-lg border border-slate-350 flex items-center gap-1.5 transition-colors"
                      >
                        {verifying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                        Probar conexión
                      </button>
                    )}
                  </div>
                  {credentials && !apiKey && (
                    <p className="text-[10px] text-emerald-600 font-bold flex items-center gap-1.5">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Conectado ({new Date(credentials.updated_at).toLocaleDateString()})
                    </p>
                  )}
                  {!credentials && !apiKey && !errorCode && (
                    <p className="text-[10px] text-slate-500 font-bold flex items-center gap-1.5">
                      <Info className="h-3.5 w-3.5 text-slate-400" />
                      No hay credenciales configuradas para {providerLabel} todavía.
                    </p>
                  )}
                </div>

                {message && (
                  <div className={`p-3 rounded-xl text-xs font-bold flex items-center gap-2 border ${message.type === 'success' ? 'bg-emerald-50 text-emerald-700 border-emerald-250' : 'bg-red-50 text-red-700 border-red-250'
                    }`}>
                    {message.type === 'success' ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                    {message.text}
                  </div>
                )}

                {/* Card D: Modelo preferido (según proveedor seleccionado) */}
                <div className="space-y-2.5 pt-6 border-t border-slate-100">
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider">
                    Modelo preferido — {providerLabel}
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {(PROVIDER_MODELS[selectedProvider] || []).map(m => (
                      <button
                        key={m.id}
                        type="button"
                        disabled={!m.available || !!errorCode}
                        onClick={() => setSelectedModel(m.id)}
                        className={`relative text-left p-3.5 rounded-xl border flex flex-col transition-all duration-200 ${!m.available
                            ? 'opacity-40 bg-slate-50 border-slate-250 cursor-not-allowed'
                            : selectedModel === m.id
                              ? 'border-indigo-500 bg-indigo-50/30 ring-2 ring-indigo-500/10'
                              : 'border-slate-200 hover:bg-slate-50/50'
                          }`}
                      >
                        <span className="text-xs font-black text-slate-900">{m.label}</span>
                        <span className="text-[10px] text-slate-500 mt-0.5 leading-normal">{m.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Card E: Modo de generación */}
                <div className="space-y-2.5 pt-6 border-t border-slate-100">
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider">
                    Modo de generación
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {AI_MODES.map(m => (
                      <button
                        key={m.id}
                        type="button"
                        disabled={!!errorCode}
                        onClick={() => setSelectedMode(m.id)}
                        className={`text-left p-3.5 rounded-xl border flex flex-col transition-all duration-200 ${selectedMode === m.id
                            ? 'border-indigo-500 bg-indigo-50/30 ring-2 ring-indigo-500/10'
                            : 'border-slate-200 hover:bg-slate-50/50'
                          }`}
                      >
                        <span className="text-xs font-black text-slate-900">{m.label}</span>
                        <span className="text-[10px] text-slate-500 mt-0.5 leading-normal">{m.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Botones de acción inferior */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-6 border-t border-slate-100">
                  <div className="flex items-center gap-2">
                    {credentials && (
                      <button
                        onClick={handleDelete}
                        disabled={!!errorCode}
                        className="px-4 py-2 text-red-600 hover:bg-red-50 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5"
                      >
                        <Trash2 className="h-4 w-4" />
                        Eliminar clave
                      </button>
                    )}
                    {credentials && !credentials.is_active && (
                      <button
                        onClick={handleActivate}
                        disabled={activating || !!errorCode}
                        className="px-4 py-2 bg-white border border-indigo-200 hover:border-indigo-400 text-indigo-600 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-50"
                      >
                        {activating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Power className="h-4 w-4" />}
                        Usar como proveedor activo
                      </button>
                    )}
                    {credentials?.is_active && (
                      <span className="px-3 py-2 text-[10px] font-black uppercase text-indigo-600 bg-indigo-50 border border-indigo-150 rounded-lg flex items-center gap-1.5">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Proveedor activo
                      </span>
                    )}
                  </div>

                  <button
                    onClick={handleSave}
                    disabled={saving || (!apiKey && !credentials) || !!errorCode}
                    className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg shadow-sm transition-colors flex items-center gap-2"
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Guardar Configuración
                  </button>
                </div>

              </div>
            </div>

          </div>
        </div>

        {/* Card F: Uso de IA por módulo */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
            <Shield className="h-4.5 w-4.5 text-indigo-600" />
            <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest">
              Uso de IA por módulo
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {['Currículum Vitae', 'Carta de Presentación', 'Entrevistas Simuladas', 'Retroalimentación'].map(label => (
              <div key={label} className="p-4 rounded-xl border border-slate-150 bg-slate-50/50 space-y-1 text-left">
                <p className="text-[10px] text-slate-450 font-extrabold uppercase tracking-wide">{label}</p>
                <p className="text-xs font-black text-slate-900">
                  {activeCredential?.default_model || 'GPT-4o mini'}
                </p>
                <p className="text-[9px] text-slate-500 font-medium">
                  Proveedor: {activeCredential
                    ? (PROVIDERS.find(p => p.id === activeCredential.provider)?.label || activeCredential.provider)
                    : 'OpenAI (cuota del servidor)'}
                </p>
              </div>
            ))}
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center gap-2.5 text-[10px] text-slate-500 leading-normal">
            <Info className="h-4 w-4 text-slate-450 shrink-0" />
            <span>
              Todos los módulos usan el proveedor de IA que marques como "Activo". La transcripción de voz (Whisper) sigue usando OpenAI porque los demás proveedores no ofrecen ese servicio.
            </span>
          </div>
        </div>

        {/* Card: Voz de la entrevistadora IA */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
            <Volume2 className="h-4.5 w-4.5 text-indigo-650" />
            <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest">
              Voz de la entrevistadora IA
            </h3>
          </div>

          {!window.speechSynthesis || spanishVoices.length === 0 ? (
            <p className="text-[11px] text-slate-500 leading-relaxed flex items-start gap-2">
              <Info className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
              {!window.speechSynthesis
                ? 'Tu navegador no soporta síntesis de voz, por lo que el lector de preguntas no está disponible.'
                : 'Tu navegador aún no expone voces en español. Recarga la página o revisa la configuración de voz del sistema.'}
            </p>
          ) : (
            <div className="space-y-4">
              {/* Selector de voz + probar */}
              <div className="flex flex-col sm:flex-row gap-2">
                <select
                  value={voiceURI}
                  onChange={(e) => persistVoice(e.target.value)}
                  className="flex-1 px-3 py-2 border border-slate-350 rounded-xl text-xs bg-white text-slate-900 font-semibold focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-55 focus:outline-none"
                >
                  {!voiceURI && <option value="">Selecciona una voz…</option>}
                  {spanishVoices.map(v => (
                    <option key={v.voiceURI} value={v.voiceURI}>
                      {v.name} ({v.lang})
                    </option>
                  ))}
                </select>
                <button
                  onClick={handleTestVoice}
                  disabled={testingVoice}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-sm transition-colors flex items-center justify-center gap-2 shrink-0 cursor-pointer"
                >
                  {testingVoice ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  {testingVoice ? 'Reproduciendo…' : 'Probar voz'}
                </button>
              </div>

              <p className="text-[11px] text-slate-400 leading-normal font-medium">
                Las voces disponibles dependen de tu navegador y sistema operativo. La voz elegida se usará en el módulo de Entrevistas cuando la entrevistadora lea las preguntas.
              </p>
            </div>
          )}
        </div>

        {/* Card G: Privacidad y mis datos (HU09 / HU10) */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
            <Shield className="h-4.5 w-4.5 text-indigo-600" />
            <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest">
              Privacidad y mis datos
            </h3>
          </div>

          {/* HU09: cómo se gestionan los datos */}
          <div className="space-y-2 text-[11px] text-slate-500 leading-relaxed">
            <p><strong className="text-slate-700">Cómo se gestionan tus datos.</strong> Tu información (perfil, CVs, cartas y entrevistas) se almacena de forma segura en una base de datos gestionada (Supabase). El acceso está protegido con políticas de seguridad a nivel de fila (RLS): solo tú puedes leer o modificar tus registros.</p>
            <p>Si conectas tu propia API key de IA, se guarda <strong className="text-slate-700">cifrada con AES-256-GCM</strong> y nunca se muestra ni se exporta en claro. El contenido que generas se procesa mediante modelos de lenguaje para producir tus documentos y retroalimentación.</p>
            <p>Conforme a la Ley N.º 29733 de Protección de Datos Personales, puedes exportar o eliminar tus datos en cualquier momento.</p>
          </div>

          {/* HU10: exportar / eliminar */}
          <div className="flex flex-col sm:flex-row gap-3 pt-2 border-t border-slate-100">
            <button
              onClick={handleExportData}
              disabled={exporting}
              className="flex-1 px-4 py-2.5 bg-white border border-slate-200 hover:border-indigo-400 text-slate-700 hover:text-indigo-600 text-xs font-bold rounded-xl transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Exportar mis datos (JSON)
            </button>

            {!confirmDelete ? (
              <button
                onClick={() => setConfirmDelete(true)}
                className="flex-1 px-4 py-2.5 bg-white border border-red-200 hover:border-red-400 text-red-600 text-xs font-bold rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                <Trash2 className="h-4 w-4" />
                Eliminar mis datos
              </button>
            ) : (
              <div className="flex-1 flex items-center gap-2">
                <button
                  onClick={handleDeleteAccount}
                  disabled={deletingAccount}
                  className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {deletingAccount ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  Confirmar
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  disabled={deletingAccount}
                  className="px-4 py-2.5 bg-white border border-slate-200 text-slate-600 text-xs font-bold rounded-xl"
                >
                  Cancelar
                </button>
              </div>
            )}
          </div>

          {confirmDelete && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-start gap-2.5 text-[10px] text-red-700 leading-normal">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>Esto eliminará permanentemente tu perfil, CVs, cartas y entrevistas. La acción no se puede deshacer y se cerrará tu sesión.</span>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
