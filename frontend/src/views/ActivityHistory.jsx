import React, { useState, useEffect } from 'react';
import { supabase } from '../utils/supabaseClient';
import { apiRequest } from '../utils/api';
import { Clock, FileText, Mail, MessageSquare, Loader2, AlertCircle, X, ChevronRight, User, BookOpen, Briefcase, Award } from 'lucide-react';
import InterviewConversationPanel from '../components/interview/InterviewConversationPanel';

const TYPE_LABEL = { general: 'General', technical: 'Técnica', behavioral: 'Por competencias' };
const STATUS_LABEL = {active:'En curso',paused:'Pausada',completed:'Completada',completed_early:'Finalizada anticipadamente',pending_ai_feedback:'Análisis de IA pendiente',failed_to_start:'No iniciada',abandoned:'Descartada'};
const DIFFICULTY_LABEL = { basic: 'Básico', intermediate: 'Intermedio', advanced: 'Avanzado' };

export default function ActivityHistory({ setActiveView }) {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  const [selectedItem, setSelectedItem] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { setLoading(false); return; }
        const uid = session.user.id;

        const activity = await apiRequest(`/activity/${uid}`, 'GET');
        const cvs = { data: activity.cvs };
        const letters = { data: activity.letters };
        const interviews = { data: activity.interviews };

        const events = [];

        (cvs.data || []).forEach(c => events.push({
          kind: 'cv',
          title: c.document_title || 'CV generado',
          date: c.created_at,
          cvData: c.cv_data,
          cvStyle: c.cv_style,
        }));

        (letters.data || []).forEach(l => events.push({
          kind: 'letter',
          title: l.document_title || `Carta${l.company ? ` para ${l.company}` : ' de presentación'}`,
          date: l.created_at,
          letterContent: l.letter_content,
          jobOfferText: l.job_offer_text,
        }));

        (interviews.data || []).forEach(iv => {
          // Ordenar los mensajes por fecha de creación para mostrarlos cronológicamente
          const sortedMsgs = (iv.interview_messages || []).sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

          const scores = sortedMsgs
            .filter(m => m.sender === 'user' && m.evaluation && typeof m.evaluation.score === 'number')
            .map(m => m.evaluation.score);
          const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
          
          events.push({
            id: iv.id,
            kind: 'interview',
            title: `Entrevista ${TYPE_LABEL[iv.interview_type] || iv.interview_type}`,
            date: iv.completed_at || iv.created_at,
            meta: avg != null ? `Puntaje ${avg}/100` : (STATUS_LABEL[iv.status] || 'Sin evaluar'),
            status: iv.status,
            messages: sortedMsgs,
            sessionSummary: [...sortedMsgs].reverse().find(m=>m.evaluation?.session_summary)?.evaluation.session_summary || null,
            score: avg,
            interviewType: iv.interview_type,
            difficultyLevel: iv.difficulty_level || 'intermediate',
          });
        });

        events.sort((a, b) => new Date(b.date) - new Date(a.date));
        setItems(events);
        const requestedId=sessionStorage.getItem('empleaia_history_interview_id');
        if(requestedId){const requested=events.find(e=>e.kind==='interview' && e.id===requestedId);if(requested)setSelectedItem(requested);sessionStorage.removeItem('empleaia_history_interview_id');}

      } catch (err) {
        console.error('[ActivityHistory] Error:', err);
        // Con sesión expirada api.js ya cerró sesión y App redirige al login.
        if (err.code !== 'SESSION_EXPIRED') {
          setError('No se pudo cargar el historial de actividad.');
        }
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [reloadKey]);

  // Escape key listener to close modal
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setSelectedItem(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const fmt = (d) => new Date(d).toLocaleString('es-PE', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });

  const iconFor = (kind) => (kind === 'cv' ? FileText : kind === 'letter' ? Mail : MessageSquare);
  const colorFor = (kind) =>
    kind === 'cv' ? 'text-indigo-600 bg-indigo-50 border-indigo-100 dark:text-indigo-400 dark:bg-indigo-950/40 dark:border-indigo-900/40'
    : kind === 'letter' ? 'text-emerald-600 bg-emerald-50 border-emerald-100 dark:text-emerald-400 dark:bg-emerald-950/40 dark:border-emerald-900/40'
    : 'text-amber-600 bg-amber-50 border-amber-100 dark:text-amber-400 dark:bg-amber-950/40 dark:border-amber-900/40';
  const labelFor = (kind) => (kind === 'cv' ? 'CV' : kind === 'letter' ? 'Carta' : 'Entrevista');

  const handleRestoreCv = (cvData) => {
    localStorage.setItem('empleaia_historical_cv_data', JSON.stringify(cvData));
    setSelectedItem(null);
    if (setActiveView) {
      setActiveView('documents-cv');
    }
  };

  if (loading) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Loader2 className="h-7 w-7 text-indigo-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-full overflow-y-auto bg-slate-50 dark:bg-slate-950 px-4 py-6 sm:px-6 lg:px-8 transition-colors duration-300">
      <div className="mx-auto w-full max-w-[900px] space-y-6">
        <div className="flex items-center gap-2">
          <Clock className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
          <h2 className="text-lg font-black text-slate-900 dark:text-white">Historial de actividad</h2>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Todas tus acciones (CVs, cartas y entrevistas) ordenadas de la más reciente a la más antigua. Haz clic en cualquier elemento para inspeccionar sus detalles.
        </p>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-center gap-2 text-xs text-red-700 dark:bg-red-950/40 dark:border-red-900 dark:text-red-400">
            <AlertCircle className="h-4 w-4 shrink-0" /> {error}
            <button
              onClick={() => setReloadKey(k => k + 1)}
              className="ml-auto shrink-0 bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg cursor-pointer"
            >
              Reintentar
            </button>
          </div>
        )}

        {/* Con error de carga no se muestra el estado vacío: son cosas distintas */}
        {error ? null : items.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 text-center text-sm text-slate-500 dark:text-slate-400">
            Aún no tienes actividad registrada. Genera un CV, una carta o realiza una entrevista para verlos aquí.
          </div>
        ) : (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl divide-y divide-slate-100 dark:divide-slate-800/60 overflow-hidden shadow-sm">
            {items.map((ev, i) => {
              const Icon = iconFor(ev.kind);
              return (
                <div 
                  key={i} 
                  onClick={() => setSelectedItem(ev)}
                  className="flex items-center gap-3 p-4 hover:bg-slate-50 dark:hover:bg-slate-850/40 cursor-pointer transition-colors group"
                >
                  <div className={`h-9 w-9 rounded-xl border flex items-center justify-center shrink-0 ${colorFor(ev.kind)}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1 text-left">
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] font-black uppercase tracking-wide text-slate-400 dark:text-slate-500">{labelFor(ev.kind)}</span>
                      {ev.meta && <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">· {ev.meta}</span>}
                    </div>
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{ev.title}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[11px] text-slate-450 dark:text-slate-500 font-medium">{fmt(ev.date)}</span>
                    <ChevronRight className="h-4 w-4 text-slate-350 dark:text-slate-600 group-hover:translate-x-0.5 transition-transform" />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* RICH MODAL DETAIL OVERLAY */}
      {selectedItem && (
        <div 
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
          onClick={() => setSelectedItem(null)}
        >
          <div 
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden text-slate-800 dark:text-slate-100 animate-scale-up"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-5 border-b border-slate-150 dark:border-slate-800 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-2.5">
                <div className={`h-8 w-8 rounded-lg border flex items-center justify-center ${colorFor(selectedItem.kind)}`}>
                  {React.createElement(iconFor(selectedItem.kind), { className: 'h-4 w-4' })}
                </div>
                <div className="text-left">
                  <span className="text-[9px] font-extrabold uppercase tracking-widest text-slate-400 dark:text-slate-500">
                    Detalle de {labelFor(selectedItem.kind)}
                  </span>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white leading-tight">
                    {selectedItem.title}
                  </h3>
                </div>
              </div>
              <button 
                onClick={() => setSelectedItem(null)}
                className="h-8 w-8 rounded-lg border border-slate-200 dark:border-slate-800 flex items-center justify-center text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Scrollable Body */}
            <div className="p-6 overflow-y-auto space-y-5 text-left text-xs leading-relaxed">
              
              {/* DATE METADATA */}
              <div className="flex justify-between items-center bg-slate-50 dark:bg-slate-850/40 p-3 rounded-xl border border-slate-150 dark:border-slate-800/80">
                <span className="text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider text-[9px]">Fecha de creación</span>
                <span className="text-slate-800 dark:text-slate-200 font-extrabold">{fmt(selectedItem.date)}</span>
              </div>

              {/* -------------------- DETAIL FOR CV -------------------- */}
              {selectedItem.kind === 'cv' && (
                <div className="space-y-4">
                  {selectedItem.cvData ? (
                    <>
                      {/* Datos Personales */}
                      <div className="space-y-2">
                        <h4 className="text-[10px] font-extrabold uppercase tracking-wider text-slate-450 dark:text-slate-500 flex items-center gap-1.5 border-b border-slate-100 dark:border-slate-800 pb-1">
                          <User className="h-3.5 w-3.5" /> Datos Personales y de Contacto
                        </h4>
                        <div className="grid grid-cols-2 gap-3 bg-slate-50/50 dark:bg-slate-850/20 p-3 rounded-xl border border-slate-150/40 dark:border-slate-800/40">
                          <div>
                            <span className="text-slate-400 block text-[9px]">Nombre completo</span>
                            <span className="font-bold text-slate-850 dark:text-slate-200">
                              {selectedItem.cvData.first_name || selectedItem.cvData.firstName || ''} {selectedItem.cvData.last_name || selectedItem.cvData.lastName || ''}
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-400 block text-[9px]">Puesto objetivo</span>
                            <span className="font-bold text-slate-850 dark:text-slate-200">{selectedItem.cvData.target_role || selectedItem.cvData.targetRole || 'No especificado'}</span>
                          </div>
                          <div>
                            <span className="text-slate-400 block text-[9px]">Correo electrónico</span>
                            <span className="font-bold text-slate-850 dark:text-slate-200">{selectedItem.cvData.email || 'No especificado'}</span>
                          </div>
                          <div>
                            <span className="text-slate-400 block text-[9px]">Teléfono</span>
                            <span className="font-bold text-slate-850 dark:text-slate-200">{selectedItem.cvData.phone || 'No especificado'}</span>
                          </div>
                          <div className="col-span-2">
                            <span className="text-slate-400 block text-[9px]">Carrera técnica</span>
                            <span className="font-bold text-slate-850 dark:text-slate-200">{selectedItem.cvData.career || 'No especificado'}</span>
                          </div>
                          {selectedItem.cvData.bio && (
                            <div className="col-span-2">
                              <span className="text-slate-400 block text-[9px]">Perfil profesional / Bio</span>
                              <p className="text-slate-700 dark:text-slate-300 font-medium mt-0.5">{selectedItem.cvData.bio}</p>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Habilidades */}
                      <div className="space-y-2">
                        <h4 className="text-[10px] font-extrabold uppercase tracking-wider text-slate-450 dark:text-slate-500 flex items-center gap-1.5 border-b border-slate-100 dark:border-slate-800 pb-1">
                          <Award className="h-3.5 w-3.5" /> Habilidades
                        </h4>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <span className="text-slate-400 block text-[9px] mb-1 font-bold">Habilidades Técnicas</span>
                            <div className="flex flex-wrap gap-1">
                              {Array.isArray(selectedItem.cvData.technical_skills || selectedItem.cvData.techSkills) ? (
                                (selectedItem.cvData.technical_skills || selectedItem.cvData.techSkills).map((s, idx) => (
                                  <span key={idx} className="bg-indigo-50 dark:bg-indigo-950/40 text-indigo-650 dark:text-indigo-400 px-2 py-0.5 rounded text-[10px] border border-indigo-100/50 dark:border-indigo-900/40 font-bold">{s}</span>
                                ))
                              ) : <span className="text-slate-450 italic">Ninguna</span>}
                            </div>
                          </div>
                          <div>
                            <span className="text-slate-400 block text-[9px] mb-1 font-bold">Habilidades Blandas</span>
                            <div className="flex flex-wrap gap-1">
                              {Array.isArray(selectedItem.cvData.soft_skills || selectedItem.cvData.softSkills) ? (
                                (selectedItem.cvData.soft_skills || selectedItem.cvData.softSkills).map((s, idx) => (
                                  <span key={idx} className="bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded text-[10px] border border-emerald-100/50 dark:border-emerald-900/40 font-bold">{s}</span>
                                ))
                              ) : <span className="text-slate-450 italic">Ninguna</span>}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Experiencia Laboral */}
                      <div className="space-y-2">
                        <h4 className="text-[10px] font-extrabold uppercase tracking-wider text-slate-450 dark:text-slate-500 flex items-center gap-1.5 border-b border-slate-100 dark:border-slate-800 pb-1">
                          <Briefcase className="h-3.5 w-3.5" /> Experiencia Laboral
                        </h4>
                        <div className="space-y-3">
                          {Array.isArray(selectedItem.cvData.work_experience || selectedItem.cvData.experience) && (selectedItem.cvData.work_experience || selectedItem.cvData.experience).length > 0 ? (
                            (selectedItem.cvData.work_experience || selectedItem.cvData.experience).map((exp, idx) => (
                              <div key={idx} className="bg-slate-50/40 dark:bg-slate-850/10 p-3 rounded-xl border border-slate-150/40 dark:border-slate-800/40 space-y-1">
                                <div className="flex justify-between items-baseline font-bold text-slate-850 dark:text-slate-200">
                                  <span>{exp.role || exp.puesto} - {exp.company || exp.empresa}</span>
                                  <span className="text-[9px] text-slate-450 font-medium">{exp.start_date || exp.fecha_inicio} - {exp.end_date || exp.fecha_fin || 'Presente'}</span>
                                </div>
                                {exp.description && <p className="text-slate-650 dark:text-slate-400 mt-1">{exp.description}</p>}
                                {Array.isArray(exp.achievements) && exp.achievements.length > 0 && (
                                  <ul className="list-disc pl-4 text-slate-600 dark:text-slate-400 mt-1.5 space-y-0.5">
                                    {exp.achievements.map((ach, aIdx) => <li key={aIdx}>{ach}</li>)}
                                  </ul>
                                )}
                              </div>
                            ))
                          ) : (
                            <p className="text-slate-450 italic">Sin experiencia laboral declarada.</p>
                          )}
                        </div>
                      </div>

                      {/* Formacion Academica */}
                      <div className="space-y-2">
                        <h4 className="text-[10px] font-extrabold uppercase tracking-wider text-slate-450 dark:text-slate-500 flex items-center gap-1.5 border-b border-slate-100 dark:border-slate-800 pb-1">
                          <BookOpen className="h-3.5 w-3.5" /> Formación Académica
                        </h4>
                        <div className="space-y-3">
                          {Array.isArray(selectedItem.cvData.academic_background || selectedItem.cvData.education) && (selectedItem.cvData.academic_background || selectedItem.cvData.education).length > 0 ? (
                            (selectedItem.cvData.academic_background || selectedItem.cvData.education).map((edu, idx) => (
                              <div key={idx} className="bg-slate-50/40 dark:bg-slate-850/10 p-3 rounded-xl border border-slate-150/40 dark:border-slate-800/40 space-y-1">
                                <div className="flex justify-between items-baseline font-bold text-slate-850 dark:text-slate-200">
                                  <span>{edu.degree || edu.titulo || 'Estudio'} en {edu.field_of_study || edu.carrera || 'Especialidad'}</span>
                                  <span className="text-[9px] text-slate-450 font-medium">{edu.start_date || edu.fecha_inicio || ''} - {edu.end_date || edu.fecha_fin || edu.graduation_year || ''}</span>
                                </div>
                                <p className="text-slate-650 dark:text-slate-400 font-semibold">{edu.school || edu.institucion}</p>
                              </div>
                            ))
                          ) : (
                            <p className="text-slate-450 italic">Sin formación académica declarada.</p>
                          )}
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="text-center py-6 text-slate-450 italic">
                      No se encontraron detalles estructurados para este CV.
                    </div>
                  )}
                </div>
              )}

              {/* -------------------- DETAIL FOR LETTER -------------------- */}
              {selectedItem.kind === 'letter' && (
                <div className="space-y-4">
                  {selectedItem.jobOfferText && (
                    <div className="space-y-1 bg-slate-50 dark:bg-slate-850/30 p-3.5 rounded-xl border border-slate-150 dark:border-slate-800/80">
                      <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">Oferta de Empleo Analizada</span>
                      <p className="text-slate-700 dark:text-slate-350 max-h-24 overflow-y-auto whitespace-pre-line leading-relaxed pr-1">
                        {selectedItem.jobOfferText}
                      </p>
                    </div>
                  )}
                  {selectedItem.letterContent ? (
                    <div className="space-y-2.5">
                      <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">Carta Generada por la IA</span>
                      <div className="bg-slate-50 dark:bg-slate-850/40 p-4 rounded-xl border border-slate-150 dark:border-slate-800 text-slate-850 dark:text-slate-200 whitespace-pre-line font-medium leading-relaxed font-mono text-[11px] select-all">
                        {selectedItem.letterContent}
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-6 text-slate-450 italic">
                      No hay contenido disponible para esta carta.
                    </div>
                  )}
                </div>
              )}

              {/* -------------------- DETAIL FOR INTERVIEW -------------------- */}
              {selectedItem.kind === 'interview' && (
                <div className="space-y-4">
                  {/* Status Banner */}
                  <div className="flex justify-between items-center py-1.5 gap-3">
                    <span className="text-slate-450 font-bold uppercase tracking-wider text-[9px]">Estado de entrevista</span>
                    <span className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border ${
                      ['completed','completed_early'].includes(selectedItem.status) 
                        ? 'bg-emerald-50 border-emerald-100 text-emerald-600 dark:bg-emerald-950/40 dark:border-emerald-900/50 dark:text-emerald-400' 
                        : 'bg-amber-50 border-amber-100 text-amber-600 dark:bg-amber-950/40 dark:border-amber-900/50 dark:text-amber-400'
                    }`}>
                      {STATUS_LABEL[selectedItem.status] || 'Estado desconocido'}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border-t border-slate-100 dark:border-slate-800/80 pt-3">
                    <div className="bg-slate-50 dark:bg-slate-850/30 border border-slate-150 dark:border-slate-800 rounded-xl p-3">
                      <span className="text-slate-400 block text-[9px] font-bold uppercase tracking-wider">Tipo</span>
                      <span className="text-xs font-black text-slate-800 dark:text-slate-200">{TYPE_LABEL[selectedItem.interviewType] || selectedItem.interviewType}</span>
                    </div>
                    <div className="bg-slate-50 dark:bg-slate-850/30 border border-slate-150 dark:border-slate-800 rounded-xl p-3">
                      <span className="text-slate-400 block text-[9px] font-bold uppercase tracking-wider">Dificultad</span>
                      <span className="text-xs font-black text-slate-800 dark:text-slate-200">{DIFFICULTY_LABEL[selectedItem.difficultyLevel] || selectedItem.difficultyLevel || 'Intermedio'}</span>
                    </div>
                  </div>

                  {/* Avg Score */}
                  {selectedItem.score !== null && (
                    <div className="flex justify-between items-center border-t border-slate-100 dark:border-slate-800/80 pt-3">
                      <span className="text-slate-450 font-bold uppercase tracking-wider text-[9px]">Calificación Promedio</span>
                      <span className={`text-xs font-black px-2.5 py-0.5 rounded-lg border ${
                        selectedItem.score >= 80 ? 'bg-emerald-50 border-emerald-100 text-emerald-600 dark:bg-emerald-950/40 dark:border-emerald-900 dark:text-emerald-400' :
                        selectedItem.score >= 60 ? 'bg-amber-50 border-amber-100 text-amber-600 dark:bg-amber-950/40 dark:border-amber-900 dark:text-amber-400' :
                        'bg-rose-50 border-rose-100 text-rose-600 dark:bg-rose-950/40 dark:border-rose-900 dark:text-rose-400'
                      }`}>
                        {selectedItem.score}/100
                      </span>
                    </div>
                  )}

                  {selectedItem.sessionSummary && <div className="rounded-xl border border-indigo-200 dark:border-indigo-900 p-4 space-y-2">
                    <h4 className="text-xs font-bold">Análisis final generado con IA</h4>
                    <p className="text-xs text-slate-600 dark:text-slate-300">{selectedItem.sessionSummary.general_analysis}</p>
                    <p className="text-xs text-slate-500">Valoración global adicional de IA: {selectedItem.sessionSummary.overall_score}/100.</p>
                    {(selectedItem.sessionSummary.recommendations || []).map((r,i)=><p key={i} className="text-xs text-slate-600 dark:text-slate-300"><strong>{r.suggested_resource}</strong>: {r.reason}</p>)}
                  </div>}
                  {/* Conversación completa de la entrevista (incluye repreguntas) */}
                  <div className="space-y-4 pt-2">
                    <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">Conversación de la Entrevista</span>
                    {selectedItem.messages && selectedItem.messages.length > 0 ? (
                      (() => {
                        // Mapear interview_messages al formato de burbujas del chat.
                        // Los mensajes ai sin metadata (entrevistas antiguas) cuentan como 'main'.
                        let mainCounter = 0;
                        const chatMsgs = selectedItem.messages.map(m => {
                          if (m.sender === 'ai') {
                            const kind = m.evaluation?.message_kind || 'main';
                            if (kind === 'main') mainCounter += 1;
                            return {
                              id: m.id || `${m.created_at}-ai`,
                              role: 'ai',
                              text: m.message_content,
                              kind,
                              questionNumber: m.evaluation?.question_index || (kind === 'main' ? mainCounter : undefined)
                            };
                          }
                          return {
                            id: m.id || `${m.created_at}-user`,
                            role: 'user',
                            text: m.message_content,
                            feedback: m.evaluation
                          };
                        });
                        return (
                          <InterviewConversationPanel
                            messages={chatMsgs}
                            readOnly
                            showEvaluation
                            heightClass="max-h-[480px]"
                          />
                        );
                      })()
                    ) : (
                      <p className="text-center py-6 text-slate-450 italic">No hay interacciones registradas en esta simulación.</p>
                    )}
                  </div>
                </div>
              )}

            </div>

            {((selectedItem.kind === 'cv' && selectedItem.cvData) || selectedItem.kind === 'interview') && (
            <div className="p-4 border-t border-slate-150 dark:border-slate-800 flex justify-end gap-3 bg-slate-50/60 dark:bg-slate-900/60 shrink-0">
              {selectedItem.kind === 'cv' && selectedItem.cvData && (
                <button 
                  onClick={() => handleRestoreCv(selectedItem.cvData)}
                  className="bg-indigo-650 hover:bg-indigo-700 text-white font-bold px-5 py-2.5 rounded-xl transition-all shadow-md shadow-indigo-600/10 cursor-pointer text-xs"
                >
                  Usar estos datos en Curriculum Vitae
                </button>
              )}

              {selectedItem.kind === 'interview' && (
                <button 
                  onClick={() => { setSelectedItem(null); if (setActiveView) setActiveView('interviews'); }}
                  className="bg-indigo-650 hover:bg-indigo-700 text-white font-bold px-5 py-2.5 rounded-xl transition-all shadow-md shadow-indigo-600/10 cursor-pointer text-xs"
                >
                  Ir al Simulador de Entrevistas
                </button>
              )}
            </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
