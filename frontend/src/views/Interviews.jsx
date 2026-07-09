import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../utils/supabaseClient';
import { apiRequest, BACKEND_URL } from '../utils/api';
import { useNotification } from '../components/common/NotificationContext';
import { mapError } from '../utils/errorMapper';
import InterviewConversationPanel from '../components/interview/InterviewConversationPanel';
import InterviewChatInput from '../components/interview/InterviewChatInput';
import AiOrbAvatar from '../components/interview/AiOrbAvatar';
import { pickBestSpanishVoice, pickVoiceByPreference, VOICE_URI_KEY, VOICE_PREF_KEY } from '../utils/interviewVoice';
import {
  MessageSquare,
  Sparkles,
  Send,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Award,
  TrendingUp,
  ChevronLeft,
  Mic,
  Square,
  Pause,
  Play,
  Activity,
  ArrowRight,
  Volume2,
  VolumeX,
  Video,
  VideoOff,
  X
} from 'lucide-react';

const MIN_RECORDING_SECONDS = 2;
const MIN_AUDIO_BLOB_SIZE = 3000;
const MAX_RECORDING_SECONDS = 90;

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
  const { toast, showConfirm } = useNotification();
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [sending, setSending] = useState(false);
  const [profile, setProfile] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');

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
  const [timeRemaining, setTimeRemaining] = useState(165);
  const [estimatedScore, setEstimatedScore] = useState('--');
  const [userTextResponse, setUserTextResponse] = useState('');
  const [totalQuestions, setTotalQuestions] = useState(5); // Por defecto 5 preguntas (HU03)
  const [recommendations, setRecommendations] = useState([]);

  // Grabación de Audio
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [micError, setMicError] = useState('');
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [showRecordingPanel, setShowRecordingPanel] = useState(false);

  // Barra de progreso IA
  const [aiProgress, setAiProgress] = useState(0);
  const [showProgressLoader, setShowProgressLoader] = useState(false);

  // Resultados finales
  const [finalScore, setFinalScore] = useState(0);
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
  const [faceapiLoaded, setFaceApiLoaded] = useState(false);
  const [faceapiLoading, setFaceApiLoading] = useState(false);
  const [accumulatedExpressions, setAccumulatedExpressions] = useState({});
  const [accumulatedEyeContact, setAccumulatedEyeContact] = useState({});
  const [liveHint, setLiveHint] = useState('');
  const [primaryExpression, setPrimaryExpression] = useState('');
  const [eyeContact, setEyeContact] = useState(true);
  const [showWebcam, setShowWebcam] = useState(true);
  const [gesturalHistory, setGesturalHistory] = useState(null);
  const [cameraAvailable, setCameraAvailable] = useState(null);
  const [microphoneAvailable, setMicrophoneAvailable] = useState(null);
  const [mediaPermissionStatus, setMediaPermissionStatus] = useState('checking');
  const [cameraPermissionError, setCameraPermissionError] = useState('');
  const [microphonePermissionError, setMicrophonePermissionError] = useState('');
  const [availableVoices, setAvailableVoices] = useState([]);
  const [selectedVoiceURI, setSelectedVoiceURI] = useState(() => localStorage.getItem(VOICE_URI_KEY) || '');

  // Nuevos estados para control y fluidez de la grabación/guardado interactivo
  const [isStopping, setIsStopping] = useState(false);
  const [isSavingAnswer, setIsSavingAnswer] = useState(false);
  const [transcriptionFailed, setTranscriptionFailed] = useState(false);

  // Nuevos estados para el detector automático de silencio (Web Audio API)
  const [hasUserSpoken, setHasUserSpoken] = useState(false);
  const [isSilenceDetected, setIsSilenceDetected] = useState(false);
  const [isAdvancingQuestion, setIsAdvancingQuestion] = useState(false);

  // Fallback a texto (HU03)
  const [isTextMode, setIsTextMode] = useState(false);
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
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
  const mediaPermissionsRequestedRef = useRef(false);
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
  const timerRef = useRef(null);
  const recordingTimerRef = useRef(null);
  const maxRecordingTimerRef = useRef(null);
  const recognitionRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  // Referencias Webcam y Face-API
  const webcamVideoRef = useRef(null);
  const webcamStreamRef = useRef(null);
  const faceapiIntervalRef = useRef(null);

  // Referencia al orbe de la entrevistadora IA (reactividad al volumen sin re-renders)
  const aiOrbRef = useRef(null);

  // Referencias para Web Audio API (Detección de Silencio)
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const microphoneStreamRef = useRef(null);
  const animationFrameRef = useRef(null);

  // Cargar Face-API desde CDN localmente y descargar pesos
  const loadFaceApi = async () => {
    if (window.faceapi) {
      setFaceApiLoaded(true);
      return;
    }
    setFaceApiLoading(true);
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/dist/face-api.js';
    script.async = true;
    script.onload = async () => {
      try {
        const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.15/model/';
        await window.faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
        await window.faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
        await window.faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL);
        setFaceApiLoaded(true);
        console.log('[Face-API] Cargado con éxito.');
      } catch (err) {
        console.error('[Face-API] Error cargando pesos:', err);
      } finally {
        setFaceApiLoading(false);
      }
    };
    script.onerror = () => {
      console.error('[Face-API] Error cargando script de CDN.');
      setFaceApiLoading(false);
    };
    document.body.appendChild(script);
  };

  const requestInitialMediaPermissions = async () => {
    if (mediaPermissionsRequestedRef.current) return;
    mediaPermissionsRequestedRef.current = true;
    setMediaPermissionStatus('checking');
    setCameraPermissionError('');
    setMicrophonePermissionError('');

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraAvailable(false);
      setMicrophoneAvailable(false);
      setMediaPermissionStatus('unavailable');
      setCameraPermissionError('Tu navegador no permite acceder a la cámara.');
      setMicrophonePermissionError('Tu navegador no permite acceder al micrófono.');
      setIsTextMode(true);
      return;
    }

    let audioOk = false;
    let videoOk = false;

    try {
      const combinedStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      audioOk = combinedStream.getAudioTracks().some(track => track.readyState === 'live');
      videoOk = combinedStream.getVideoTracks().some(track => track.readyState === 'live');
      console.log('[Media permissions] Permisos iniciales combinados:', {
        audioOk,
        videoOk,
        audioTracks: combinedStream.getAudioTracks().map(t => ({ label: t.label, enabled: t.enabled, state: t.readyState })),
        videoTracks: combinedStream.getVideoTracks().map(t => ({ label: t.label, enabled: t.enabled, state: t.readyState }))
      });
      stopStreamTracks(combinedStream);
    } catch (combinedErr) {
      console.warn('[Media permissions] Permiso combinado falló, probando por separado:', combinedErr.name, combinedErr.message);

      try {
        const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioOk = audioStream.getAudioTracks().some(track => track.readyState === 'live');
        console.log('[Media permissions] Micrófono disponible:', audioStream.getAudioTracks().map(t => ({ label: t.label, enabled: t.enabled, state: t.readyState })));
        stopStreamTracks(audioStream);
      } catch (audioErr) {
        audioOk = false;
        setMicrophonePermissionError(getPermissionErrorMessage(audioErr));
        console.warn('[Media permissions] Micrófono no disponible:', audioErr.name, audioErr.message);
      }

      try {
        const videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
        videoOk = videoStream.getVideoTracks().some(track => track.readyState === 'live');
        console.log('[Media permissions] Cámara disponible:', videoStream.getVideoTracks().map(t => ({ label: t.label, enabled: t.enabled, state: t.readyState })));
        stopStreamTracks(videoStream);
      } catch (videoErr) {
        videoOk = false;
        setCameraPermissionError(getPermissionErrorMessage(videoErr));
        console.warn('[Media permissions] Cámara no disponible:', videoErr.name, videoErr.message);
      }
    }

    setCameraAvailable(videoOk);
    setMicrophoneAvailable(audioOk);
    setShowWebcam(videoOk);
    if (!audioOk) setIsTextMode(true);
    setMediaPermissionStatus(audioOk || videoOk ? 'ready' : 'unavailable');
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
    const loadInitialData = async () => {
      setLoading(true);
      setErrorMsg('');

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setLoading(false); return; }

      try {
        const { data: pData, error: pError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .single();
        if (pError) throw pError;
        setProfile(pData);

        // Predecir sugerencia de dificultad (HU14) contando experiencias y educación
        const { count: expCount } = await supabase
          .from('work_experience')
          .select('*', { count: 'exact', head: true })
          .eq('profile_id', session.user.id);

        const { count: eduCount } = await supabase
          .from('academic_background')
          .select('*', { count: 'exact', head: true })
          .eq('profile_id', session.user.id);

        const totalExp = expCount || 0;
        const totalEdu = eduCount || 0;

        let suggested = 'intermediate';
        if (totalExp === 0 && totalEdu <= 1) {
          suggested = 'basic';
        } else if (totalExp >= 3) {
          suggested = 'advanced';
        }
        setSuggestedDifficulty(suggested);
        setSelectedDifficulty(suggested);

        // Cargar face-api preventivamente
        loadFaceApi();
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
          const activeData = await apiRequest(`/interview/active/${session.user.id}`, 'GET');
          if (activeData.success && activeData.activeInterview) {
            setActiveInterview({ interview: activeData.activeInterview, messages: activeData.messages || [] });
          }
        } catch (activeErr) {
          console.warn('No se pudo consultar la entrevista en curso:', activeErr.message);
        }
      } catch (err) {
        console.error('Error cargando perfil:', err);
        setErrorMsg('Por favor completa tu perfil en "Mi perfil" antes de simular entrevistas.');
      } finally {
        setLoading(false);
      }
    };
    loadInitialData();

    return () => {
      clearInterval(timerRef.current);
      clearInterval(recordingTimerRef.current);
      clearTimeout(maxRecordingTimerRef.current);
      clearInterval(faceapiIntervalRef.current);
      cleanupInterviewSession(false);
    };
  }, []);

  const isProfileEmpty = !profile || !profile.first_name || !profile.career;

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
    if (intState === 'active' && !showProgressLoader && !isPaused) {
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
  }, [intState, showProgressLoader, isPaused]);

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
      try { recognitionRef.current.stop(); } catch (e) {}
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
      console.log('[speakQuestion] Lectura finalizada. Activando micrófono automáticamente...');
      if (!isRecordingRef.current && !isPausedRef.current && intStateRef.current === 'active' && !isTextModeRef.current && microphoneAvailable) {
        startRecordingMedia();
      }
    };

    utterance.onerror = () => {
      setIsAiSpeaking(false);
    };

    window.speechSynthesis.speak(utterance);
  };

  // Reproducir pregunta cuando cambia
  useEffect(() => {
    if (intState === 'active' && currentQuestion && !isMuted) {
      speakQuestion(currentQuestion);
    } else if (isMuted) {
      stopSpeaking();
    }
  }, [currentQuestion, intState, isMuted, availableVoices, selectedVoiceURI, microphoneAvailable]);

  // Detener de forma proactiva la voz, cámara y micrófonos cuando la entrevista deja de estar activa
  useEffect(() => {
    if (intState !== 'active') {
      stopSpeaking();
      if (intState === 'launcher' || intState === 'results') {
        cleanupInterviewSession(false);
      }
    }
  }, [intState]);

  // CONTROL DE WEBCAM (HU03)
  const startWebcam = async () => {
    try {
      if (webcamStreamRef.current) return;
      if (!cameraAvailable) {
        setShowWebcam(false);
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240 } });
      if (webcamVideoRef.current) {
        webcamVideoRef.current.srcObject = stream;
      }
      webcamStreamRef.current = stream;
    } catch (err) {
      console.warn('[Webcam] No se pudo acceder a la cámara:', err.message);
    }
  };

  const stopWebcam = () => {
    if (webcamStreamRef.current) {
      stopStreamTracks(webcamStreamRef.current);
      webcamStreamRef.current = null;
    }
  };

  // ACTIVA/DESACTIVA WEBCAM DURANTE ENTREVISTA
  useEffect(() => {
    if (intState === 'active' && showWebcam && cameraAvailable) {
      startWebcam();
    } else {
      stopWebcam();
    }
  }, [intState, showWebcam, cameraAvailable]);

  // Traducir expresiones faciales detectadas
  const translateExpression = (expr) => {
    const map = {
      neutral: 'Neutral 😐',
      happy: 'Feliz / Sonriente 😊',
      sad: 'Serio / Triste 😟',
      angry: 'Tenso / Enojado 😠',
      fearful: 'Nervioso / Temeroso 😨',
      surprised: 'Sorprendido 😲',
      disgusted: 'Disgustado 🤢'
    };
    return map[expr] || expr;
  };

  // DETECCIÓN GESTUAL LOCAL (HU03, HU04)
  const detectExpressions = async () => {
    const faceapi = window.faceapi;
    if (!faceapi || !faceapiLoaded || !webcamVideoRef.current) return;

    try {
      const detections = await faceapi.detectSingleFace(
        webcamVideoRef.current, 
        new faceapi.TinyFaceDetectorOptions()
      ).withFaceLandmarks().withFaceExpressions();

      if (detections) {
        const expr = detections.expressions;
        const sorted = Object.entries(expr).sort((a, b) => b[1] - a[1]);
        const primary = sorted[0][0];
        setPrimaryExpression(primary);

        // Heurística de contacto visual basada en asimetría de los ojos con la nariz
        const landmarks = detections.landmarks;
        const nose = landmarks.getNose()[0];
        const leftEye = landmarks.getLeftEye()[0];
        const rightEye = landmarks.getRightEye()[0];

        const distLeft = Math.abs(nose._x - leftEye._x);
        const distRight = Math.abs(rightEye._x - nose._x);
        const maxDist = Math.max(distLeft, distRight);
        const asymmetry = maxDist > 0 ? Math.abs(distLeft - distRight) / maxDist : 0;

        const isLooking = asymmetry < 0.35;
        setEyeContact(isLooking);

        // Acumular mediciones
        setAccumulatedExpressions(prev => {
          const copy = { ...prev };
          copy[primary] = (copy[primary] || 0) + 1;
          return copy;
        });

        setAccumulatedEyeContact(prev => {
          const copy = { ...prev };
          const key = isLooking ? 'good' : 'bad';
          copy[key] = (copy[key] || 0) + 1;
          return copy;
        });

        // Configurar alerta didáctica en tiempo real
        if (!isLooking) {
          setLiveHint('👁️ Mantén la mirada fija en la cámara.');
        } else if (primary === 'sad' || primary === 'angry' || primary === 'fearful') {
          setLiveHint('💡 Intenta relajar tu expresión facial.');
        } else if (primary === 'happy') {
          setLiveHint('✓ ¡Excelente actitud y sonrisa!');
        } else {
          setLiveHint('');
        }
      } else {
        setLiveHint('⚠️ Rostro no detectado. Ubícate frente a la cámara.');
        setEyeContact(false);
      }
    } catch (err) {
      console.warn('[Face-API] Error en procesamiento de fotograma:', err);
    }
  };

  // Loop de Face-API
  useEffect(() => {
    if (intState === 'active' && showWebcam && faceapiLoaded && !isPaused && !showProgressLoader) {
      faceapiIntervalRef.current = setInterval(async () => {
        if (webcamVideoRef.current && webcamVideoRef.current.readyState === 4) {
          await detectExpressions();
        }
      }, 1000);
    } else {
      clearInterval(faceapiIntervalRef.current);
    }
    return () => clearInterval(faceapiIntervalRef.current);
  }, [intState, showWebcam, faceapiLoaded, isPaused, showProgressLoader]);

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

    let data = null;
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
    try {
      if (!microphoneAvailable) {
        activateTextFallbackForAudio('El micrófono no está disponible. Puedes responder por escrito.');
        return;
      }

      setErrorMsg('');
      setMicError('');
      setIsRecording(true);
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
      setMicrophoneAvailable(false);
      startLocalSpeechRecognition();
    }
  };

  const handleToggleTextMode = async () => {
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
      setIsTextMode(false);
      startRecordingMedia();
    }
  };

  // INICIAR ENTREVISTA
  const handleStartInterview = async (type, opts = {}) => {
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
    setTimeRemaining(165);
    setEstimatedScore('--');
    setUserTextResponse('');
    setSessionResponses([]);
    setShowRecordingPanel(false);
    setIsRecording(false);
    setIsPaused(false);
    setIsTextMode(!microphoneAvailable);
    setShowWebcam(Boolean(cameraAvailable && opts.skipCamera !== true));

    try {
      const data = await apiRequest('/interview/start', 'POST', {
        profileId: profile?.id || user?.id,
        interviewType: type,
        difficultyLevel: selectedDifficulty
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
        setErrorMsg("Tu perfil profesional está incompleto. Por favor completa nombre, carrera, puesto objetivo, resumen y al menos 1 habilidad técnica y blanda. Redirigiendo en 5s...");
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
        setFinalScore(data.overallScore || 0);
        setGeneralAnalysis(data.generalAnalysis || '');
        setStrengths(data.strengths || []);
        setImprovements(data.improvements || []);
        setRecommendations(data.recommendations || []);
        setSessionResponses(data.sessionResponses || []);
        setInterviewId(pendingInterviewId);
        setCompletedEarly(false);
        setPendingInterviews(prev => prev.filter(p => p.id !== pendingInterviewId));
        setIntState('results');
      }
    } catch (err) {
      setErrorMsg(mapError(err));
    } finally {
      setGeneratingFeedback(false);
    }
  };

  // TERMINAR AHORA: cierra la entrevista con lo respondido y pide el análisis final.
  const handleFinishInterview = async () => {
    if (!interviewId) return;
    stopSpeaking();
    setFinishingInterview(true);
    setErrorMsg('');
    try {
      const data = await apiRequest('/interview/finish', 'POST', { interviewId });

      if (data.discarded) {
        cleanupInterviewSession(true);
        setIntState('launcher');
        setErrorMsg('La entrevista se cerró sin respuestas registradas, así que se descartó.');
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
        setFinalScore(data.overallScore || 0);
        setGeneralAnalysis(data.generalAnalysis || '');
        setStrengths(data.strengths || []);
        setImprovements(data.improvements || []);
        setRecommendations(data.recommendations || []);
        setSessionResponses(data.sessionResponses || []);
        setCompletedEarly(true);
        setActiveInterview(null);
        setInterviewId(null);
        setIntState('results');
      }
    } catch (err) {
      cleanupInterviewSession(true);
      setInterviewId(null);
      setIntState('launcher');
      setErrorMsg(mapError(err));
    } finally {
      setFinishingInterview(false);
    }
  };

  // ABANDONAR: descarta la entrevista en curso (o la detectada al entrar).
  const handleAbandonInterview = async () => {
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
  const handleResumeInterview = () => {
    if (!activeInterview?.interview) return;
    const iv = activeInterview.interview;
    const msgs = activeInterview.messages || [];
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
    setQuestionCount((iv.questions_answered || 0) + 1);
    setTotalQuestions(iv.total_questions || 5);
    setUserTextResponse('');
    setIsPaused(false);
    setCompletedEarly(false);
    setActiveInterview(null);
    setIntState('active');
  };

  // ENVIAR RESPUESTA (Con soporte para envío automático por detección de silencio)
  const handleSendResponse = async () => {
    if (ignorePendingCallbacksRef.current) return;
    const isCurrentlyRecording = isRecordingRef.current;

    // Evitar solicitudes duplicadas o condiciones de carrera (Requerimiento 12)
    if (isSubmittingRef.current || sending || isTranscribing || isStopping || isSavingAnswer || isAdvancingQuestion) {
      console.log('[DEBUG] handleSendResponse: Envio ya en proceso o inhabilitado. Ignorando llamada duplicada.');
      return;
    }

    // Si el usuario no ha hablado en absoluto, evitar avanzar automáticamente
    if (isSilenceDetectedRef.current && !hasUserSpokenRef.current) {
      console.log('[DEBUG] handleSendResponse: Silencio detectado pero el usuario no habló. Evitando avance automático.');
      isSilenceDetectedRef.current = false;
      return;
    }

    if (!userTextResponseRef.current.trim() && !isCurrentlyRecording) {
      console.log('[DEBUG] handleSendResponse: No hay texto de respuesta ni grabación activa.');
      return;
    }

    isSubmittingRef.current = true;
    setErrorMsg('');

    stopSpeaking();

    let textToSubmit = userTextResponseRef.current;

    // Detención automática del audio si el usuario está grabando al presionar Siguiente (Requerimiento 2)
    if (isCurrentlyRecording) {
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
          interviewType: interviewTypeRef.current,
          gesturalData: {
            expressions: accumulatedExpressionsRef.current,
            eyeContact: accumulatedEyeContactRef.current
          }
        })
      });

      const data = await rawRes.json();
      if (ignorePendingCallbacksRef.current) return;
      console.log('[/interview/respond] Respuesta:', data);

      clearInterval(progressInterval);
      setAiProgress(100);
      await new Promise(r => setTimeout(r, 300));
      setShowProgressLoader(false);

      // Caso: IA no disponible durante la entrevista → feedback pendiente
      if (!rawRes.ok && data.pendingFeedback) {
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
          setTimeRemaining(165);
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

        const updatedResponses = [...sessionResponsesRef.current, {
          question: currentQuestionRef.current,
          response: textToSubmit,
          feedback: data.feedback
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
          // Acumular resultados de todas las respuestas
          const scores  = updatedResponses.map(r => r.feedback?.score).filter(s => s != null);
          const avg     = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
          const allStr  = updatedResponses.flatMap(r => r.feedback?.strengths || []);
          const allImp  = updatedResponses.flatMap(r => r.feedback?.improvements || []);
          const allRecs = [];
          const seen    = new Set();
          updatedResponses.flatMap(r => r.feedback?.recommendations || []).forEach(rec => {
            if (rec?.suggested_resource && !seen.has(rec.suggested_resource)) {
              seen.add(rec.suggested_resource);
              allRecs.push(rec);
            }
          });

          setFinalScore(avg);
          setStrengths([...new Set(allStr)].slice(0, 3));
          setImprovements([...new Set(allImp)].slice(0, 3));
          setRecommendations(allRecs.slice(0, 3));
          if (data.feedback?.general_comment) setGeneralAnalysis(data.feedback.general_comment);
          setCompletedEarly(!!data.completedEarly);
          setIntState('results');
          console.log('[DEBUG] Entrevista finalizada. Score total:', avg);
        } else {
          console.log('[DEBUG] Avanzando de pregunta. índice antes:', questionCountRef.current, 'índice después:', questionCountRef.current + 1);
          setIsAdvancingQuestion(true);
          setCurrentQuestion(data.nextQuestion);
          setQuestionCount(prev => prev + 1);
          setUserTextResponse('');
          setTimeRemaining(165);
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

  // Calcular telemetría gestual agregada
  const getGesturalStats = (history) => {
    if (!history || (!history.expressions && !history.eyeContact)) {
      return null;
    }

    const { expressions = {}, eyeContact = {} } = history;
    
    // Calcular porcentaje de contacto visual
    const good = eyeContact.good || 0;
    const bad = eyeContact.bad || 0;
    const totalEye = good + bad;
    const eyeContactPercent = totalEye > 0 ? Math.round((good / totalEye) * 100) : null;

    // Obtener la expresión más frecuente
    const sortedExpr = Object.entries(expressions).sort((a, b) => b[1] - a[1]);
    const dominantExpr = sortedExpr.length > 0 ? sortedExpr[0][0] : null;

    return {
      eyeContactPercent,
      dominantExpr,
      hasData: true
    };
  };

  // Obtener diagnóstico gestual y nivel de dificultad al finalizar o cargar resultados
  useEffect(() => {
    if (intState === 'results' && interviewId) {
      const fetchGesturalSummary = async () => {
        try {
          const { data, error } = await supabase
            .from('interviews')
            .select('difficulty_level, gestural_summary')
            .eq('id', interviewId)
            .single();
          if (data) {
            setGesturalHistory(data.gestural_summary);
            setDifficultyLevel(data.difficulty_level);
          }
        } catch (err) {
          console.error('Error fetching interview summary:', err);
        }
      };
      fetchGesturalSummary();
    }
  }, [intState, interviewId]);

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

      {isProfileEmpty ? (
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
                {mediaPermissionStatus === 'checking'
                  ? 'Verificando cámara y micrófono...'
                  : (!cameraAvailable || !microphoneAvailable)
                    ? 'Puedes continuar la entrevista por escrito aunque falte algún permiso.'
                    : 'Permisos concedidos. Cámara y micrófono listos para la simulación.'}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-[10px] font-bold ${
                cameraAvailable
                  ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
                  : 'bg-slate-50 dark:bg-slate-900/60 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400'
              }`} title={cameraPermissionError || undefined}>
                {cameraAvailable ? <Video className="h-3.5 w-3.5" /> : <VideoOff className="h-3.5 w-3.5" />}
                Cámara {cameraAvailable ? 'disponible' : 'no disponible'}
              </span>
              <span className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-[10px] font-bold ${
                microphoneAvailable
                  ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
                  : 'bg-slate-50 dark:bg-slate-900/60 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400'
              }`} title={microphonePermissionError || undefined}>
                <Mic className="h-3.5 w-3.5" />
                Micrófono {microphoneAvailable ? 'disponible' : 'no disponible'}
              </span>
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
          {activeInterview?.interview && activeInterview.interview.status === 'active' && (
            <div className="bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-500/30 rounded-2xl p-5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-2">
                <Play className="h-4 w-4 text-indigo-600 shrink-0 mt-0.5" />
                <div>
                  <span className="text-xs font-bold text-indigo-800 dark:text-indigo-300 uppercase tracking-wider block">Tienes una entrevista en curso</span>
                  <p className="text-[11px] text-slate-500 dark:text-slate-300 mt-0.5">
                    Entrevista {activeInterview.interview.interview_type} · {activeInterview.interview.questions_answered || 0} de {activeInterview.interview.total_questions || 5} respondidas. Puedes retomarla donde la dejaste.
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
                  Si la IA te repregunta, agrega ejemplo concreto, métricas y estructura STAR.
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
                  onToggleTextMode={handleToggleTextMode}
                  isRecording={isRecording}
                  onToggleRecording={toggleRecording}
                  micDisabled={!microphoneAvailable}
                  showRecordingPanel={showRecordingPanel}
                  recordingSeconds={recordingSeconds}
                  onPause={() => { stopSpeaking(); setIsPaused(true); }}
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
              <div className="relative flex items-center gap-4">
                <AiOrbAvatar
                  status={isAiSpeaking ? 'speaking' : isRecording ? 'listening' : isAnalyzing ? 'analyzing' : 'idle'}
                  orbRef={aiOrbRef}
                />
                <div className="min-w-0">
                  <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 block">Asistente virtual – Entrevistadora IA</span>
                  <h3 className="text-sm font-black text-slate-900 dark:text-white mt-0.5">
                    {isAiSpeaking ? 'Hablando' : isRecording ? 'Escuchando' : isAnalyzing ? 'Analizando' : 'En espera'}
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed mt-1">
                    {isAiSpeaking
                      ? 'La entrevistadora está leyendo la pregunta.'
                      : isRecording
                        ? 'Responde con naturalidad, como en una videollamada.'
                        : isAnalyzing
                          ? 'Revisando tu respuesta para continuar la conversación.'
                          : 'Lista para guiar la simulación.'}
                  </p>
                </div>
              </div>

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
                    <span className="text-[9px] text-slate-400 uppercase tracking-wider block">Tiempo</span>
                    <span className="font-mono text-indigo-650 dark:text-indigo-300">{formatTime(timeRemaining)}</span>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 rounded-xl p-2 space-y-0.5">
                    <span className="text-[9px] text-slate-400 uppercase tracking-wider block">Score</span>
                    <span className="text-emerald-600">{estimatedScore}</span>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/60 rounded-2xl p-5 shadow-sm space-y-4">
              <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-700/60 pb-2">
                <span className="text-[10px] text-indigo-650 dark:text-indigo-300 font-extrabold uppercase tracking-widest">Cámara de Monitoreo</span>
                <button
                  type="button"
                  onClick={() => setShowWebcam(!showWebcam)}
                  className={`p-1.5 rounded-lg border text-[10px] font-bold flex items-center gap-1 cursor-pointer transition-colors ${
                    showWebcam
                      ? 'bg-rose-50 border-rose-200 text-rose-650 hover:bg-rose-100'
                      : 'bg-indigo-50 border-indigo-200 text-indigo-650 hover:bg-indigo-100'
                  }`}
                >
                  {showWebcam ? <VideoOff className="h-3.5 w-3.5" /> : <Video className="h-3.5 w-3.5" />}
                  {showWebcam ? 'Apagar' : 'Encender'}
                </button>
              </div>

              {showWebcam ? (
                <div className="space-y-4">
                  {/* Previsualización de Video */}
                  <div className="relative overflow-hidden rounded-xl bg-slate-950 border border-slate-200 aspect-video flex items-center justify-center">
                    <video
                      ref={webcamVideoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-cover transform scale-x-[-1]"
                    />
                    {!faceapiLoaded && (
                      <div className="absolute inset-0 bg-slate-950/85 flex flex-col items-center justify-center p-4 text-center space-y-2">
                        <Loader2 className="h-6 w-6 text-indigo-400 animate-spin" />
                        <span className="text-[10px] text-slate-300">Cargando modelos faciales...</span>
                      </div>
                    )}
                  </div>

                  {/* Telemetría Gestual Local */}
                  {faceapiLoaded && (
                    <div className="grid grid-cols-2 gap-2 text-[10px] font-bold">
                      <div className="bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 rounded-lg p-2 flex flex-col justify-between">
                        <span className="text-slate-400 uppercase tracking-wider block">Expresión</span>
                        <span className="text-slate-800 dark:text-slate-200 text-xs mt-1 truncate">
                          {primaryExpression ? translateExpression(primaryExpression) : 'Detectando...'}
                        </span>
                      </div>
                      <div className="bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 rounded-lg p-2 flex flex-col justify-between">
                        <span className="text-slate-400 uppercase tracking-wider block">Contacto Visual</span>
                        <span className={`text-xs mt-1 ${eyeContact ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {eyeContact ? '✓ Enfoque' : '✗ Desviado'}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Alertas Didácticas Locales */}
                  {liveHint && (
                    <div className={`p-2.5 rounded-lg text-[10px] font-semibold border flex items-center gap-2 animate-fade-in ${
                      liveHint.includes('✓')
                        ? 'bg-emerald-50 border-emerald-100 text-emerald-800'
                        : 'bg-amber-50 border-amber-100 text-amber-800'
                    }`}>
                      <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                      <span>{liveHint}</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="py-12 bg-slate-50 dark:bg-slate-900/60 border border-dashed border-slate-200 dark:border-slate-700 rounded-xl flex flex-col items-center justify-center text-center space-y-2">
                  <VideoOff className="h-8 w-8 text-slate-350" />
                  <span className="text-xs font-bold text-slate-500">Cámara Apagada</span>
                  <p className="text-[10px] text-slate-400 max-w-[170px] leading-normal">
                    La telemetría gestual y el análisis facial de nerviosismo están apagados.
                  </p>
                </div>
              )}
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
                    strokeDasharray={`${finalScore}, 100`}
                    strokeLinecap="round"
                    stroke="currentColor"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                </svg>
                <div className="absolute flex flex-col items-center justify-center leading-none">
                  <span className="text-4xl font-black text-slate-950 dark:text-white">{finalScore}</span>
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">/ 100</span>
                </div>
              </div>

              <div className="space-y-1">
                <h4 className="text-xs font-black text-slate-950 dark:text-white">
                  {finalScore >= 70 ? '¡Buen trabajo!' : 'Sigue practicando'}
                </h4>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-normal max-w-[180px]">
                  Evaluación basada en {sessionResponses.length} {sessionResponses.length === 1 ? 'pregunta respondida' : 'preguntas respondidas'} en esta simulación.
                </p>
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

              {/* Diagnóstico Gestual y Corporal (Cámara Web) */}
              {gesturalHistory && (
                <div className="space-y-3 pt-4 border-t border-slate-100 animate-fade-in">
                  <span className="text-[9px] text-indigo-650 font-extrabold uppercase tracking-widest block">
                    Diagnóstico Gestual y Corporal (Monitoreo Local)
                  </span>
                  
                  {(() => {
                    const stats = getGesturalStats(gesturalHistory);
                    if (!stats || !stats.hasData) {
                      return (
                          <p className="text-[10px] text-slate-400 italic">
                          No se recopilaron datos gestuales en esta sesión (cámara apagada).
                        </p>
                      );
                    }

                    const eyePercent = stats.eyeContactPercent;
                    const domExpr = stats.dominantExpr;

                    let eyeComment = '';
                    if (eyePercent >= 85) {
                      eyeComment = 'Excelente contacto visual directo. Demuestra seguridad y firmeza.';
                    } else if (eyePercent >= 60) {
                      eyeComment = 'Buen contacto visual general. Intenta enfocar un poco más la cámara al formular ideas complejas.';
                    } else {
                      eyeComment = 'Debes mejorar el enfoque en la cámara. Mirar constantemente hacia los lados puede percibirse como distracción o inseguridad.';
                    }

                    let exprComment = '';
                    const translated = translateExpression(domExpr || 'neutral');
                    if (domExpr === 'happy') {
                      exprComment = 'Tu expresión predominante fue sonriente y cálida. Transmite entusiasmo y adaptabilidad.';
                    } else if (domExpr === 'neutral') {
                      exprComment = 'Mantuviste una expresión neutral y sobria. Indica compostura y un enfoque analítico.';
                    } else if (domExpr === 'sad' || domExpr === 'angry' || domExpr === 'fearful') {
                      exprComment = 'Se detectaron niveles de seriedad o tensión recurrente. Intenta relajar los hombros y gesticular de manera fluida.';
                    } else {
                      exprComment = 'Expresión predominante profesional y controlada.';
                    }

                    return (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                        {/* Tarjeta de Contacto Visual */}
                        <div className="bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 rounded-xl p-3 space-y-1">
                          <div className="flex justify-between items-center">
                            <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Contacto Visual</span>
                            <span className={`text-xs font-black ${eyePercent >= 75 ? 'text-emerald-600' : 'text-amber-600'}`}>
                              {eyePercent}% Correcto
                            </span>
                          </div>
                          <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-normal">
                            {eyeComment}
                          </p>
                        </div>

                        {/* Tarjeta de Lenguaje Corporal */}
                        <div className="bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 rounded-xl p-3 space-y-1">
                          <div className="flex justify-between items-center">
                            <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Expresión Facial</span>
                            <span className="text-xs font-black text-indigo-650">
                              {translated}
                            </span>
                          </div>
                          <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-normal">
                            {exprComment}
                          </p>
                        </div>
                      </div>
                    );
                  })()}
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
                        <span className="text-xs font-black text-emerald-600 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-md border border-emerald-100 dark:border-emerald-500/30">{r.feedback.score} / 100</span>
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

                      {/* Fluidez y Seguridad Lingüística (Muletillas) (HU04) */}
                      {r.feedback.fluency_score !== undefined && (
                        <div className="bg-slate-100/70 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 space-y-1">
                          <div className="flex justify-between items-center text-[10px] font-bold text-slate-500 dark:text-slate-400">
                            <span className="uppercase tracking-wider">Fluidez y Control de Muletillas</span>
                            <span className="text-indigo-650 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-500/30 px-1.5 py-0.5 rounded font-bold">
                              {r.feedback.fluency_score} / 100
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-normal">
                            {r.feedback.fluency_feedback}
                          </p>
                        </div>
                      )}

                      {/* Ejemplo de Respuesta Ideal Sugerida (HU04) */}
                      {r.feedback.examples_ideal_response && r.feedback.examples_ideal_response.length > 0 && (
                        <div className="bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-500/20 rounded-lg p-3 space-y-1">
                          <span className="text-[9px] text-emerald-650 dark:text-emerald-300 font-black uppercase tracking-wider flex items-center gap-1">
                            <Sparkles className="h-3 w-3 text-emerald-650 dark:text-emerald-300 animate-pulse" /> Respuesta Ideal Sugerida
                          </span>
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
