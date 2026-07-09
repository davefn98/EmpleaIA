import React, { useState, useEffect, useRef } from 'react';
import { X, Sparkles, Loader2, Upload, FileText, AlertCircle } from 'lucide-react';
import { apiUpload } from '../../utils/api';

const ALLOWED_EXTENSIONS = ['pdf', 'docx', 'txt'];
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  '' // Algunos navegadores/OS no reportan MIME para archivos locales.
];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

const IMPORT_ERROR_MESSAGES = {
  UNSUPPORTED_FORMAT: 'Formato no válido. Solo se permiten archivos PDF, DOCX o TXT.',
  FILE_TOO_LARGE: 'El archivo supera el límite de 5 MB.',
  NO_TEXT_EXTRACTED: 'No se pudo extraer texto automáticamente. Intenta subir un PDF con texto seleccionable o copia el contenido manualmente.',
  TEXT_TOO_SHORT: 'El texto del CV es demasiado corto para extraer datos. Intenta pegar más contenido del documento.',
  BAD_REQUEST: 'Adjunta un archivo PDF, DOCX o TXT, o pega el contenido de tu CV.'
};

/**
 * Modal flotante para importar un CV con IA (PDF, DOCX, TXT o texto pegado).
 * Solo autocompleta el formulario del CV actual: nunca modifica el perfil.
 */
export default function ImportCvModal({ open, onClose, onParsed }) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [pastedText, setPastedText] = useState('');
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);
  const parsingRef = useRef(false);

  useEffect(() => { parsingRef.current = parsing; }, [parsing]);

  // Cerrar con Escape (deshabilitado mientras se procesa)
  useEffect(() => {
    if (!open) return;
    const handleKey = (e) => {
      if (e.key === 'Escape' && !parsingRef.current) onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  // Limpiar estado interno cada vez que se abre
  useEffect(() => {
    if (open) {
      setSelectedFile(null);
      setPastedText('');
      setParsing(false);
      setError('');
    }
  }, [open]);

  if (!open) return null;

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');

    const extension = file.name.split('.').pop().toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(extension) || !ALLOWED_MIME_TYPES.includes(file.type)) {
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setError(IMPORT_ERROR_MESSAGES.UNSUPPORTED_FORMAT);
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setError(IMPORT_ERROR_MESSAGES.FILE_TOO_LARGE);
      return;
    }
    setSelectedFile(file);
  };

  const handleClearFile = () => {
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const canSubmit = !parsing && (selectedFile || pastedText.trim());

  const handleParse = async () => {
    if (!canSubmit) return;
    setParsing(true);
    setError('');
    try {
      const formData = new FormData();
      if (selectedFile) {
        formData.append('file', selectedFile);
      } else {
        formData.append('cvText', pastedText);
      }

      // Ruta real del proyecto para importar CV al formulario actual sin persistir perfil.
      // /api/cv-parse es otro flujo histórico y no se usa desde este modal.
      const data = await apiUpload('/cv/parse-import', formData);

      if (data.success && data.parsedData) {
        onParsed(data.parsedData);
        onClose();
      } else {
        throw new Error(data.error || 'No se pudo extraer la información del CV.');
      }
    } catch (err) {
      console.error('[ImportCvModal] Error al importar CV:', err);
      setError(IMPORT_ERROR_MESSAGES[err.code] || err.message || 'No se pudo extraer la información del CV. Intenta nuevamente.');
    } finally {
      setParsing(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm p-4 flex items-center justify-center"
      onClick={() => { if (!parsing) onClose(); }}
    >
      <div
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl text-left"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Encabezado */}
        <div className="flex items-start justify-between p-5 border-b border-slate-150 dark:border-slate-800">
          <div>
            <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
              Importar CV con IA
            </h3>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 leading-normal">
              Sube tu CV en PDF, DOCX o TXT para que la IA extraiga tus datos profesionales y complete este formulario. Solo llena este CV; tu perfil no se modifica.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={parsing}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer shrink-0 ml-3 disabled:opacity-40"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Selector de archivo */}
          <label className="block border-2 border-dashed border-slate-200 dark:border-slate-700 hover:border-indigo-400 dark:hover:border-indigo-500 rounded-xl p-5 text-center cursor-pointer transition-colors bg-slate-50/50 dark:bg-slate-800/40">
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.txt"
              onChange={handleFileChange}
              className="hidden"
              disabled={parsing}
            />
            {selectedFile ? (
              <span className="flex items-center justify-center gap-2 text-xs font-bold text-emerald-600 dark:text-emerald-450">
                <FileText className="h-4 w-4" />
                <span className="truncate max-w-[260px]">{selectedFile.name}</span>
              </span>
            ) : (
              <span className="flex flex-col items-center gap-1.5">
                <Upload className="h-5 w-5 text-indigo-500" />
                <span className="text-xs font-bold text-slate-700 dark:text-slate-200">Haz clic para subir tu CV</span>
                <span className="text-[10px] text-slate-450 dark:text-slate-500">PDF, DOCX o TXT · máx. 5 MB</span>
              </span>
            )}
          </label>
          {selectedFile && (
            <button
              type="button"
              onClick={handleClearFile}
              disabled={parsing}
              className="text-[10px] font-bold text-slate-450 dark:text-slate-500 hover:text-rose-500 cursor-pointer transition-colors disabled:opacity-40"
            >
              Quitar archivo
            </button>
          )}

          {/* Alternativa: pegar texto */}
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-slate-150 dark:bg-slate-800" />
            <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">o pega el texto</span>
            <div className="h-px flex-1 bg-slate-150 dark:bg-slate-800" />
          </div>
          <textarea
            rows={4}
            value={pastedText}
            onChange={(e) => { setPastedText(e.target.value); setError(''); }}
            placeholder="Pega aquí el contenido de tu CV actual..."
            disabled={parsing || !!selectedFile}
            className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl p-2.5 text-xs focus:outline-none focus:border-indigo-500 disabled:opacity-50"
          />

          {/* Error controlado: el modal permanece abierto */}
          {error && (
            <div className="flex items-start gap-2 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/60 text-rose-600 dark:text-rose-400 rounded-xl p-3 text-[11px] font-semibold">
              <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Pie */}
        <div className="flex justify-end gap-3 p-5 border-t border-slate-150 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/60">
          <button
            type="button"
            onClick={onClose}
            disabled={parsing}
            className="text-xs font-bold text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 px-4 py-2 cursor-pointer transition-colors disabled:opacity-40"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleParse}
            disabled={!canSubmit}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-5 py-2 rounded-xl text-xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
          >
            {parsing ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Extrayendo con IA...
              </>
            ) : (
              <>
                <Sparkles className="h-3.5 w-3.5" />
                Extraer con IA
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
