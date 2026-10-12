import { useState, useEffect, useRef } from 'react';
import { isFinishInterviewVoiceCommand } from '../utils/interviewVoiceCommands';
import { supabase } from '../utils/supabaseClient';
import { loadUserSnapshot } from '../utils/userDataApi';
import { apiRequest, BACKEND_URL } from '../utils/api';
import { mapError } from '../utils/errorMapper';
import { useNotification } from '../components/common/notificationContext';
import InterviewConversationPanel from '../components/interview/InterviewConversationPanel';
import InterviewChatInput from '../components/interview/InterviewChatInput';
import AiInterviewerAvatar from '../components/interview/AiInterviewerAvatar';
import { restoreInterviewResponses, interviewAverageScore, resolveInterviewResponseMode } from '../utils/interviewSession';
import { pickBestSpanishVoice, pickVoiceByPreference, VOICE_URI_KEY, VOICE_PREF_KEY } from '../utils/interviewVoice';
import {
  MessageSquare,
  Sparkles,
  Loader2,
  AlertCircle,
  Award,
  TrendingUp,
  Pause,
  Play,
  Activity,
  Volume2,
  VolumeX,
} from 'lucide-react';

const MIN_RECORDING_SECONDS = 2;
const MIN_AUDIO_BLOB_SIZE = 3000;
const MAX_RECORDING_SECONDS = 120;
const ANSWER_SECONDS = 120;

const AUDIO_EMPTY_MESSAGE = 'No se detectó audio. Intenta hablar más cerca del micrófono o responde por escrito.';
const AUDIO_TOO_SHORT_MESSAGE = 'Graba al menos 2 segundos para detectar tu voz o responde por escrito.';

const stopStreamTracks = (stream) => {
  stream?.getTracks?.().forEach(track => track.stop());
};

const getPermissionErrorMessage = (err) => {
  if (!err) return 'No se pudo acceder al dispositivo.';
  if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') return 'Permiso denegado por el navegador.';
  if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') return 'No se encontró un dispositivo disponible.';
  if (err.name === 'NotReadableError') return 'El dispositivo está siendo usado por otra aplicación.';
  return err.message || 'No se pudo acceder al dispositivo.';
};


export default function Interviews({ setActiveView }) {
  const { showConfirm } = useNotification();
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [sending, setSending] = useState(false);
  const [profile, setProfile] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  // Error al CARGAR el snapshot del perfil (red/servidor): NO significa perfil incompleto
  const [profileLoadError, setProfileLoadError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  // intState: 'launcher' | 'active' | 'results' | 'pending_feedback'
  const [intState, setIntState] = useState('launcher');
  const [interviewType, setInterviewType] = useState('technical');
  const [interviewId, setInterviewId] = useState(null);
  const [isPaused, setIsPaused] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);

  // Entrevistas con feedback pendiente (status='pending_ai_feedback')
  const [pendingInterviews, setPendingInterviews] = useState([]);
  const [generatingFeedback, setGeneratingFeedback] = useState(false);
  const [completedEarly, setCompletedEarly] = useState(false);

  // Sesión de entrevista: reanudar / terminar / abandonar / check de dispositivos
  const [activeInterview, setActiveInterview] = useState(null); // { interview, messages } en curso al entrar
  const [finishingInterview, setFinishingInterview] = useState(false);
  const [abandoning, setAbandoning] = useState(false);

  // Estados de simulación activa
  const [currentQuestion, setCurrentQuestion] = useState('');
  const [questionCount, setQuestionCount] = useState(1);
  const [timeRemaining, setTimeRemaining] = useState(ANSWER_SECONDS);
  const [estimatedScore, setEstimatedScore] = useState('--');
  const [userTextResponse, setUserTextResponse] = useState('');
  const [totalQuestions, setTotalQuestions] = useState(5); // Por defecto 5 preguntas (HU03)
  const [recommendations, setRecommendations] = useState([]);

  // Grabación de Audio
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [, setMicError] = useState('');
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [showRecordingPanel, setShowRecordingPanel] = useState(false);

  // Barra de progreso IA
  const [, setAiProgress] = useState(0);
  const [showProgressLoader, setShowProgressLoader] = useState(false);

  // Resultados finales
  const [finalScore, setFinalScore] = useState(null);
  const [aiOverallScore, setAiOverallScore] = useState(null);
  const [avatarVariant, setAvatarVariant] = useState(() => localStorage.getItem('empleaia_avatar_variant') || 'woman');
  const [generalAnalysis, setGeneralAnalysis] = useState('');
  const [strengths, setStrengths] = useState([]);
  const [improvements, setImprovements] = useState([]);
  const [sessionResponses, setSessionResponses] = useState([]);
  // Hilo de conversación para la UI tipo chat:
  // { id, role: 'ai'|'user', text, kind: 'main'|'follow_up', questionNumber, feedback }
  const [chatMessages, setChatMessages] = useState([]);

  // ─── NUEVOS ESTADOS FASE 1 (ENTREVISTAS) ───────────────────────────────────
  const [selectedDifficulty, setSelectedDifficulty] = useState('intermediate');
  const [suggestedDifficulty, setSuggestedDifficulty] = useState('intermediate');
  const [difficultyLevel, setDifficultyLevel] = useState('intermediate');
  const [isMuted, setIsMuted] = useState(() => localStorage.getItem('isMuted') === 'true');


  const [accumulatedExpressions, setAccumulatedExpressions] = useState({});
  const [accumulatedEyeContact, setAccumulatedEyeContact] = useState({});



  const [, setShowWebcam] = useState(false);


  const [microphoneAvailable, setMicrophoneAvailable] = useState(null);


  const [, setMicrophonePermissionError] = useState('');
  const [availableVoices, setAvailableVoices] = useState([]);
  const [selectedVoiceURI, setSelectedVoiceURI] = useState(() => localStorage.getItem(VOICE_URI_KEY) || '');

  // Nuevos estados para control y fluidez de la grabación/guardado interactivo
  const [isStopping, setIsStopping] = useState(false);
  const [isSavingAnswer, setIsSavingAnswer] = useState(false);
  const [, setTranscriptionFailed] = useState(false);

  // Nuevos estados para el detector automático de silencio (Web Audio API)
  const [, setHasUserSpoken] = useState(false);
  const [isSilenceDetected, setIsSilenceDetected] = useState(false);
  const [isAdvancingQuestion, setIsAdvancingQuestion] = useState(false);

  // Fallback a texto (HU03)
  const [isTextMode, setIsTextMode] = useState(false);
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  const [autoVoiceEnabled, setAutoVoiceEnabled] = useState(false);
  const [questionReadComplete, setQuestionReadComplete] = useState(false);
  const sendAnswerRef = useRef(null);
  const recordingStartPendingRef = useRef(false);
  const readQuestionRef = useRef(null);
  const timedOutQuestionRef = useRef(null);
  const [showCompactProcessing, setShowCompactProcessing] = useState(false);
  const isTextModeRef = useRef(isTextMode);
  useEffect(() => { isTextModeRef.current = isTextMode; }, [isTextMode]);

  // Refs para evitar closures obsoletos en callbacks asíncronos (como Speech Synthesis)
  const currentUtteranceRef = useRef(null);
  const isRecordingRef = useRef(isRecording);
  const isPausedRef = useRef(isPaused);
  const intStateRef = useRef(intState);
  const resolveBlobRef = useRef(null);

  // Refs adicionales de sincronización de estado para callbacks asíncronos y bucles Web Audio API
  const userTextResponseRef = useRef(userTextResponse);
  const interviewIdRef = useRef(interviewId);
  const currentQuestionRef = useRef(currentQuestion);
  const interviewTypeRef = useRef(interviewType);
  const accumulatedExpressionsRef = useRef(accumulatedExpressions);
  const accumulatedEyeContactRef = useRef(accumulatedEyeContact);
  const questionCountRef = useRef(questionCount);
  const sessionResponsesRef = useRef(sessionResponses);
  const totalQuestionsRef = useRef(totalQuestions);

  const hasUserSpokenRef = useRef(false);
  const isSilenceDetectedRef = useRef(false);
  const isSubmittingRef = useRef(false);
  const isStoppingRef = useRef(false);
  const ignorePendingCallbacksRef = useRef(false);
  const recordingStartedAtRef = useRef(null);
  const lastRecorderStateRef = useRef('inactive');

  useEffect(() => { isRecordingRef.current = isRecording; }, [isRecording]);
  useEffect(() => { isPausedRef.current = isPaused; }, [isPaused]);
  useEffect(() => { intStateRef.current = intState; }, [intState]);
  useEffect(() => { userTextResponseRef.current = userTextResponse; }, [userTextResponse]);
  useEffect(() => { interviewIdRef.current = interviewId; }, [interviewId]);
  useEffect(() => { currentQuestionRef.current = currentQuestion; }, [currentQuestion]);
  useEffect(() => { interviewTypeRef.current = interviewType; }, [interviewType]);
  useEffect(() => { accumulatedExpressionsRef.current = accumulatedExpressions; }, [accumulatedExpressions]);
  useEffect(() => { accumulatedEyeContactRef.current = accumulatedEyeContact; }, [accumulatedEyeContact]);
  useEffect(() => { questionCountRef.current = questionCount; }, [questionCount]);
  useEffect(() => { sessionResponsesRef.current = sessionResponses; }, [sessionResponses]);
  useEffect(() => { totalQuestionsRef.current = totalQuestions; }, [totalQuestions]);

  useEffect(() => {
    if(interviewId) localStorage.setItem(`empleaia_interview_mode_${interviewId}`,isTextMode ? 'text' : 'voice');
  },[interviewId,isTextMode]);

  const isAnalyzing = sending || isSavingAnswer || isTranscribing || isStopping || showProgressLoader;

  useEffect(() => {
    if (!isAnalyzing) {
      setShowCompactProcessing(false);
      return;
    }

    const timer = setTimeout(() => setShowCompactProcessing(true), 2000);
    return () => clearTimeout(timer);
  }, [isAnalyzing]);

  // Temporizadores y referencias de grabación
  const initialLoadGenerationRef = useRef(0);
  const timerRef = useRef(null);
  const recordingTimerRef = useRef(null);
  const maxRecordingTimerRef = useRef(null);
  const recognitionRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  // Referencias Webcam y Face-API
  const webcamStreamRef = useRef(null);

  // Referencia al orbe de la entrevistadora IA (reactividad al volumen sin re-renders)
  const aiOrbRef = useRef(null);

  // Referencias para Web Audio API (Detección de Silencio)
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const microphoneStreamRef = useRef(null);
  const animationFrameRef = useRef(null);

  // TB1 evalúa contenido: no carga modelos faciales ni solicita cámara/micrófono al entrar.
  const requestInitialMediaPermissions = async () => {
    setShowWebcam(false);
    setMicrophoneAvailable(Boolean(navigator.mediaDevices?.getUserMedia));
    if(!navigator.mediaDevices?.getUserMedia) setIsTextMode(true);
  };

  const loadSpeechVoices = () => {
    if (!window.speechSynthesis) return;
    const voices = window.speechSynthesis.getVoices();
    setAvailableVoices(voices);

    const savedURI = localStorage.getItem(VOICE_URI_KEY) || '';
    const storedVoice = voices.find(v => v.voiceURI === savedURI);
    if (storedVoice) {
      setSelectedVoiceURI(savedURI);
    } else {
      // Sin voz explícita guardada: elegir automáticamente respetando la
      // preferencia configurada en /settings (femenina, masculina, acento...).
      const pref = localStorage.getItem(VOICE_PREF_KEY) || 'auto';
      const bestVoice = pickVoiceByPreference(voices, pref);
      if (bestVoice?.voiceURI) {
        setSelectedVoiceURI(bestVoice.voiceURI);
        localStorage.setItem(VOICE_URI_KEY, bestVoice.voiceURI);
      }
    }
  };

  useEffect(() => {
    loadSpeechVoices();
    if (!window.speechSynthesis) return;
    window.speechSynthesis.onvoiceschanged = loadSpeechVoices;
    return () => {
      if (window.speechSynthesis) window.speechSynthesis.onvoiceschanged = null;
    };
  }, [selectedVoiceURI]);

  useEffect(() => {
    const effectVersion = ++initialLoadGenerationRef.current;
    const loadInitialData = async () => {
      setLoading(true);
      setErrorMsg('');
      setProfileLoadError('');

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setLoading(false); return; }

      try {
        const snapshot = await loadUserSnapshot(session.user.id);
        const pData = snapshot.profile;
        if (!pData) {
          // Carga exitosa pero sin fila de perfil: isProfileEmpty mostrará
          // la card "Perfil Incompleto"; no es un error de carga.
          return;
        }
        setProfile(pData);
        const totalExp = (snapshot.work || []).length;
        const totalEdu = (snapshot.academic || []).length;

        let suggested = 'intermediate';
        if (totalExp === 0 && totalEdu <= 1) {
          suggested = 'basic';
        } else if (totalExp >= 3) {
          suggested = 'advanced';
        }
        setSuggestedDifficulty(suggested);
        setSelectedDifficulty(suggested);

        // Cargar face-api preventivamente
        requestInitialMediaPermissions();

        // Cargar entrevistas con feedback pendiente
        try {
          const pendingData = await apiRequest(`/interview/pending/${session.user.id}`, 'GET');
          if (pendingData.success) setPendingInterviews(pendingData.pendingInterviews || []);
        } catch (pendingErr) {
          console.warn('No se pudieron cargar entrevistas pendientes:', pendingErr.message);
        }

        // Detectar una entrevista en curso para ofrecer reanudarla
        try {
          const activeData = await apiRequest(`/interview/resumable/${session.user.id}`, 'GET');
          if (activeData.success && activeData.activeInterview) {
            setActiveInterview({ interview: activeData.activeInterview, messages: activeData.messages || [] });
          }
        } catch (activeErr) {
          console.warn('No se pudo consultar la entrevista en curso:', activeErr.message);
        }
      } catch (err) {
        console.error('Error cargando perfil:', err);
        // Con sesión expirada api.js ya cerró sesión y App redirige al login.
        // Un fallo de red/servidor es un error de carga, no un perfil incompleto.
        if (err.code !== 'SESSION_EXPIRED') {
          setProfileLoadError(mapError(err));
        }
      } finally {
        setLoading(false);
      }
    };
    loadInitialData();

    return () => {
      // React puede repetir el efecto en desarrollo sin desmontar la vista.
      // Un nuevo ciclo conserva las peticiones en curso; un desmontaje real detiene medios.
      queueMicrotask(() => {
        // Esta referencia es un contador de ciclos, no un nodo DOM; se compara intencionalmente.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        if(initialLoadGenerationRef.current !== effectVersion) return;
        clearInterval(timerRef.current);
        clearInterval(recordingTimerRef.current);
        clearTimeout(maxRecordingTimerRef.current);
        cleanupInterviewSession(false);
      });
    };
  // Lifecycle intentionally keyed to state; callbacks read current refs and must not restart media.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadKey]);

  // Solo se considera "perfil incompleto" cuando la carga fue exitosa;
  // si hubo error de carga, profile es null por el fallo, no por estar vacío.
  const isProfileEmpty = !profileLoadError && (!profile || !profile.first_name || !profile.career);

  useEffect(() => {
    if (!loading && isProfileEmpty) {
      setErrorMsg('Para iniciar una entrevista personalizada, primero completa tu perfil profesional. Redirigiendo a Mi Perfil en 3s...');
      const timer = setTimeout(() => {
        if (typeof setActiveView === 'function') {
          setActiveView('profile');
        }
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [loading, isProfileEmpty, setActiveView]);

  // CONTROL DEL CONTEO DIGITAL DE LA ENTREVISTA (02:45)
  useEffect(() => {
    if (intState === 'active' && !showProgressLoader && !isPaused && !isAiSpeaking && !sending && !isAnalyzing) {
      timerRef.current = setInterval(() => {
        setTimeRemaining(prev => {
          if (prev <= 1) {
            clearInterval(timerRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [intState, showProgressLoader, isPaused, isAiSpeaking, sending, isAnalyzing]);

  // FORMATO DEL TIEMPO (MM:SS)
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Cancela de inmediato cualquier lectura en curso. Anula los callbacks de la
  // utterance ANTES de cancelar: algunos navegadores disparan onend tras
  // cancel(), lo que reactivar\u00EDa el micr\u00F3fono autom\u00E1ticamente.
  const stopSpeaking = () => {
    if (currentUtteranceRef.current) {
      currentUtteranceRef.current.onstart = null;
      currentUtteranceRef.current.onend = null;
      currentUtteranceRef.current.onerror = null;
      currentUtteranceRef.current = null;
    }
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setIsAiSpeaking(false);
  };

  const cleanupInterviewSession = (clearResponses = true) => {
    setAutoVoiceEnabled(false);
    stopSpeaking();
    ignorePendingCallbacksRef.current = true;

    // Detener MediaRecorder
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.ondataavailable = null;
        mediaRecorderRef.current.onstop = null;
        mediaRecorderRef.current.stop();
      } catch (e) {
        console.warn('Error stopping mediaRecorder:', e.message);
      }
    }

    // Detener SpeechRecognition
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch { /* El reconocimiento ya estaba detenido. */ }
      recognitionRef.current = null;
    }

    // Resetear estados locales de audio y video
    resetAudioFlowState();
    cleanupAudioContext();
    stopWebcam();
    setIsPaused(false);
    
    // Opcionalmente borrar respuestas y mensajes (para descarte / abandono)
    if (clearResponses) {
      setActiveInterview(null);
      setInterviewId(null);
      setCurrentQuestion('');
      setUserTextResponse('');
      setChatMessages([]);
      setSessionResponses([]);
    }
  };

  // LECTOR DE PREGUNTAS POR VOZ (HU03)
  const speakQuestion = (text) => {
    if (isMuted || !window.speechSynthesis) return;
    stopSpeaking();
    const cleanText = text.replace(/[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF]/g, "");
    const utterance = new SpeechSynthesisUtterance(cleanText);
    currentUtteranceRef.current = utterance;
    utterance.lang = 'es-ES';
    utterance.rate = 0.92;
    utterance.pitch = 1;
    utterance.volume = 1;
    
    // Configurar la voz en español más natural disponible en el navegador.
    const voices = availableVoices.length ? availableVoices : window.speechSynthesis.getVoices();
    const esVoice = voices.find(v => v.voiceURI === selectedVoiceURI)
      || pickVoiceByPreference(voices, localStorage.getItem(VOICE_PREF_KEY) || 'auto')
      || pickBestSpanishVoice(voices);
    if (esVoice) {
      utterance.voice = esVoice;
      utterance.lang = esVoice.lang || 'es-ES';
    }

    utterance.onstart = () => {
      setIsAiSpeaking(true);
    };

    utterance.onend = () => {
      setIsAiSpeaking(false);
      readQuestionRef.current = text;
      setQuestionReadComplete(true);
    };

    utterance.onerror = () => {
      setIsAiSpeaking(false);
      readQuestionRef.current = text;
      setQuestionReadComplete(true);
    };

    window.speechSynthesis.speak(utterance);
  };

  // Reproducir pregunta cuando cambia
  useEffect(() => {
    if (intState === 'active' && currentQuestion && !isMuted) {
      setQuestionReadComplete(false);
      speakQuestion(currentQuestion);
    } else if (isMuted) {
      stopSpeaking();
      readQuestionRef.current = currentQuestion;
      setQuestionReadComplete(true);
    }
  // Lifecycle intentionally keyed to state; callbacks read current refs and must not restart media.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentQuestion, intState, isMuted]);

  // Detener de forma proactiva la voz, cámara y micrófonos cuando la entrevista deja de estar activa
  useEffect(() => {
    if (intState !== 'active') {
      stopSpeaking();
      if (intState === 'launcher' || intState === 'results') {
        cleanupInterviewSession(false);
      }
    }
  // Lifecycle intentionally keyed to state; callbacks read current refs and must not restart media.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intState]);

  const stopWebcam = () => { stopStreamTracks(webcamStreamRef.current); webcamStreamRef.current=null; };

  // CONTROL DE FALLBACK LOCAL CON WEB SPEECH API
  const startLocalSpeechRecognition = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setErrorMsg("No se pudo utilizar el reconocimiento de voz. Puedes responder escribiendo.");
      setIsTextMode(true);
      setIsRecording(false);
      setIsTranscribing(false);
      setShowRecordingPanel(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'es-ES';

      const initialText = userTextResponse;
      let finalTranscriptAccumulated = '';

      recognition.onstart = () => {
        console.log("SpeechRecognition (local fallback) iniciado.");
      };

      recognition.onresult = (event) => {
        console.log("SpeechRecognition (local fallback) resultado.");
        let interimTranscript = '';
        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          } else {
            interimTranscript += event.results[i][0].transcript;
          }
        }

        if (finalTranscript) {
          finalTranscriptAccumulated += (finalTranscriptAccumulated && !finalTranscriptAccumulated.endsWith(' ') ? ' ' : '') + finalTranscript;
        }

        const newText = initialText + (initialText && !initialText.endsWith(' ') ? ' ' : '') + 
                        finalTranscriptAccumulated + 
                        (finalTranscriptAccumulated && interimTranscript ? ' ' : '') + interimTranscript;

        setUserTextResponse(newText);
        console.log("Transcripción en tiempo real:", finalTranscriptAccumulated + " | Interina: " + interimTranscript);
      };

      recognition.onerror = (event) => {
        console.error("SpeechRecognition error:", event.error);
        console.log("Error micrófono:", event.error);
        console.log("Mensaje:", event.message || event.error);
        setMicError(event.error);

        setErrorMsg("No se pudo utilizar el reconocimiento de voz. Puedes responder escribiendo.");
        setIsTextMode(true);
        
        setIsRecording(false);
        setIsTranscribing(false);
        setShowRecordingPanel(false);
        clearInterval(recordingTimerRef.current);
      };

      recognition.onend = () => {
        console.log("SpeechRecognition (local fallback) finalizado.");
        setIsRecording(false);
        setIsTranscribing(false);
        setShowRecordingPanel(false);
        clearInterval(recordingTimerRef.current);
      };

      recognitionRef.current = recognition;
      recognition.start();

      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds(prev => prev + 1);
      }, 1000);

    } catch (err) {
      console.error("Error al iniciar local SpeechRecognition:", err);
      setErrorMsg("No se pudo utilizar el reconocimiento de voz. Puedes responder escribiendo.");
      setIsTextMode(true);
      setIsRecording(false);
      setIsTranscribing(false);
      setShowRecordingPanel(false);
    }
  };

  // Cleanup de Web Audio API e hilos de captura de micrófono
  const cleanupAudioContext = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (audioContextRef.current) {
      if (audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().catch(err => console.warn('Error closing AudioContext:', err));
      }
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    if (microphoneStreamRef.current) {
      stopStreamTracks(microphoneStreamRef.current);
      microphoneStreamRef.current = null;
    }
    console.log('[DEBUG] [Web Audio Cleanup] Analizadores y contexto de audio cerrados.');
  };

  const resetAudioFlowState = () => {
    clearInterval(recordingTimerRef.current);
    clearTimeout(maxRecordingTimerRef.current);
    recordingStartedAtRef.current = null;
    audioChunksRef.current = [];
    resolveBlobRef.current = null;
    isStoppingRef.current = false;
    isSubmittingRef.current = false;
    setIsStopping(false);
    setIsRecording(false);
    setIsTranscribing(false);
    setIsSavingAnswer(false);
    setSending(false);
    setShowRecordingPanel(false);
    setIsSilenceDetected(false);
    isSilenceDetectedRef.current = false;
  };

  // Helper de transcripción asíncrona (endpoint Whisper)
  const transcribeAudioBlob = async (audioBlob) => {
    if (ignorePendingCallbacksRef.current) return '';
    const durationSeconds = recordingStartedAtRef.current ? (Date.now() - recordingStartedAtRef.current) / 1000 : 0;
    console.log('[DEBUG] [Whisper Transcription] Inicio de transcripción.', {
      blobSize: audioBlob ? audioBlob.size : 'null',
      blobType: audioBlob?.type,
      durationSeconds: Number(durationSeconds.toFixed(2)),
      recorderState: lastRecorderStateRef.current,
      microphoneAvailable
    });
    if (!audioBlob || audioBlob.size < MIN_AUDIO_BLOB_SIZE) {
      console.warn('[FRONTEND voice] Grabación de audio extremadamente pequeña o vacía.');
      return '';
    }

    const formData = new FormData();
    const extension = audioBlob.type.includes('ogg') ? 'ogg' : 'webm';
    formData.append('file', audioBlob, `interview-response.${extension}`);

    console.log('[DEBUG] [Whisper Transcription] Enviando FormData al endpoint /api/interview/transcribe...');
    const response = await fetch(`${BACKEND_URL}/interview/transcribe`, {
      method: 'POST',
      body: formData,
      headers: {
        'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token || ''}`
      }
    });

    // Sesión expirada a mitad de entrevista: mismo tratamiento que apiRequest.
    if (response.status === 401) {
      sessionStorage.setItem('empleaia_session_expired', '1');
      await supabase.auth.signOut();
      const sessionErr = new Error('Tu sesión expiró. Vuelve a iniciar sesión.');
      sessionErr.code = 'SESSION_EXPIRED';
      throw sessionErr;
    }

    let data;
    try {
      data = await response.json();
    } catch {
      data = null;
    }
    console.log('[DEBUG] [Whisper Transcription] Fin de transcripción. Respuesta del backend:', data);
    if (ignorePendingCallbacksRef.current) return '';

    if (data?.success) {
      // text vacío = audio sin voz detectada (caso válido, no error)
      return (data.text || '').trim();
    }

    const err = new Error(data?.error || 'No se pudo transcribir el audio. Puedes escribir tu respuesta manualmente.');
    err.code = data?.errorCode || 'server';
    throw err;
  };

  const activateTextFallbackForAudio = (message = AUDIO_EMPTY_MESSAGE) => {
    setTranscriptionFailed(true);
    setIsTextMode(true);
    setErrorMsg(message);
    setIsRecording(false);
    setIsTranscribing(false);
    setShowRecordingPanel(false);
    setIsSilenceDetected(false);
    isSilenceDetectedRef.current = false;
  };

  const getCurrentRecordingSeconds = () => {
    if (!recordingStartedAtRef.current) return 0;
    return (Date.now() - recordingStartedAtRef.current) / 1000;
  };

  const logAudioDebug = (label, audioBlob, extra = {}) => {
    const stream = microphoneStreamRef.current;
    console.log(`[FRONTEND voice] ${label}`, {
      blobSize: audioBlob?.size || 0,
      blobType: audioBlob?.type || 'none',
      durationSeconds: Number(getCurrentRecordingSeconds().toFixed(2)),
      mediaRecorderState: mediaRecorderRef.current?.state || lastRecorderStateRef.current || 'none',
      microphoneAvailable,
      audioTracks: stream?.getAudioTracks?.().map(track => ({
        label: track.label,
        enabled: track.enabled,
        muted: track.muted,
        readyState: track.readyState
      })) || [],
      ...extra
    });
  };

  const isAudioBlobUsable = (audioBlob) => {
    const durationSeconds = getCurrentRecordingSeconds();
    logAudioDebug('Validando blob antes de transcribir', audioBlob);
    if (durationSeconds < MIN_RECORDING_SECONDS) {
      activateTextFallbackForAudio(AUDIO_TOO_SHORT_MESSAGE);
      return false;
    }
    if (!audioBlob || audioBlob.size < MIN_AUDIO_BLOB_SIZE) {
      activateTextFallbackForAudio(AUDIO_EMPTY_MESSAGE);
      return false;
    }
    return true;
  };

  // Detener grabación de forma asíncrona retornando una promesa con el blob final
  const stopActiveRecording = () => {
    return new Promise((resolve) => {
      console.log('[DEBUG] [Mic Controller] Deteniendo grabación activa. Estado del recorder:', 
        mediaRecorderRef.current ? mediaRecorderRef.current.state : 'null'
      );
      
      clearInterval(recordingTimerRef.current);
      clearTimeout(maxRecordingTimerRef.current);

      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        resolveBlobRef.current = resolve;
        mediaRecorderRef.current.stop();
      } else if (recognitionRef.current) {
        // Fallback local Web Speech API
        recognitionRef.current.stop();
        cleanupAudioContext();
        resolve(null);
      } else {
        cleanupAudioContext();
        resolve(null);
      }
    });
  };

  // CONTROL DE GRABACIÓN DE AUDIO REAL CON DETECCION DE SILENCIO (Web Audio API)
  const startRecordingMedia = async () => {
    if (recordingStartPendingRef.current || isRecordingRef.current || isSubmittingRef.current || ignorePendingCallbacksRef.current) return;
    recordingStartPendingRef.current = true;
    try {
      if (!microphoneAvailable) {
        activateTextFallbackForAudio('El micrófono no está disponible. Puedes responder por escrito.');
        return;
      }

      setErrorMsg('');
      setMicError('');
      stopSpeaking();
      setIsTranscribing(false);
      setTranscriptionFailed(false); // Reiniciamos el estado de fallo al volver a grabar
      
      // Reiniciar estados de detección de silencio
      setHasUserSpoken(false);
      hasUserSpokenRef.current = false;
      setIsSilenceDetected(false);
      isSilenceDetectedRef.current = false;

      setShowRecordingPanel(true);
      setRecordingSeconds(0);
      audioChunksRef.current = [];
      recordingStartedAtRef.current = Date.now();

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      microphoneStreamRef.current = stream;
      isRecordingRef.current = true;
      setIsRecording(true);
      console.log('[FRONTEND voice] Stream de micrófono abierto:', stream.getAudioTracks().map(track => ({
        label: track.label,
        enabled: track.enabled,
        muted: track.muted,
        readyState: track.readyState
      })));

      // Configurar AnalyserNode para monitoreo de volumen en tiempo real (silencio)
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        try {
          const audioContext = new AudioContextClass();
          audioContextRef.current = audioContext;

          const source = audioContext.createMediaStreamSource(stream);
          const analyser = audioContext.createAnalyser();
          analyser.fftSize = 256;
          analyserRef.current = analyser;

          source.connect(analyser);

          let silenceStart = null;
          let hasSpoken = false;

          const silenceThreshold = 0.01; // Nivel RMS mínimo para registrar voz
          const silenceDurationRequired = 5000; // 5 segundos continuos de silencio

          const analyzeSilence = () => {
            if (!isRecordingRef.current) return;
            if (isPausedRef.current) {
              // Si está pausado, congelar la evaluación y reanudar frame
              animationFrameRef.current = requestAnimationFrame(analyzeSilence);
              return;
            }

            const bufferLength = analyser.fftSize;
            const dataArray = new Float32Array(bufferLength);
            analyser.getFloatTimeDomainData(dataArray);

            let sum = 0;
            for (let i = 0; i < bufferLength; i++) {
              sum += dataArray[i] * dataArray[i];
            }
            const rms = Math.sqrt(sum / bufferLength);

            if (aiOrbRef.current) {
              aiOrbRef.current.style.setProperty('--voice-level', Math.min(rms * 8, 0.45).toFixed(3));
            }

            // Log temporal del volumen
            // console.log('[DEBUG] Nivel de volumen detectado:', rms.toFixed(4));

            if (rms > silenceThreshold) {
              if (!hasSpoken) {
                hasSpoken = true;
                setHasUserSpoken(true);
                hasUserSpokenRef.current = true;
                console.log('[DEBUG] [Silence Detector] Voz iniciada (hasUserSpoken: true), rms:', rms.toFixed(4));
              }
              // Resetear temporizador de silencio ya que hay actividad vocal
              silenceStart = null;
            } else {
              // Volumen por debajo del umbral (silencio)
              if (hasSpoken) {
                if (!silenceStart) {
                  silenceStart = Date.now();
                } else {
                  const silenceTime = Date.now() - silenceStart;
                  if (silenceTime >= silenceDurationRequired) {
                    console.log('[DEBUG] [Silence Detector] Detección de fin de respuesta por silencio continuo!');
                    setIsSilenceDetected(true);
                    isSilenceDetectedRef.current = true;
                    // Envío automático de la respuesta (Requerimiento 2)
                    handleSendResponse();
                    return; // Detener loop
                  }
                }
              }
            }

            animationFrameRef.current = requestAnimationFrame(analyzeSilence);
          };

          animationFrameRef.current = requestAnimationFrame(analyzeSilence);
        } catch (audioErr) {
          console.warn('[FRONTEND audio] Error inicializando analizador de audio:', audioErr);
        }
      }
      
      let options = { mimeType: 'audio/webm' };
      if (!MediaRecorder.isTypeSupported('audio/webm')) {
        options = { mimeType: 'audio/ogg' };
      }
      if (!MediaRecorder.isTypeSupported('audio/ogg')) {
        options = { mimeType: '' };
      }

      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;
      lastRecorderStateRef.current = mediaRecorder.state;

      mediaRecorder.onstart = () => {
        lastRecorderStateRef.current = mediaRecorder.state;
        logAudioDebug('MediaRecorder iniciado', null, { mimeType: mediaRecorder.mimeType || options.mimeType || 'default' });
      };

      mediaRecorder.ondataavailable = (event) => {
        if (ignorePendingCallbacksRef.current) return;
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
          console.log('[FRONTEND voice] Chunk de audio recibido:', { size: event.data.size, type: event.data.type });
        }
      };

      mediaRecorder.onstop = async () => {
        if (ignorePendingCallbacksRef.current) {
          cleanupAudioContext();
          resetAudioFlowState();
          return;
        }
        lastRecorderStateRef.current = mediaRecorder.state;
        const audioBlob = new Blob(audioChunksRef.current, { type: mediaRecorder.mimeType || 'audio/webm' });
        logAudioDebug('mediaRecorder.onstop: blob compilado', audioBlob, { chunks: audioChunksRef.current.length });
        cleanupAudioContext();

        if (resolveBlobRef.current) {
          const resolve = resolveBlobRef.current;
          resolveBlobRef.current = null;
          resolve(audioBlob);
          return;
        }

        // Flujo de parada manual estándar:
        setIsTranscribing(true);
        setErrorMsg('');
        
        try {
          if (!isAudioBlobUsable(audioBlob)) {
            return;
          }

          const transcript = await transcribeAudioBlob(audioBlob);
          setTranscriptionFailed(false);
          if (transcript) {
            setUserTextResponse(prev => {
              const space = prev && !prev.endsWith(' ') ? ' ' : '';
              return prev + space + transcript;
            });
          } else {
            activateTextFallbackForAudio(AUDIO_EMPTY_MESSAGE);
          }
        } catch (err) {
          console.error('[FRONTEND voice] Error al transcribir en parada manual:', err);
          setTranscriptionFailed(true);
          setIsTextMode(true);
          setErrorMsg(err.message || 'No se pudo transcribir el audio. Puedes escribir tu respuesta manualmente.');
        } finally {
          setIsTranscribing(false);
          setShowRecordingPanel(false);
        }
      };

      mediaRecorder.start(250);
      lastRecorderStateRef.current = mediaRecorder.state;

      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds(prev => prev + 1);
      }, 1000);

      maxRecordingTimerRef.current = setTimeout(() => {
        if (isRecordingRef.current && !isSubmittingRef.current && !ignorePendingCallbacksRef.current) {
          console.log('[FRONTEND voice] Timeout máximo de grabación alcanzado. Procesando respuesta.');
          handleSendResponse();
        }
      }, MAX_RECORDING_SECONDS * 1000);

    } catch (err) {
      console.warn('[FRONTEND voice] Falló MediaRecorder. Iniciando fallback local con Web Speech API:', err);
      setMicrophonePermissionError(getPermissionErrorMessage(err));
      resetAudioFlowState();
      startLocalSpeechRecognition();
    } finally {
      recordingStartPendingRef.current = false;
    }
  };

  const handleToggleTextMode = async () => {
    setAutoVoiceEnabled(false);
    if (isRecording) {
      await stopActiveRecording();
      setIsRecording(false);
      setShowRecordingPanel(false);
    }
    setIsTextMode(prev => !prev);
  };

  const toggleRecording = () => {
    if (isRecording) {
      if (isStoppingRef.current || isSubmittingRef.current) return;
      handleSendResponse();
    } else {
      cleanupAudioContext();
      if (!microphoneAvailable) {
        activateTextFallbackForAudio('El micrófono no está disponible. Puedes responder por escrito.');
        return;
      }
      ignorePendingCallbacksRef.current = false;
      setAutoVoiceEnabled(true);
      setIsTextMode(false);
      if (!isAiSpeaking) startRecordingMedia();
    }
  };

  // La primera pulsación autoriza la conversación continua en esta sesión.
  // Se escucha tras la lectura; texto, pausa, navegación y errores la detienen.
  useEffect(() => {
    if (isSubmittingRef.current || isStoppingRef.current || ignorePendingCallbacksRef.current || readQuestionRef.current !== currentQuestion || !autoVoiceEnabled || isTextMode || !questionReadComplete || isAiSpeaking || isRecording || isPaused || intState !== 'active' || sending || isAnalyzing || isTranscribing || isStopping || isSavingAnswer || errorMsg || !microphoneAvailable) return;
    startRecordingMedia();
  // Cada inicio usa las referencias vigentes y no reinicia medios en curso.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoVoiceEnabled, isTextMode, questionReadComplete, isAiSpeaking, isRecording, isPaused, intState, sending, isAnalyzing, isTranscribing, isStopping, isSavingAnswer, errorMsg, microphoneAvailable, currentQuestion]);

  useEffect(() => { timedOutQuestionRef.current = null; }, [currentQuestion]);
  useEffect(() => {
    if (timeRemaining !== 0 || intState !== 'active' || isPaused || isAiSpeaking || sending || isAnalyzing || !currentQuestion || timedOutQuestionRef.current === currentQuestion) return;
    timedOutQuestionRef.current = currentQuestion;
    sendAnswerRef.current?.({ timedOut: true });
  }, [timeRemaining, intState, isPaused, isAiSpeaking, sending, isAnalyzing, currentQuestion]);

  // INICIAR ENTREVISTA
  const handleStartInterview = async (type, opts = {}) => {
    if (activeInterview?.interview?.status === 'paused') {
      setErrorMsg('Ya tienes una entrevista pausada. Reanúdala o descártala antes de iniciar una nueva.');
      return;
    }

    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;

    if (!profile || !profile.first_name || !profile.career) {
      setErrorMsg('Para iniciar una entrevista personalizada, primero completa tu perfil profesional. Redirigiendo a Mi Perfil en 3s...');
      setTimeout(() => setActiveView?.('profile'), 3000);
      return;
    }

    setStarting(true);
    setErrorMsg('');
    ignorePendingCallbacksRef.current = false;
    setCompletedEarly(false);
    setInterviewType(type);
    setQuestionCount(1);
    setTimeRemaining(ANSWER_SECONDS);
    setEstimatedScore('--');
    setUserTextResponse('');
    setSessionResponses([]);
    setShowRecordingPanel(false);
    setIsRecording(false);
    setIsPaused(false);
    const startInText = opts.responseMode === 'text' || microphoneAvailable === false;
    setIsTextMode(startInText);
    // Comenzar es la acción explícita que inicia el modo de voz y su permiso.
    setAutoVoiceEnabled(!startInText);
    setShowWebcam(false);

    try {
      const data = await apiRequest('/interview/start', 'POST', {
        profileId: profile?.id || user?.id,
        interviewType: type,
        difficultyLevel: selectedDifficulty,
        responseMode: opts.responseMode === 'text' || microphoneAvailable === false ? 'text' : 'voice'
      });

      if (data.success) {
        setInterviewId(data.interviewId);
        setCurrentQuestion(data.firstQuestion);
        setTotalQuestions(data.totalQuestions || 5);
        setDifficultyLevel(data.difficultyLevel || selectedDifficulty);
        setChatMessages([{
          id: crypto.randomUUID(),
          role: 'ai',
          text: data.firstQuestion,
          kind: 'main',
          questionNumber: 1
        }]);
        setIntState('active');
      }
    } catch (err) {
      const message = err.message || '';
      if (message.includes('perfil') || message.includes('Perfil') || message.includes('Completa')) {
        setErrorMsg("Tu perfil profesional está incompleto. Por favor completa nombre, carrera, puesto objetivo, descripción del puesto, resumen y al menos 1 habilidad técnica y blanda. Redirigiendo en 5s...");
        setTimeout(() => setActiveView?.('profile'), 5000);
        return;
      }
      setErrorMsg(mapError(err));
    } finally {
      setStarting(false);
    }
  };

  // GENERAR FEEDBACK PENDIENTE
  const handleGeneratePendingFeedback = async (pendingInterviewId) => {
    setGeneratingFeedback(true);
    setErrorMsg('');
    try {
      const data = await apiRequest('/interview/generate-pending-feedback', 'POST', {
        interviewId: pendingInterviewId
      });

      if (data.success) {
        setFinalScore(data.overallScore ?? null);
        setAiOverallScore(data.aiOverallScore ?? null);
        setGeneralAnalysis(data.generalAnalysis || '');
        setStrengths(data.strengths || []);
        setImprovements(data.improvements || []);
        setRecommendations(data.recommendations || []);
        setSessionResponses((data.sessionResponses || []).map(r=>({...r,feedback:r.feedback || {}})));
        setInterviewId(pendingInterviewId);
        setCompletedEarly(Boolean(data.completedEarly));
        setPendingInterviews(prev => prev.filter(p => p.id !== pendingInterviewId));
        setIntState('results');
      }
    } catch (err) {
      setErrorMsg(mapError(err));
    } finally {
      setGeneratingFeedback(false);
    }
  };

  const requestInterviewConfirm = (options) => new Promise((resolve) => {
    showConfirm({
      ...options,
      onConfirm: () => resolve(true),
      onCancel: () => resolve(false)
    });
  });

  // PAUSAR: conserva el progreso ya persistido y deja la sesión reanudable.
  const handlePauseInterview = async () => {
    if (!interviewId) return;
    const confirmed = await requestInterviewConfirm({
      title: 'Pausar entrevista',
      message: 'La entrevista se guardará y podrás continuarla después.',
      confirmLabel: 'Pausar y guardar',
      cancelLabel: 'Continuar entrevista',
      variant: 'safe'
    });
    if (!confirmed) return;

    setErrorMsg('');
    ignorePendingCallbacksRef.current = true;
    cleanupInterviewSession(false);

    try {
      const data = await apiRequest('/interview/pause', 'POST', { interviewId, responseMode: isTextModeRef.current ? 'text' : 'voice' });
      if (data.success) {
        setActiveInterview({ interview: data.interview, messages: data.messages || [] });
        setInterviewId(null);
        setIntState('launcher');
      }
    } catch (err) {
      ignorePendingCallbacksRef.current = false;
      setIsPaused(false);
      setErrorMsg(mapError(err));
    }
  };

  // TERMINAR AHORA: cierra la entrevista con lo respondido y pide el análisis final.
  const handleFinishInterview = async (options = {}) => {
    if (!interviewId) return;
    // Un comando de voz completo expresa la misma decisión que el botón de confirmar.
    const confirmed = options.source === 'voice' || await requestInterviewConfirm({
      title: 'Terminar ahora',
      message: 'Se guardarán tus respuestas y se generará un resultado con la información disponible.',
      confirmLabel: 'Terminar y evaluar',
      cancelLabel: 'Seguir entrevista',
      variant: 'warning'
    });
    if (!confirmed) return;
    const hasPersistedAnswers = sessionResponsesRef.current.length > 0 || chatMessages.some(m => m.role === 'user');
    if (!hasPersistedAnswers) {
      const noAnswersConfirmed = await requestInterviewConfirm({
        title: 'Terminar sin respuestas',
        message: 'No hay respuestas registradas. No habrá suficiente información para una evaluación completa.',
        confirmLabel: 'Cerrar sin evaluación',
        cancelLabel: 'Volver a responder',
        variant: 'warning'
      });
      if (!noAnswersConfirmed) return;
    }

    stopSpeaking();
    ignorePendingCallbacksRef.current = true;
    setFinishingInterview(true);
    setErrorMsg('');
    try {
      const data = await apiRequest('/interview/finish', 'POST', { interviewId });

      if (data.discarded) {
        cleanupInterviewSession(true);
        setIntState('launcher');
        setErrorMsg('La entrevista se cerró sin respuestas suficientes para generar evaluación.');
        return;
      }
      if (data.pendingFeedback) {
        cleanupInterviewSession(true);
        setIntState('launcher');
        setErrorMsg('Guardamos tus respuestas. La IA no está disponible ahora; podrás generar el análisis desde "Entrevistas pendientes".');
        return;
      }
      if (data.success) {
        cleanupInterviewSession(false);
        setFinalScore(data.overallScore ?? null);
        setAiOverallScore(data.aiOverallScore ?? null);
        setGeneralAnalysis(data.generalAnalysis || '');
        setStrengths(data.strengths || []);
        setImprovements(data.improvements || []);
        setRecommendations(data.recommendations || []);
        setSessionResponses((data.sessionResponses || []).map(r=>({...r,feedback:r.feedback || {}})));
        setCompletedEarly(true);
        setActiveInterview(null);
        setInterviewId(null);
        setIntState('results');
      }
    } catch (err) {
      ignorePendingCallbacksRef.current = false;
      setErrorMsg(mapError(err));
    } finally {
      setFinishingInterview(false);
    }
  };

  // ABANDONAR: descarta la entrevista en curso (o la detectada al entrar).
  const handleAbandonInterview = async () => {
    const confirmed = await requestInterviewConfirm({
      title: 'Descartar entrevista',
      message: 'El progreso de esta entrevista se descartará y no podrás reanudarla.',
      confirmLabel: 'Descartar entrevista',
      cancelLabel: 'Conservar entrevista',
      variant: 'danger'
    });
    if (!confirmed) return;

    const id = interviewId || activeInterview?.interview?.id;
    if (!id) {
      cleanupInterviewSession(true);
      setIntState('launcher');
      return;
    }
    setAbandoning(true);
    setErrorMsg('');
    cleanupInterviewSession(true);
    try {
      await apiRequest('/interview/abandon', 'POST', { interviewId: id });
    } catch (err) {
      console.warn('[abandon] No se pudo descartar en backend:', err.message);
      setActiveInterview(null);
      setInterviewId(null);
      setErrorMsg('No se pudo cerrar la entrevista en el servidor. Si reaparece al recargar, descártala de nuevo.');
    } finally {
      setAbandoning(false);
      setIntState('launcher');
    }
  };

  // REANUDAR: retoma la entrevista en curso detectada al entrar.
  const handleResumeInterview = async () => {
    if (!activeInterview?.interview) return;
    if (activeInterview.interview.status !== 'paused') return;

    setErrorMsg('');
    let iv = activeInterview.interview;
    let msgs = activeInterview.messages || [];
    try {
      const data = await apiRequest('/interview/resume', 'POST', { interviewId: iv.id });
      if (data.success) {
        iv = data.interview;
        msgs = data.messages || [];
      }
    } catch (err) {
      setErrorMsg(mapError(err));
      return;
    }

    const lastAiMsg = [...msgs].reverse().find(m => m.sender === 'ai');
    setInterviewId(iv.id);
    ignorePendingCallbacksRef.current = false;
    setInterviewType(iv.interview_type);
    setDifficultyLevel(iv.difficulty_level || 'intermediate');
    setCurrentQuestion(lastAiMsg?.message_content || '');
    // Reconstruir el hilo de conversación desde los mensajes guardados.
    // Los mensajes ai sin metadata (entrevistas antiguas) cuentan como 'main'.
    let mainCounter = 0;
    setChatMessages(msgs.map(m => {
      if (m.sender === 'ai') {
        const kind = m.evaluation?.message_kind || 'main';
        if (kind === 'main') mainCounter += 1;
        return {
          id: m.id || crypto.randomUUID(),
          role: 'ai',
          text: m.message_content,
          kind,
          questionNumber: m.evaluation?.question_index || (kind === 'main' ? mainCounter : undefined)
        };
      }
      return {
        id: m.id || crypto.randomUUID(),
        role: 'user',
        text: m.message_content,
        feedback: m.evaluation
      };
    }));
    const restored = restoreInterviewResponses(msgs);
    setSessionResponses(restored);
    sessionResponsesRef.current = restored;
    const savedMode = resolveInterviewResponseMode(iv.profile_summary,msgs,localStorage.getItem(`empleaia_interview_mode_${iv.id}`)) || 'voice';
    setIsTextMode(savedMode === 'text' || microphoneAvailable === false);
    setEstimatedScore(interviewAverageScore(restored) == null ? '--' : `${interviewAverageScore(restored)}%`);
    setQuestionCount((iv.questions_answered || 0) + 1);
    setTotalQuestions(iv.total_questions || 5);
    setUserTextResponse('');
    setIsPaused(false);
    setCompletedEarly(false);
    setActiveInterview(null);
    setIntState('active');
  };

  // ENVIAR RESPUESTA (Con soporte para envío automático por detección de silencio)
  const handleSendResponse = async (options = {}) => {
    const timedOut = options.timedOut === true;
    if (ignorePendingCallbacksRef.current) return;
    const isCurrentlyRecording = isRecordingRef.current;

    // Evitar solicitudes duplicadas o condiciones de carrera (Requerimiento 12)
    if (isSubmittingRef.current || sending || isTranscribing || isStopping || isSavingAnswer || isAdvancingQuestion) {
      console.log('[DEBUG] handleSendResponse: Envio ya en proceso o inhabilitado. Ignorando llamada duplicada.');
      return;
    }

    // Si el usuario no ha hablado en absoluto, evitar avanzar automáticamente
    if (!timedOut && isSilenceDetectedRef.current && !hasUserSpokenRef.current) {
      console.log('[DEBUG] handleSendResponse: Silencio detectado pero el usuario no habló. Evitando avance automático.');
      isSilenceDetectedRef.current = false;
      return;
    }

    if (!timedOut && !userTextResponseRef.current.trim() && !isCurrentlyRecording) {
      console.log('[DEBUG] handleSendResponse: No hay texto de respuesta ni grabación activa.');
      return;
    }

    isSubmittingRef.current = true;
    setErrorMsg('');

    stopSpeaking();

    let textToSubmit = userTextResponseRef.current;
    const emptyTimedOut = timedOut && !textToSubmit.trim() && (!isCurrentlyRecording || !hasUserSpokenRef.current);
    if (emptyTimedOut) {
      if (isCurrentlyRecording) await stopActiveRecording();
      cleanupAudioContext();
      setIsRecording(false);isRecordingRef.current = false;
      setShowRecordingPanel(false);
      textToSubmit = '[Sin respuesta: tiempo de respuesta agotado]';
    }

    // Detención automática del audio si el usuario está grabando al presionar Siguiente (Requerimiento 2)
    if (isCurrentlyRecording && !emptyTimedOut) {
      if (getCurrentRecordingSeconds() < MIN_RECORDING_SECONDS) {
        setErrorMsg(AUDIO_TOO_SHORT_MESSAGE);
        setIsSilenceDetected(false);
        isSilenceDetectedRef.current = false;
        isSubmittingRef.current = false;
        return;
      }
      isStoppingRef.current = true;
      setIsStopping(true);
      console.log('[DEBUG] handleSendResponse: Grabación activa. Deteniendo grabación...');
      try {
        const audioBlob = await stopActiveRecording();
        if (ignorePendingCallbacksRef.current) return;
        setIsStopping(false);
        isStoppingRef.current = false;
        setIsRecording(false);
        setShowRecordingPanel(false);

        if (audioBlob) {
          logAudioDebug('handleSendResponse: blob recibido para transcripción', audioBlob);
          if (!isAudioBlobUsable(audioBlob)) {
            setIsStopping(false);
            isStoppingRef.current = false;
            isSubmittingRef.current = false;
            return;
          }
          setIsTranscribing(true);
          try {
            const transcript = await transcribeAudioBlob(audioBlob);
            if (ignorePendingCallbacksRef.current) return;
            setTranscriptionFailed(false);
            if (transcript && transcript.trim().length >= 3) {
              console.log('[DEBUG] handleSendResponse: Audio transcrito con éxito:', transcript);
              const space = textToSubmit && !textToSubmit.endsWith(' ') ? ' ' : '';
              textToSubmit = textToSubmit + space + transcript;
              setUserTextResponse(textToSubmit);
            } else {
              console.warn('[DEBUG] handleSendResponse: La grabación de audio está vacía.');
              activateTextFallbackForAudio(AUDIO_EMPTY_MESSAGE);
              setIsTranscribing(false);
              isStoppingRef.current = false;
              isSubmittingRef.current = false;
              return;
            }
          } catch (transcribeErr) {
            console.error('[DEBUG] handleSendResponse: Falló la transcripción del audio:', transcribeErr.code, transcribeErr);
            setTranscriptionFailed(true);
            const transcribeMsgs = {
              quota: 'No se pudo transcribir el audio. Puedes escribir tu respuesta manualmente.',
              invalid_api_key: 'No se pudo transcribir el audio. Puedes escribir tu respuesta manualmente.',
              unsupported_format: 'No pudimos procesar el audio grabado. Intenta grabar de nuevo o continúa respondiendo por escrito.',
              timeout: 'La transcripción tardó demasiado. Intenta con una respuesta más corta o continúa por escrito.',
              empty_audio: AUDIO_EMPTY_MESSAGE,
              file_too_large: 'El audio es demasiado grande. Intenta grabar una respuesta más corta o responde por escrito.',
              server: 'No se pudo transcribir el audio. Puedes escribir tu respuesta manualmente.'
            };
            setErrorMsg(transcribeMsgs[transcribeErr.code] || transcribeMsgs.server);
            setIsTextMode(true);
            setIsTranscribing(false);
            isStoppingRef.current = false;
            isSubmittingRef.current = false;
            return;
          } finally {
            setIsTranscribing(false);
          }
        } else {
          activateTextFallbackForAudio(AUDIO_EMPTY_MESSAGE);
          setIsStopping(false);
          isStoppingRef.current = false;
          isSubmittingRef.current = false;
          return;
        }
      } catch (err) {
        console.error('[DEBUG] handleSendResponse: Error al detener grabación:', err);
        setIsStopping(false);
        isStoppingRef.current = false;
        isSubmittingRef.current = false;
        return;
      }
    }

    // El comando controla la sesión; nunca se envía como respuesta a evaluar.
    if (!isTextModeRef.current && isFinishInterviewVoiceCommand(textToSubmit)) {
      setAutoVoiceEnabled(false);
      setUserTextResponse('');
      setIsSilenceDetected(false);
      isSilenceDetectedRef.current = false;
      isSubmittingRef.current = false;
      await handleFinishInterview({ source: 'voice' });
      return;
    }

    setIsSavingAnswer(true);
    setShowProgressLoader(true);
    setAiProgress(0);
    setSending(true);

    const progressInterval = setInterval(() => {
      setAiProgress(prev => (prev >= 75 ? (clearInterval(progressInterval), 75) : prev + 5));
    }, 150);

    console.log('[DEBUG] handleSendResponse: Iniciando guardado de respuesta...', {
      preguntaActual: currentQuestionRef.current,
      respuesta: textToSubmit,
      indicePreguntaAntes: questionCountRef.current
    });

    try {
      const rawRes = await fetch(`${BACKEND_URL}/interview/respond`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token || ''}`
        },
        body: JSON.stringify({
          interviewId:  interviewIdRef.current,
          questionText: currentQuestionRef.current,
          userAnswer:   textToSubmit,
          responseMode: isTextModeRef.current ? 'text' : 'voice',
          responseTimedOut: emptyTimedOut,
          interviewType: interviewTypeRef.current
        })
      });

      // Sesión expirada a mitad de entrevista: mismo tratamiento que apiRequest.
      if (rawRes.status === 401) {
        sessionStorage.setItem('empleaia_session_expired', '1');
        await supabase.auth.signOut();
        const sessionErr = new Error('Tu sesión expiró. Vuelve a iniciar sesión.');
        sessionErr.code = 'SESSION_EXPIRED';
        throw sessionErr;
      }

      const data = await rawRes.json();
      if (ignorePendingCallbacksRef.current) return;
      console.log('[/interview/respond] Respuesta:', data);

      clearInterval(progressInterval);
      setAiProgress(100);
      await new Promise(r => setTimeout(r, 300));
      setShowProgressLoader(false);

      // Caso: IA no disponible durante la entrevista → feedback pendiente
      if (data.pendingFeedback) {
        setPendingInterviews(prev => [...prev, { id: interviewIdRef.current, interview_type: interviewTypeRef.current, questions_answered: questionCountRef.current, created_at: new Date().toISOString() }]);
        setErrorMsg(data.error);
        setIntState('launcher');
        return;
      }

      if (!rawRes.ok) {
        setErrorMsg(data.error || 'Error al procesar tu respuesta.');
        return;
      }

      if (data.success) {
        // Rama de repregunta: la IA pide profundizar antes de evaluar.
        // No avanza el contador ni registra score; la pregunta sigue abierta.
        if (data.action === 'follow_up') {
          setChatMessages(prev => [
            ...prev,
            { id: crypto.randomUUID(), role: 'user', text: textToSubmit },
            { id: crypto.randomUUID(), role: 'ai', text: data.nextQuestion, kind: 'follow_up', questionNumber: data.questionNumber }
          ]);
          setCurrentQuestion(data.nextQuestion);
          setUserTextResponse('');
          setTimeRemaining(ANSWER_SECONDS);
          setShowRecordingPanel(false);
          setAccumulatedExpressions({});
          setAccumulatedEyeContact({});
          setTranscriptionFailed(false);
          setHasUserSpoken(false);
          hasUserSpokenRef.current = false;
          setIsSilenceDetected(false);
          isSilenceDetectedRef.current = false;
          console.log('[DEBUG] Repregunta recibida para la pregunta', data.questionNumber);
          return;
        }

        const updatedResponses = data.sessionResponses?.map(r=>({...r,feedback:r.feedback || {}})) || [...sessionResponsesRef.current, {
          question: currentQuestionRef.current,
          response: textToSubmit,
          feedback: data.feedback || {}
        }];
        setSessionResponses(updatedResponses);
        setEstimatedScore(`${data.feedback?.score ?? '--'}%`);

        // Reflejar el intercambio en el hilo de conversación
        setChatMessages(prev => [
          ...prev,
          { id: crypto.randomUUID(), role: 'user', text: textToSubmit, feedback: data.feedback },
          ...((!data.isFinished && data.nextQuestion)
            ? [{ id: crypto.randomUUID(), role: 'ai', text: data.nextQuestion, kind: 'main', questionNumber: data.questionNumber || (questionCountRef.current + 1) }]
            : [])
        ]);

        // Reset local telemetry counters for next question
        setAccumulatedExpressions({});
        setAccumulatedEyeContact({});
        setTranscriptionFailed(false);
        setHasUserSpoken(false);
        hasUserSpokenRef.current = false;
        setIsSilenceDetected(false);
        isSilenceDetectedRef.current = false;

        if (data.isFinished) {
          const avg = data.overallScore ?? interviewAverageScore(updatedResponses);
          setFinalScore(avg);
          setAiOverallScore(data.sessionSummary?.overall_score ?? null);
          setStrengths(data.sessionSummary?.strengths || []);
          setImprovements(data.sessionSummary?.improvements || []);
          setRecommendations(data.sessionSummary?.recommendations || []);
          setGeneralAnalysis(data.sessionSummary?.general_analysis || '');
          setCompletedEarly(!!data.completedEarly);
          setIntState('results');
          console.log('[DEBUG] Entrevista finalizada. Score total:', avg);
        } else {
          console.log('[DEBUG] Avanzando de pregunta. índice antes:', questionCountRef.current, 'índice después:', questionCountRef.current + 1);
          setIsAdvancingQuestion(true);
          setCurrentQuestion(data.nextQuestion);
          setQuestionCount(prev => prev + 1);
          setUserTextResponse('');
          setTimeRemaining(ANSWER_SECONDS);
          setShowRecordingPanel(false);
        }
      }
    } catch (err) {
      console.error('[/interview/respond] Error de red:', err);
      clearInterval(progressInterval);
      setShowProgressLoader(false);
      setErrorMsg(err.message || 'No se pudo procesar tu respuesta.');
    } finally {
      setSending(false);
      setIsSavingAnswer(false);
      setIsAdvancingQuestion(false);
      isStoppingRef.current = false;
      isSubmittingRef.current = false;
    }
  };

  useEffect(() => { sendAnswerRef.current = handleSendResponse; });

  useEffect(() => {
    if (!showDetailsModal) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setShowDetailsModal(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showDetailsModal]);

  if (loading) {
    return (
      <div className="flex-1 min-h-full bg-slate-50 dark:bg-slate-900 flex flex-col justify-center items-center font-sans">
        <Loader2 className="h-8 w-8 text-indigo-650 animate-spin mb-2" />
        <p className="text-slate-500 text-sm">Cargando simulador de entrevistas...</p>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-full overflow-y-auto bg-slate-50 dark:bg-slate-900 px-4 py-6 font-sans sm:px-6 lg:px-8 lg:py-8">

      {/* Mensaje de Error */}
      {errorMsg && (
        <div className="bg-rose-50 border border-rose-100 text-rose-650 text-xs rounded-xl p-4 flex items-start gap-3 mb-6">
          <AlertCircle className="h-4.5 w-4.5 shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}

      {profileLoadError ? (
        /* ERROR DE CARGA DEL PERFIL (red/servidor): mensaje + reintento */
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/60 rounded-2xl p-8 text-center max-w-md mx-auto space-y-4 shadow-sm mt-12">
          <AlertCircle className="h-12 w-12 text-rose-500 mx-auto" />
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">No se pudo cargar tu información</h3>
          <p className="text-slate-500 dark:text-slate-300 text-xs leading-relaxed">{profileLoadError}</p>
          <button
            onClick={() => setReloadKey(k => k + 1)}
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-5 py-2.5 rounded-xl cursor-pointer"
          >
            Reintentar
          </button>
        </div>
      ) : isProfileEmpty ? (
        /* ALERTA DE CONFIGURACIÓN */
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/60 rounded-2xl p-8 text-center max-w-md mx-auto space-y-4 shadow-sm mt-12">
          <AlertCircle className="h-12 w-12 text-amber-500 mx-auto" />
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">Perfil Incompleto</h3>
          <p className="text-slate-500 dark:text-slate-300 text-xs leading-relaxed">
            Completa tus datos en la pestaña "Mi perfil" primero. Esto le permite a la IA entrevistadora modular las preguntas técnicas a tu stack exacto.
          </p>
        </div>
      ) : intState === 'launcher' ? (
        /* ========================================================= */
        /* LAUNCHER DE ENTREVISTAS (FIGURA 13 - IZQUIERDA) */
        /* ========================================================= */
        <div className="mx-auto w-full max-w-[1600px] space-y-6">
          {/* Franja superior integrada: permisos + comparar entrevistas (HU16) */}
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/60 rounded-2xl p-4 shadow-sm flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-extrabold uppercase tracking-widest block">Permisos de entrevista</span>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                Al comenzar se inicia la conversación por voz y se solicita el micrófono si hace falta. Puedes elegir texto. Di «termina la entrevista» para cerrar y evaluar tus respuestas.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] text-slate-500">Evaluación del contenido · sin cámara</span>
              <span className="hidden lg:block h-6 w-px bg-slate-200 dark:bg-slate-700 mx-1" aria-hidden="true" />
              <button
                onClick={() => setActiveView?.('compare')}
                className="inline-flex items-center gap-1.5 text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 cursor-pointer bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-150 dark:border-indigo-500/30 hover:border-indigo-400 dark:hover:border-indigo-500/70 px-3 py-1.5 rounded-xl transition-colors"
              >
                <TrendingUp className="h-3.5 w-3.5" /> Comparar entrevistas
              </button>
            </div>
          </div>

          {/* Entrevista en curso: reanudar o descartar */}
          {activeInterview?.interview && activeInterview.interview.status === 'paused' && (
            <div className="bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-500/30 rounded-2xl p-5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-2">
                <Play className="h-4 w-4 text-indigo-600 shrink-0 mt-0.5" />
                <div>
                  <span className="text-xs font-bold text-indigo-800 dark:text-indigo-300 uppercase tracking-wider block">Tienes una entrevista pausada</span>
                  <p className="text-[11px] text-slate-500 dark:text-slate-300 mt-0.5">
                    Entrevista {({general:'General',technical:'Técnica',behavioral:'Por competencias'}[activeInterview.interview.interview_type] || activeInterview.interview.interview_type)} · {activeInterview.interview.questions_answered || 0} de {activeInterview.interview.total_questions || 5} respondidas. Puedes retomarla donde la dejaste.
                  </p>
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={handleResumeInterview}
                  className="bg-indigo-650 hover:bg-indigo-700 text-white h-9 px-4 rounded-xl text-xs font-bold cursor-pointer flex items-center gap-1.5"
                >
                  <Play className="h-3.5 w-3.5" /> Reanudar
                </button>
                <button
                  onClick={handleAbandonInterview}
                  disabled={abandoning}
                  className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/60 hover:border-red-300 dark:hover:border-red-500/60 text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 h-9 px-4 rounded-xl text-xs font-bold cursor-pointer disabled:opacity-40 disabled:dark:bg-slate-800 disabled:dark:text-slate-500"
                >
                  {abandoning ? 'Descartando…' : 'Descartar'}
                </button>
              </div>
            </div>
          )}

          {/* Selector de Dificultad (HU14) */}
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/60 rounded-2xl p-5 shadow-sm space-y-3">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
              <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-extrabold uppercase tracking-widest block">Nivel de Dificultad</span>
              <span className="text-[11px] text-slate-400 dark:text-slate-400 font-semibold">Selecciona la dificultad y el tipo de entrevista a continuación.</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                { value: 'basic', label: 'Básico 🟢', desc: 'Conceptos fundamentales. Flexible con respuestas.' },
                { value: 'intermediate', label: 'Intermedio 🟡', desc: 'Frameworks, APIs, y desarrollo estándar.' },
                { value: 'advanced', label: 'Avanzado 🔴', desc: 'Diseño de sistemas, arquitectura y alta exigencia.' }
              ].map(level => {
                const isSelected = selectedDifficulty === level.value;
                const isSuggested = suggestedDifficulty === level.value;
                return (
                  <button
                    key={level.value}
                    type="button"
                    onClick={() => setSelectedDifficulty(level.value)}
                    className={`text-left p-4 rounded-xl border transition-all duration-200 cursor-pointer ${
                      isSelected
                        ? 'border-indigo-600 dark:border-indigo-500/70 bg-indigo-50/40 dark:bg-indigo-950/40 ring-1 ring-indigo-600 dark:ring-indigo-500/20'
                        : 'border-slate-200 dark:border-slate-700/60 hover:border-slate-350 dark:hover:border-slate-500 bg-white dark:bg-slate-950/60 shadow-sm'
                    }`}
                  >
                    <div className="flex justify-between items-center">
                      <span className={`text-xs font-bold ${isSelected ? 'text-indigo-650 dark:text-indigo-300' : 'text-slate-700 dark:text-slate-300'}`}>
                        {level.label}
                      </span>
                      {isSuggested && (
                        <span className="bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-transparent dark:border-emerald-500/20 text-[8px] font-black uppercase px-1.5 py-0.5 rounded-full">
                          Sugerido
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-slate-400 dark:text-slate-400 mt-1 leading-normal">
                      {level.desc}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">

            {/* Opción 1: General */}
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/60 rounded-2xl p-6 shadow-sm flex flex-col justify-between items-center text-center space-y-4">
              <div className="space-y-3">
                <div className="bg-indigo-50 dark:bg-indigo-950/40 text-indigo-650 dark:text-indigo-300 h-12 w-12 rounded-xl flex items-center justify-center mx-auto border border-indigo-100 dark:border-indigo-500/20">
                  <MessageSquare className="h-5 w-5" />
                </div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">General</h3>
                <p className="text-xs text-slate-450 dark:text-slate-300 leading-relaxed">
                  Preguntas generales de comportamiento, encaje cultural e historia laboral técnica.
                </p>
              </div>
              <button
                onClick={() => handleStartInterview('general')}
                disabled={starting}
                className="w-full bg-slate-105 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-700/60 hover:border-indigo-500 dark:hover:border-indigo-500/70 hover:text-indigo-600 dark:hover:text-indigo-300 text-slate-600 dark:text-slate-300 text-xs font-bold py-2 rounded-xl cursor-pointer disabled:opacity-40 disabled:dark:bg-slate-800 disabled:dark:text-slate-500"
              >
                Comenzar
              </button>
            </div>

            {/* Opción 2: Técnica */}
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/60 rounded-2xl p-6 shadow-sm flex flex-col justify-between items-center text-center space-y-4">
              <div className="space-y-3">
                <div className="bg-indigo-50 dark:bg-indigo-950/40 text-indigo-650 dark:text-indigo-300 h-12 w-12 rounded-xl flex items-center justify-center mx-auto border border-indigo-100 dark:border-indigo-500/20">
                  <Sparkles className="h-5 w-5" />
                </div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">Técnica</h3>
                <p className="text-xs text-slate-450 dark:text-slate-300 leading-relaxed">
                  Preguntas del área técnica, lenguajes, frameworks, algoritmos y patrones de arquitectura.
                </p>
              </div>
              <button
                onClick={() => handleStartInterview('technical')}
                disabled={starting}
                className="w-full bg-indigo-650 hover:bg-indigo-700 text-white text-xs font-bold py-2 rounded-xl shadow-sm shadow-indigo-600/10 cursor-pointer disabled:opacity-40 disabled:dark:bg-slate-800 disabled:dark:text-slate-500 disabled:dark:border disabled:dark:border-slate-700/60"
              >
                Comenzar
              </button>
            </div>

            {/* Opción 3: Por competencias */}
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/60 rounded-2xl p-6 shadow-sm flex flex-col justify-between items-center text-center space-y-4">
              <div className="space-y-3">
                <div className="bg-indigo-50 dark:bg-indigo-950/40 text-indigo-650 dark:text-indigo-300 h-12 w-12 rounded-xl flex items-center justify-center mx-auto border border-indigo-100 dark:border-indigo-500/20">
                  <TrendingUp className="h-5 w-5" />
                </div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">Por competencias</h3>
                <p className="text-xs text-slate-455 dark:text-slate-300 leading-relaxed">
                  Preguntas orientadas a evaluar tus metodologías ágiles, resolución y habilidades blandas.
                </p>
              </div>
              <button
                onClick={() => handleStartInterview('behavioral')}
                disabled={starting}
                className="w-full bg-slate-105 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-700/60 hover:border-indigo-500 dark:hover:border-indigo-500/70 hover:text-indigo-600 dark:hover:text-indigo-300 text-slate-600 dark:text-slate-300 text-xs font-bold py-2 rounded-xl cursor-pointer disabled:opacity-40 disabled:dark:bg-slate-800 disabled:dark:text-slate-500"
              >
                Comenzar
              </button>
            </div>

          </div>

          {/* Entrevistas con feedback pendiente */}
          {pendingInterviews.length > 0 && (
            <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-500/30 rounded-2xl p-5 shadow-sm space-y-3">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
                <span className="text-xs font-bold text-amber-800 dark:text-amber-300 uppercase tracking-wider">Análisis IA pendiente</span>
              </div>
              <p className="text-xs text-amber-700 dark:text-amber-300 leading-relaxed">
                Tienes {pendingInterviews.length} {pendingInterviews.length === 1 ? 'entrevista con respuestas guardadas' : 'entrevistas con respuestas guardadas'} sin analizar. Cuando la IA esté disponible, genera el feedback para ver tus resultados.
              </p>
              <div className="space-y-2">
                {pendingInterviews.map(pi => (
                  <div key={pi.id} className="bg-white dark:bg-slate-800 border border-amber-200 dark:border-amber-500/30 rounded-xl p-3 flex items-center justify-between gap-3">
                    <div>
                      <span className="text-[10px] text-slate-500 dark:text-slate-300 block capitalize">
                        {pi.interview_type === 'technical' ? 'Técnica' : pi.interview_type === 'behavioral' ? 'Por Competencias' : 'General'} · {pi.questions_answered || '?'} respuestas guardadas
                      </span>
                      <span className="text-[10px] text-slate-400">{new Date(pi.created_at).toLocaleDateString('es-ES')}</span>
                    </div>
                    <button
                      onClick={() => handleGeneratePendingFeedback(pi.id)}
                      disabled={generatingFeedback}
                      className="bg-amber-500 hover:bg-amber-600 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg cursor-pointer disabled:opacity-50 flex items-center gap-1.5 shrink-0"
                    >
                      {generatingFeedback ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                      Generar feedback
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      ) : intState === 'active' ? (
        /* ========================================================= */
        /* SIMULADOR EN CURSO CON CHAT Y MIC (FIGURA 13 - CENTRO) */
        /* ========================================================= */
        <div className="mx-auto grid w-full max-w-[1600px] grid-cols-1 gap-6 animate-fade-in lg:grid-cols-12">
          
          {/* Columna Izquierda: STAR, chat y zona de respuesta (col-span-8) */}
          <div className="lg:col-span-8 space-y-6">

            <div className="bg-indigo-50/50 dark:bg-indigo-950/25 border border-indigo-150 dark:border-indigo-500/30 rounded-2xl p-4 space-y-3">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <span className="text-[9px] text-indigo-650 dark:text-indigo-300 font-extrabold uppercase tracking-widest">Recomendaciones STAR</span>
                <p className="text-[10px] text-indigo-850 dark:text-indigo-200 leading-relaxed">
                  Cinco preguntas y hasta dos aclaraciones breves. Responde con experiencias reales y estructura STAR.
                </p>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {[
                  ['S', 'Situación', 'contexto inicial'],
                  ['T', 'Tarea', 'responsabilidad concreta'],
                  ['A', 'Acción', 'lo que hiciste tú'],
                  ['R', 'Resultado', 'impacto medible']
                ].map(([letter, label, desc]) => (
                  <div key={letter} className="bg-white/80 dark:bg-slate-900/50 border border-indigo-100 dark:border-indigo-500/20 rounded-xl p-2.5 flex items-start gap-2">
                    <span className="h-6 w-6 shrink-0 rounded-lg bg-indigo-600 text-white text-[10px] font-black flex items-center justify-center">{letter}</span>
                    <div>
                      <span className="text-[10px] font-black text-slate-850 dark:text-white block">{label}</span>
                      <span className="text-[9px] text-slate-500 dark:text-slate-400 leading-tight block">{desc}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* PANEL CONVERSACIONAL: hilo de chat + zona de entrada */}
            <InterviewConversationPanel
              messages={chatMessages}
              totalQuestions={totalQuestions}
              typing={isAnalyzing}
              typingLabel="La entrevistadora está analizando tu respuesta..."
            >
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/60 rounded-2xl p-6 shadow-sm space-y-5">
              {isPaused ? (
                <div className="py-12 bg-slate-50 dark:bg-slate-900/60 border border-dashed border-slate-200 dark:border-slate-700 rounded-xl flex flex-col items-center justify-center space-y-3 text-center animate-fade-in">
                  <Pause className="h-10 w-10 text-amber-500 animate-pulse" />
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">Simulación en Pausa</h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs leading-normal">
                    El cronómetro digital y la captura de voz se encuentran suspendidos.
                  </p>
                  <button
                    onClick={() => setIsPaused(false)}
                    className="bg-indigo-650 hover:bg-indigo-700 text-white font-bold px-4 py-2 rounded-xl text-xs cursor-pointer shadow-sm shadow-indigo-600/10 flex items-center gap-1.5"
                  >
                    <Play className="h-3.5 w-3.5" /> Reanudar Entrevista
                  </button>
                </div>
              ) : (
                <InterviewChatInput
                  value={userTextResponse}
                  onChange={(e) => {
                    setUserTextResponse(e.target.value);
                    setTranscriptionFailed(false);
                  }}
                  placeholder={isTextMode ? "Redacta tu respuesta aquí..." : "Escribe tu respuesta estructurada utilizando metodologías del puesto o haz clic en el micrófono para dictarla..."}
                  isTextMode={isTextMode}
                  autoVoiceEnabled={autoVoiceEnabled}
                  timeRemaining={timeRemaining}
                  onToggleTextMode={handleToggleTextMode}
                  isRecording={isRecording}
                  onToggleRecording={toggleRecording}
                  micDisabled={!microphoneAvailable}
                  showRecordingPanel={showRecordingPanel}
                  recordingSeconds={recordingSeconds}
                  onPause={handlePauseInterview}
                  onFinish={handleFinishInterview}
                  finishing={finishingInterview}
                  onAbandon={handleAbandonInterview}
                  abandoning={abandoning}
                  onSend={handleSendResponse}
                  sendLabel={questionCount === totalQuestions ? 'Finalizar Entrevista' : 'Enviar respuesta'}
                  busyLabel={
                    isSilenceDetected ? 'Procesando silencio...' :
                    isStopping ? 'Deteniendo grabación...' :
                    isTranscribing ? 'Transcribiendo audio...' :
                    (sending || isSavingAnswer || isAdvancingQuestion) ? 'Guardando respuesta...' : null
                  }
                  showCompactLoader={showCompactProcessing}
                  sendDisabled={sending || isTranscribing || isStopping || isSavingAnswer || isAdvancingQuestion || (!userTextResponse.trim() && !isRecording)}
                  controlsDisabled={isStopping || isTranscribing || sending || isSavingAnswer || isAdvancingQuestion}
                />
              )}
            </div>
            </InterviewConversationPanel>

          </div>

          {/* Columna Derecha: Webcam y Alertas Gestuales (col-span-4) */}
          <div className="lg:col-span-4 space-y-6">
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/60 rounded-2xl p-5 shadow-sm overflow-hidden relative">
              <div className="absolute right-0 top-0 h-28 w-28 rounded-bl-full bg-gradient-to-br from-indigo-100 via-cyan-50 to-transparent dark:from-indigo-950/70 dark:via-cyan-950/30 dark:to-transparent" />
              <div className="relative flex flex-col items-center gap-3 text-center">
                <AiInterviewerAvatar
                  status={errorMsg ? 'error' : isPaused ? 'paused' : isAiSpeaking ? 'speaking' : isRecording ? 'listening' : isAnalyzing ? 'analyzing' : isTextMode ? 'writing' : 'idle'}
                  avatarRef={aiOrbRef}
                  variant={avatarVariant}
                />
                <div className="min-w-0 w-full">
                  <span className="text-[9px] font-black uppercase tracking-wide text-slate-400 dark:text-slate-500 block">Entrevistador virtual con IA</span>
                  <h3 className="text-sm font-black text-slate-900 dark:text-white mt-0.5">
                    {errorMsg ? 'Necesita atención' : isPaused ? 'Pausado' : isAiSpeaking ? 'Hablando' : isRecording ? 'Escuchando' : isAnalyzing ? 'Analizando' : isTextMode ? 'Esperando respuesta escrita' : 'En espera'}
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed mt-1">
                    {errorMsg ? 'Revisa el mensaje y reintenta la operación.' : isPaused ? 'La sesión está detenida.' : isAiSpeaking
                      ? 'El entrevistador virtual está leyendo la pregunta.'
                      : isRecording
                        ? 'Responde con naturalidad, como en una videollamada.'
                        : isAnalyzing
                          ? 'Revisando tu respuesta para continuar la conversación.'
                          : 'Lista para guiar la simulación.'}
                  </p>
                </div>
              </div>

              <label className="relative mt-3 flex items-center justify-center gap-2 text-xs text-slate-500">
                Personaje
                <select aria-label="Personaje del entrevistador" value={avatarVariant} onChange={e=>{setAvatarVariant(e.target.value);localStorage.setItem('empleaia_avatar_variant',e.target.value);}} className="rounded-lg border border-slate-200 bg-white dark:bg-slate-800 p-1.5">
                  <option value="woman">Mujer</option><option value="man">Hombre</option>
                </select>
              </label>
              {/* Información de sesión (reubicada desde la antigua cabecera del chat) */}
              <div className="relative mt-4 pt-4 border-t border-slate-100 dark:border-slate-700/60 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <span className="text-[9px] text-indigo-600 dark:text-indigo-400 font-extrabold uppercase tracking-widest block">Sesión Interactiva Activa</span>
                    <h4 className="text-xs font-bold text-slate-900 dark:text-white capitalize truncate">
                      Entrevista simulada - {interviewType === 'technical' ? 'Técnica' : interviewType === 'behavioral' ? 'Por Competencias' : 'General'}
                    </h4>
                  </div>
                  <button
                    onClick={() => {
                      const newVal = !isMuted;
                      setIsMuted(newVal);
                      localStorage.setItem('isMuted', String(newVal));
                    }}
                    className="p-2 bg-slate-100 dark:bg-slate-900/60 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-650 dark:text-slate-300 rounded-xl cursor-pointer transition-all border border-slate-200 dark:border-slate-700/60 flex items-center gap-1.5 shrink-0"
                    title={isMuted ? 'Activar lectura de voz' : 'Silenciar lectura de voz'}
                  >
                    {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4 text-indigo-600" />}
                    <span className="text-[9px] font-bold hidden md:inline">{isMuted ? 'Muted' : 'Lector'}</span>
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center text-xs font-bold">
                  <div className="bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 rounded-xl p-2 space-y-0.5">
                    <span className="text-[9px] text-slate-400 uppercase tracking-wider block">Avance</span>
                    <span className="text-slate-800 dark:text-slate-200">{questionCount} de {totalQuestions}</span>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 rounded-xl p-2 space-y-0.5">
                    <span className="text-[9px] text-slate-400 uppercase tracking-wider block">Tiempo para responder</span>
                    <span className="font-mono text-indigo-650 dark:text-indigo-300">{formatTime(timeRemaining)}</span>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 rounded-xl p-2 space-y-0.5">
                    <span className="text-[9px] text-slate-400 uppercase tracking-wider block">Score</span>
                    <span className="text-emerald-600">{estimatedScore}</span>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5 text-xs text-slate-500 leading-relaxed">
              Practica el contenido de tus respuestas para el puesto objetivo. Esta versión no analiza tono, nerviosismo ni lenguaje corporal.
            </div>

          </div>

        </div>
      ) : (
        /* ========================================================= */
        /* SCORECARD FINAL DE RESULTADOS (FIGURA 13 - DERECHA) */
        /* ========================================================= */
        <div className="mx-auto w-full max-w-[1600px] space-y-6">

          {completedEarly && (
            <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-500/30 rounded-xl p-3 flex items-start gap-2 text-xs text-amber-800 dark:text-amber-300">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" />
              <span>La entrevista finalizó anticipadamente para garantizar que puedas recibir el análisis final completo. El feedback generado está basado en las respuestas entregadas hasta ese momento.</span>
            </div>
          )}

          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/60 rounded-2xl p-5 shadow-sm flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-2.5">
              <div className="bg-emerald-55 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-300 p-1.5 border border-emerald-100 dark:border-emerald-500/30 rounded-xl">
                <Award className="h-5 w-5 animate-pulse" />
              </div>
              <div>
                <span className="text-[10px] text-emerald-600 font-extrabold uppercase tracking-widest flex items-center gap-1.5">
                  {completedEarly ? 'Análisis generado con IA' : 'Simulación Finalizada'}
                  <span className="h-1 w-1 rounded-full bg-slate-300"></span>
                  <span className="text-[8px] text-indigo-600 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-150 dark:border-indigo-500/30 px-2 py-0.5 rounded font-black uppercase">
                    Nivel {difficultyLevel === 'basic' ? 'Básico' : difficultyLevel === 'advanced' ? 'Avanzado' : 'Intermedio'}
                  </span>
                </span>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">Resultados de la entrevista</h2>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 lg:justify-end">
              <button
                onClick={() => setShowDetailsModal(true)}
                disabled={sessionResponses.length === 0}
                title={sessionResponses.length === 0 ? 'Aún no hay respuestas evaluadas para mostrar.' : 'Ver detalle por pregunta'}
                className="border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-900/60 text-slate-650 dark:text-slate-300 font-bold px-4 py-2 rounded-xl text-xs cursor-pointer transition-all disabled:opacity-45 disabled:cursor-not-allowed"
              >
                Ver detalle por pregunta
              </button>
              <button
                onClick={() => setIntState('launcher')}
                className="bg-indigo-650 hover:bg-indigo-700 text-white font-bold px-5 py-2 rounded-xl text-xs shadow-sm cursor-pointer transition-colors"
              >
                Finalizar
              </button>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/60 rounded-2xl p-6 shadow-sm grid grid-cols-1 md:grid-cols-12 gap-8 items-center min-h-[350px]">

            {/* Medidor Circular (Izquierda) */}
            <div className="md:col-span-4 flex flex-col items-center justify-center text-center space-y-3 py-4 md:border-r md:border-slate-100 pr-0 md:pr-6">

              {/* Dial circular SVG */}
              <div className="relative h-32 w-32 flex items-center justify-center">
                <svg className="w-full h-full transform -rotate-95" viewBox="0 0 36 36">
                  <path
                    className="text-slate-100"
                    strokeWidth="3"
                    stroke="currentColor"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                  <path
                    className="text-emerald-500"
                    strokeWidth="3.2"
                    strokeDasharray={`${finalScore ?? 0}, 100`}
                    strokeLinecap="round"
                    stroke="currentColor"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                </svg>
                <div className="absolute flex flex-col items-center justify-center leading-none">
                  <span className="text-4xl font-black text-slate-950 dark:text-white">{finalScore ?? '—'}</span>
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">/ 100</span>
                </div>
              </div>

              <div className="space-y-1">
                <h4 className="text-xs font-black text-slate-950 dark:text-white">
                  {finalScore == null ? 'Sin promedio individual disponible' : finalScore >= 70 ? '¡Buen trabajo!' : 'Sigue practicando'}
                </h4>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-normal max-w-[180px]">
                  Evaluación basada en {sessionResponses.length} {sessionResponses.length === 1 ? 'pregunta respondida' : 'preguntas respondidas'} en esta simulación.
                </p>
                {aiOverallScore != null && <p className="text-xs text-slate-500">Valoración global adicional de IA: {aiOverallScore}/100. El promedio mostrado se calcula con las evaluaciones individuales.</p>}
              </div>

            </div>

            {/* Análisis y Fortalezas (Derecha) */}
            <div className="md:col-span-8 space-y-5">

              <div className="space-y-1">
                <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">Análisis General</span>
                <p className="text-xs md:text-sm text-slate-700 dark:text-slate-300 leading-relaxed text-justify italic">
                  "{generalAnalysis}"
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                {/* Fortalezas */}
                <div className="space-y-2">
                  <span className="text-[9px] text-emerald-600 font-extrabold uppercase tracking-widest block">Fortalezas</span>
                  <ul className="space-y-1.5 text-[11px] leading-relaxed text-slate-650 dark:text-slate-300">
                    {strengths.map((str, index) => (
                      <li key={index} className="flex gap-2 items-start">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0 mt-1.5"></span>
                        {str}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Mejoras */}
                <div className="space-y-2">
                  <span className="text-[9px] text-amber-600 font-extrabold uppercase tracking-widest block">Áreas de Mejora</span>
                  <ul className="space-y-1.5 text-[11px] leading-relaxed text-slate-650 dark:text-slate-300">
                    {improvements.map((imp, index) => (
                      <li key={index} className="flex gap-2 items-start">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0 mt-1.5"></span>
                        {imp}
                      </li>
                    ))}
                  </ul>
                </div>

              </div>

              {/* Recommendations Section */}
              {recommendations && recommendations.length > 0 && (
                <div className="space-y-3 pt-4 border-t border-slate-100 animate-fade-in">
                  <span className="text-[9px] text-indigo-650 font-extrabold uppercase tracking-widest block">
                    Plan de Acción y Recursos Sugeridos
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    {recommendations.map((rec, index) => (
                      <div key={index} className="bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 rounded-xl p-3 flex items-start gap-2.5">
                        <div className="bg-indigo-50 text-indigo-650 p-1.5 border border-indigo-100 rounded-lg shrink-0 mt-0.5">
                          <Activity className="h-3.5 w-3.5 shrink-0" />
                        </div>
                        <div className="space-y-0.5">
                          <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">
                            Debilidad: {rec.weakness}
                          </span>
                          <h5 className="text-[11px] font-bold text-slate-900 leading-tight">
                            Recurso: {rec.suggested_resource}
                          </h5>
                          <p className="text-[10px] text-slate-500 leading-normal mt-0.5">
                            {rec.reason}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}


            </div>

          </div>

          {/* MODAL DIALOGUE PREMIUM: DETALLE DE PREGUNTAS (Sin alerts) */}
          {showDetailsModal && (
            <div
              className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in"
              onClick={() => setShowDetailsModal(false)}
            >
              <div
                className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">Detalle de Respuestas Evaluadas</h3>
                  <button
                    onClick={() => setShowDetailsModal(false)}
                    className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-100 text-xs font-bold font-mono bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 h-7 w-7 rounded-lg flex items-center justify-center cursor-pointer border border-slate-200 dark:border-slate-700"
                  >
                    ✕
                  </button>
                </div>

                <div className="p-6 overflow-y-auto space-y-4 text-left">
                  {sessionResponses.map((r, i) => (
                    <div key={i} className="bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3.5">
                      <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-800 pb-2 gap-3">
                        <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-extrabold uppercase tracking-widest">Pregunta {i + 1}</span>
                        <span className="text-xs font-black text-emerald-600 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-md border border-emerald-100 dark:border-emerald-500/30">{r.feedback.score ?? 'Sin evaluar'} / 100</span>
                      </div>

                      <div className="space-y-1">
                        <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">Enunciado</span>
                        <p className="text-xs font-extrabold text-slate-900 dark:text-slate-100 leading-relaxed">{r.question}</p>
                      </div>

                      <div className="space-y-1">
                        <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">Tu Respuesta</span>
                        <p className="text-xs text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-3 leading-relaxed">{r.response}</p>
                      </div>

                      <div className="space-y-1.5 bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-500/20 rounded-lg p-3">
                        <span className="text-[9px] text-indigo-600 dark:text-indigo-300 font-bold uppercase tracking-wider block">Comentario de la IA</span>
                        <p className="text-xs text-slate-700 dark:text-slate-300 italic">"{r.feedback.general_comment}"</p>
                      </div>


                      {r.feedback.examples_ideal_response && r.feedback.examples_ideal_response.length > 0 && (
                        <div className="bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-500/20 rounded-lg p-3 space-y-1">
                          <span className="text-[9px] text-emerald-650 dark:text-emerald-300 font-black uppercase tracking-wider flex items-center gap-1">
                            <Sparkles className="h-3 w-3 text-emerald-650 dark:text-emerald-300 animate-pulse" /> Guía para mejorar tu respuesta
                          </span>
                          <p className="text-[10px] text-slate-500 dark:text-slate-400">Adapta esta guía usando solo experiencias y resultados reales. Completa los marcadores con tus propios datos; no adoptes cifras o experiencias ajenas.</p>
                          <div className="text-[11px] text-slate-700 dark:text-slate-300 leading-relaxed text-justify space-y-1">
                            {r.feedback.examples_ideal_response.map((example, idx) => (
                              <p key={idx}>{example}</p>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                  {sessionResponses.length === 0 && (
                    <p className="text-center text-slate-400 text-xs py-8">Aún no has completado respuestas en esta sesión.</p>
                  )}
                </div>
              </div>
            </div>
          )}

        </div>
      )}

    </div>
  );
}
