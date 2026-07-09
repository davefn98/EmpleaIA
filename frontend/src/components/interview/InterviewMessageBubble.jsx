import React from 'react';
import { Sparkles, User, MessageCircleQuestion } from 'lucide-react';

/**
 * Burbuja individual de la conversación de entrevista.
 *
 * message: {
 *   role: 'ai' | 'user',
 *   text: string,
 *   kind: 'main' | 'follow_up' (solo mensajes de IA),
 *   questionNumber: number (solo preguntas principales),
 *   feedback: object | null (evaluación adjunta a respuestas del usuario)
 * }
 *
 * showEvaluation: en modo historial muestra el detalle del feedback
 * (comentario general y oportunidades de mejora) bajo la respuesta.
 */
export default function InterviewMessageBubble({ message, totalQuestions, showEvaluation = false }) {
  const isAi = message.role === 'ai';
  const isFollowUp = isAi && message.kind === 'follow_up';

  if (isAi) {
    return (
      <div className="flex items-start gap-2.5">
        <div className="h-7 w-7 rounded-full bg-indigo-100 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-900 flex items-center justify-center shrink-0 mt-0.5">
          <Sparkles className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
        </div>
        <div className="max-w-[85%]">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">Entrevistador IA</span>
            {message.kind === 'main' && message.questionNumber && (
              <span className="text-[9px] font-bold text-indigo-600 dark:text-indigo-400">
                Pregunta {message.questionNumber}{totalQuestions ? ` de ${totalQuestions}` : ''}
              </span>
            )}
            {isFollowUp && (
              <span className="inline-flex items-center gap-1 bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-900/60 text-[8.5px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded">
                <MessageCircleQuestion className="h-2.5 w-2.5" />
                Repregunta
              </span>
            )}
          </div>
          <div className={`rounded-2xl rounded-tl-sm px-3.5 py-2.5 text-xs leading-relaxed font-medium text-slate-800 dark:text-slate-100 ${
            isFollowUp
              ? 'bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200/70 dark:border-amber-900/40'
              : 'bg-slate-100 dark:bg-slate-800 border border-slate-150 dark:border-slate-700/60'
          }`}>
            {message.text}
          </div>
          {isFollowUp && (
            <p className="text-[9px] text-amber-600 dark:text-amber-500 font-semibold mt-1">
              Profundiza tu respuesta: agrega un ejemplo concreto, métricas o estructura STAR.
            </p>
          )}
        </div>
      </div>
    );
  }

  const score = message.feedback?.score;
  const hasScore = typeof score === 'number';

  return (
    <div className="flex items-start gap-2.5 justify-end">
      <div className="max-w-[85%] flex flex-col items-end">
        <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-1">Tú</span>
        <div className="bg-indigo-600 text-white rounded-2xl rounded-tr-sm px-3.5 py-2.5 text-xs leading-relaxed font-medium whitespace-pre-wrap">
          {message.text}
        </div>
        {hasScore && (
          <span className={`mt-1 text-[9px] font-black px-2 py-0.5 rounded-full border ${
            score >= 70
              ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-450 border-emerald-200 dark:border-emerald-900/60'
              : score >= 40
                ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-450 border-amber-200 dark:border-amber-900/60'
                : 'bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-450 border-rose-200 dark:border-rose-900/60'
          }`}>
            Puntaje: {score}/100
          </span>
        )}
        {showEvaluation && message.feedback && (
          <div className="mt-1.5 w-full bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-800 rounded-xl p-3 space-y-2 text-left">
            {message.feedback.general_comment && (
              <div>
                <span className="text-slate-400 block text-[8.5px] font-bold uppercase mb-0.5">Feedback</span>
                <p className="text-[11px] text-slate-650 dark:text-slate-350 leading-relaxed font-medium">{message.feedback.general_comment}</p>
              </div>
            )}
            {Array.isArray(message.feedback.improvements) && message.feedback.improvements.length > 0 && (
              <div>
                <span className="text-slate-400 block text-[8.5px] font-bold uppercase mb-1">Oportunidades de mejora</span>
                <ul className="list-disc pl-4 text-[11px] text-slate-500 dark:text-slate-400 space-y-0.5 font-medium">
                  {message.feedback.improvements.map((imp, idx) => (
                    <li key={idx}>{imp}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
      <div className="h-7 w-7 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center shrink-0 mt-0.5">
        <User className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
      </div>
    </div>
  );
}
