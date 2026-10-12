import { Mic, Square, MessageSquare, Pause, CheckCircle2, X, Send, Loader2, Sparkles } from 'lucide-react';

const formatTime = (seconds) => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

/**
 * Zona de entrada conversacional de la entrevista: textarea, panel de
 * grabación, micrófono, modo escrito, pausar, terminar, abandonar y enviar.
 * Presentacional: toda la lógica vive en el contenedor (Interviews.jsx).
 */
export default function InterviewChatInput({
  value,
  onChange,
  placeholder,
  isTextMode,
  autoVoiceEnabled = false,
  timeRemaining = 120,
  onToggleTextMode,
  isRecording,
  onToggleRecording,
  micDisabled = false,
  showRecordingPanel,
  recordingSeconds,
  onPause,
  onFinish,
  finishing,
  onAbandon,
  abandoning,
  onSend,
  sendLabel,
  busyLabel,
  sendDisabled,
  controlsDisabled,
  showCompactLoader = false
}) {
  const busy = Boolean(busyLabel);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!sendDisabled) onSend();
    }
  };

  return (
    <>
      <p role="status" className="text-xs text-slate-600 dark:text-slate-300">Tiempo para esta respuesta: {formatTime(timeRemaining)}. Hasta 2 minutos; al agotarse, se envía lo que respondiste o se registra «Sin respuesta». Cinco segundos de silencio después de hablar envían tu respuesta.</p>
      {!isTextMode && (
        <div className="rounded-2xl border border-indigo-200 dark:border-indigo-500/30 bg-indigo-50/70 dark:bg-indigo-950/30 p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between text-left">
          <div className="flex items-center gap-3">
            <button
              onClick={onToggleRecording}
              disabled={controlsDisabled || micDisabled}
              className={`h-14 w-14 rounded-2xl flex items-center justify-center border shadow-sm cursor-pointer transition-all ${isRecording
                ? 'bg-rose-600 border-rose-600 text-white shadow-rose-600/20 hover:bg-rose-700'
                : 'bg-indigo-600 border-indigo-600 text-white shadow-indigo-600/20 hover:bg-indigo-700'
              } disabled:opacity-40 disabled:cursor-not-allowed`}
              title={micDisabled ? 'Micrófono no disponible. Responde por escrito.' : isRecording ? 'Detener dictado' : 'Responder por voz'}
            >
              {isRecording ? <Square className="h-5 w-5 shrink-0" /> : <Mic className="h-5 w-5 shrink-0" />}
            </button>
            <div>
              <span className="text-xs font-black text-slate-900 dark:text-white block">
                {isRecording ? 'Te estoy escuchando' : autoVoiceEnabled ? 'Conversación por voz activa' : 'Activar conversación por voz'}
              </span>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                {micDisabled ? 'Micrófono no disponible. Usa la respuesta escrita.' : isRecording ? 'Habla con naturalidad. El silencio envía tu respuesta. Di «termina la entrevista» para cerrar.' : autoVoiceEnabled ? 'Escucharé automáticamente después de cada pregunta. Di «termina la entrevista» para cerrar.' : 'Activa el micrófono para continuar por voz o elige texto.'}
              </p>
            </div>
          </div>

          <button
            onClick={onToggleTextMode}
            disabled={controlsDisabled}
            className="h-10 px-4 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 border bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700/60 hover:border-indigo-400 dark:hover:border-indigo-500/70 text-slate-600 dark:text-slate-300 hover:text-indigo-650 dark:hover:text-indigo-300 disabled:opacity-40"
          >
            <MessageSquare className="h-3.5 w-3.5" />
            Responder por escrito
          </button>
        </div>
      )}

      {isTextMode && (
        <div className="bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-150 dark:border-indigo-500/40 rounded-xl p-3 flex items-start gap-2.5 text-[10px] text-indigo-700 dark:text-indigo-300 animate-fade-in text-left">
          <Sparkles className="h-4 w-4 shrink-0 text-indigo-650 mt-0.5 animate-pulse" />
          <div>
            <strong>Modo Escrito Activo:</strong> Micrófono apagado. Escribe tu respuesta y pulsa «Enviar respuesta».
          </div>
        </div>
      )}

      {isTextMode && (
        <textarea
          rows={3}
          value={value}
          onChange={onChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl p-3 text-xs md:text-sm focus:outline-none focus:border-indigo-500 focus:bg-white dark:focus:bg-slate-800 leading-relaxed text-left"
        />
      )}

      {/* Panel de grabación con ondas de audio */}
      {showRecordingPanel && (
        <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-150 dark:border-slate-700 rounded-xl p-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-rose-100 text-rose-650 h-8 w-8 rounded-full flex items-center justify-center shrink-0 border border-rose-200 animate-pulse">
              <Mic className="h-4.5 w-4.5" />
            </div>
            <div>
              <span className="text-[9px] text-rose-500 font-extrabold uppercase block tracking-wider animate-pulse">Grabación de Audio Activa</span>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="h-3 w-1 bg-rose-500 rounded-full animate-bounce shrink-0"></span>
                <span className="h-5 w-1 bg-rose-500 rounded-full animate-bounce shrink-0" style={{ animationDelay: '0.15s' }}></span>
                <span className="h-2 w-1 bg-rose-500 rounded-full animate-bounce shrink-0" style={{ animationDelay: '0.3s' }}></span>
                <span className="h-4 w-1 bg-rose-500 rounded-full animate-bounce shrink-0" style={{ animationDelay: '0.45s' }}></span>
                <span className="h-3 w-1 bg-rose-500 rounded-full animate-bounce shrink-0" style={{ animationDelay: '0.6s' }}></span>
              </div>
            </div>
          </div>

          <span className="font-mono text-xs font-bold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/60 px-3 py-1 rounded-lg">
            {formatTime(recordingSeconds)}
          </span>
        </div>
      )}

      {showCompactLoader && (
        <div className="inline-flex w-fit items-center gap-2 rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-[10px] font-bold text-slate-500 dark:text-slate-400">
          <Loader2 className="h-3 w-3 animate-spin text-indigo-500" />
          La entrevistadora está analizando tu respuesta...
        </div>
      )}

      {/* Botones de operación */}
      <div className="flex flex-wrap justify-between items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
        <div className="flex flex-wrap items-center gap-2">
          {isTextMode && !micDisabled && (
            <button
              onClick={onToggleTextMode}
              disabled={controlsDisabled}
              className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/60 hover:border-indigo-400 dark:hover:border-indigo-500/70 text-slate-500 dark:text-slate-400 hover:text-indigo-650 dark:hover:text-indigo-300 h-10 px-4 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-40"
            >
              <Mic className="h-3.5 w-3.5" />
              Volver a voz
            </button>
          )}

          <button
            onClick={onPause}
            disabled={controlsDisabled}
            className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/60 hover:border-indigo-400 dark:hover:border-indigo-500/70 text-slate-500 dark:text-slate-400 hover:text-indigo-650 dark:hover:text-indigo-300 h-10 px-4 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-40 disabled:dark:bg-slate-800 disabled:dark:text-slate-500"
          >
            <Pause className="h-3.5 w-3.5" />
            Pausar entrevista
          </button>

          <button
            onClick={onFinish}
            disabled={finishing || controlsDisabled}
            className="bg-white dark:bg-slate-800 border border-emerald-200 dark:border-emerald-500/40 hover:border-emerald-400 dark:hover:border-emerald-400 text-emerald-600 dark:text-emerald-300 hover:text-emerald-700 dark:hover:text-emerald-200 h-10 px-4 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-40 disabled:dark:bg-slate-800 disabled:dark:text-slate-500"
            title="Terminar ahora y ver el feedback de lo respondido"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            {finishing ? 'Finalizando…' : 'Terminar ahora'}
          </button>

          <button
            onClick={onAbandon}
            disabled={abandoning || finishing}
            className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/60 hover:border-red-300 dark:hover:border-red-500/60 text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 h-10 px-4 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-40 disabled:dark:bg-slate-800 disabled:dark:text-slate-500"
            title="Descartar esta entrevista sin guardar resultados"
          >
            <X className="h-3.5 w-3.5" />
            {abandoning ? 'Descartando…' : 'Descartar entrevista'}
          </button>
        </div>

        <button
          onClick={onSend}
          disabled={sendDisabled}
          className="bg-indigo-650 hover:bg-indigo-700 text-white font-bold px-6 py-2.5 rounded-xl text-xs flex items-center gap-2 shadow-md shadow-indigo-650/10 cursor-pointer disabled:opacity-40 disabled:dark:bg-slate-800 disabled:dark:text-slate-500 disabled:dark:border disabled:dark:border-slate-700/60"
        >
          {busy ? (
            <>
              {busyLabel}
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            </>
          ) : (
            <>
              {sendLabel}
              <Send className="h-3.5 w-3.5" />
            </>
          )}
        </button>
      </div>
    </>
  );
}
