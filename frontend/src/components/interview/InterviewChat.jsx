import React, { useEffect, useRef } from 'react';
import { Sparkles } from 'lucide-react';
import InterviewMessageBubble from './InterviewMessageBubble';

/**
 * Hilo scrolleable de la conversación de entrevista.
 * Presentacional: recibe los mensajes ya construidos y hace autoscroll al fondo.
 */
export default function InterviewChat({
  messages = [],
  totalQuestions,
  typing = false,
  typingLabel = 'El entrevistador está escribiendo…',
  showEvaluation = false,
  heightClass = 'h-[380px]'
}) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, typing]);

  return (
    <div className={`bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 overflow-y-auto space-y-4 ${heightClass}`}>
      {messages.length === 0 && !typing && (
        <p className="text-center text-[11px] text-slate-400 dark:text-slate-500 italic py-8">
          La conversación aparecerá aquí.
        </p>
      )}
      {messages.map((msg) => (
        <InterviewMessageBubble
          key={msg.id}
          message={msg}
          totalQuestions={totalQuestions}
          showEvaluation={showEvaluation}
        />
      ))}
      {typing && (
        <div className="flex items-start gap-2.5">
          <div className="h-7 w-7 rounded-full bg-indigo-100 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-900 flex items-center justify-center shrink-0">
            <Sparkles className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div className="bg-slate-100 dark:bg-slate-800 border border-slate-150 dark:border-slate-700/60 rounded-2xl rounded-tl-sm px-3.5 py-2.5 flex items-center gap-2">
            <span className="flex gap-1">
              <span className="h-1.5 w-1.5 bg-slate-400 dark:bg-slate-500 rounded-full animate-bounce [animation-delay:0ms]" />
              <span className="h-1.5 w-1.5 bg-slate-400 dark:bg-slate-500 rounded-full animate-bounce [animation-delay:150ms]" />
              <span className="h-1.5 w-1.5 bg-slate-400 dark:bg-slate-500 rounded-full animate-bounce [animation-delay:300ms]" />
            </span>
            <span className="text-[10px] text-slate-450 dark:text-slate-400 font-semibold">{typingLabel}</span>
          </div>
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );
}
