import React from 'react';
import InterviewChat from './InterviewChat';

/**
 * Panel conversacional de entrevista: hilo de chat + zona de entrada.
 *
 * - Modo activo (Interviews.jsx): recibe la zona de entrada como children
 *   (input, estados de pausa/carga) y la renderiza bajo el hilo.
 * - Modo lectura (readOnly, para /historial): solo muestra el hilo completo
 *   con las evaluaciones de cada respuesta.
 */
export default function InterviewConversationPanel({
  messages,
  totalQuestions,
  typing = false,
  typingLabel,
  showEvaluation = false,
  readOnly = false,
  heightClass,
  children
}) {
  return (
    <div className="space-y-5">
      <InterviewChat
        messages={messages}
        totalQuestions={totalQuestions}
        typing={typing}
        typingLabel={typingLabel}
        showEvaluation={showEvaluation}
        heightClass={heightClass}
      />
      {!readOnly && children}
    </div>
  );
}
