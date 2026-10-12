// Reconstruye resultados desde el mismo historial que alimenta el chat, incluidas repreguntas.
export const restoreInterviewResponses = (messages = []) => {
 const pairs=[];let question=null;let followUp=false;
 for(const m of messages){
  if(m.sender==='ai'){question=m.message_content;followUp=m.evaluation?.message_kind==='follow_up';}
  else if(m.sender==='user'){
   if(followUp && pairs.length){const p=pairs.at(-1);p.response+=`\n[Repregunta] ${question}\n[Ampliación] ${m.message_content}`;p.feedback=m.evaluation || {};}
   else pairs.push({question:question || 'Presentación inicial',response:m.message_content,feedback:m.evaluation || {}});
  }
 }
 return pairs;
};
export const interviewAverageScore = (responses=[]) => {
 const scores=responses.map(r=>r.feedback?.score).filter(s=>Number.isFinite(s)&&s>=0&&s<=100);
 return scores.length ? Math.round(scores.reduce((a,b)=>a+b,0)/scores.length) : null;
};

// La modalidad canónica viaja junto a la instantánea y se guarda atómicamente al pausar.
export const resolveInterviewResponseMode = (snapshot, messages = [], localMode = null) => {
  let context = snapshot;
  if(typeof snapshot === 'string') {try {context = JSON.parse(snapshot);} catch {context = null;}}
  const isMode = value => value === 'voice' || value === 'text';
  if(isMode(context?.response_mode)) return context.response_mode;
  if(isMode(localMode)) return localMode;
  const latestResponse = [...messages].reverse().find(m=>m.sender === 'user' && isMode(m.evaluation?.response_mode));
  if(latestResponse) return latestResponse.evaluation.response_mode;
  const firstQuestion = messages.find(m=>m.sender === 'ai');
  return isMode(firstQuestion?.evaluation?.response_mode) ? firstQuestion.evaluation.response_mode : null;
};
