import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../utils/supabaseClient';
import { PILOT_BUILD } from '../utils/pi2Validation';
import { flushFinishedLegacyTimer } from '../utils/pi2TaskTimer';
import PilotParticipant from '../components/validation/PilotParticipant';
import PilotReport from '../components/validation/PilotReport';

const participantFields = 'code, build, enrolled_at, satisfaction, satisfaction_at, confidence_before, confidence_before_at, confidence_after, confidence_after_at, interview_id';
const reviewFields = 'id, participant_code, artifact, reference, scores, notes, recorded_at';
const tabStyle = 'rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold dark:border-slate-600';

async function unwrap(request) {
  const { data, error } = await request;
  if (error) throw error;
  return data;
}

async function readAll(query) {
  const pageSize = 500;
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const page = await unwrap(query.range(from, from + pageSize - 1));
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

function readReport() {
  return Promise.all([
    readAll(supabase.from('pi2_participants').select(participantFields).order('code')),
    readAll(supabase.from('pi2_task_times').select('*').order('participant_code').order('task').order('method')),
    readAll(supabase.from('pi2_generation_attempts').select('*').order('id')),
    readAll(supabase.from('pi2_project_evidence').select('*').order('id')),
    readAll(supabase.from('pi2_quality_reviews').select(reviewFields).order('id')),
  ]).then(([participants, times, generations, evidence, reviews]) => ({ participants, times, generations, evidence, reviews }));
}

function friendlyError(error) {
  if (['PGRST202', 'PGRST205', '42P01', '42883'].includes(error.code)) return 'Aplica las migraciones de Validación PI2 en orden (v15 y v16) desde Supabase.';
  if (error.code === 'P0001') return error.message;
  if (error.code === '23505') return 'Este registro ya existe. Actualiza la pantalla para verlo.';
  if (error.code === '23514') return 'Revisa los campos. Los elementos verificados requieren una referencia de evidencia.';
  return 'No se pudo completar la operación. Vuelve a intentarlo.';
}

export default function Pi2Validation({ userId }) {
  const [tab, setTab] = useState('participant');
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const [reviewer, participant] = await Promise.all([
      unwrap(supabase.rpc('pi2_is_reviewer')),
      unwrap(supabase.from('pi2_participants').select(participantFields).eq('user_id', userId).maybeSingle()),
    ]);
    if (participant) {
      try { await flushFinishedLegacyTimer(supabase, userId); }
      catch { /* La medición anterior se conserva en la pestaña para reintentar. */ }
    }
    const [times, generations, interviews, report] = await Promise.all([
      participant ? unwrap(supabase.from('pi2_task_times').select('*').eq('participant_code', participant.code)) : [],
      participant ? readAll(supabase.from('pi2_generation_attempts').select('*').eq('participant_code', participant.code).eq('build', participant.build).order('recorded_at', { ascending: false }).order('id')) : [],
      participant?.confidence_before_at ? unwrap(supabase.from('interviews').select('id, interview_type, created_at').eq('profile_id', userId)
        .in('status', ['completed', 'completed_early']).gte('created_at', participant.confidence_before_at).order('created_at', { ascending: false })) : [],
      reviewer ? readReport() : null,
    ]);
    return { participant, times, generations, interviews, report };
  }, [userId]);

  useEffect(() => {
    let active = true;
    load().then((result) => { if (active) setData(result); })
      .catch((cause) => { if (active) setError(friendlyError(cause)); });
    return () => { active = false; };
  }, [load]);

  const run = async (action, successMessage = '') => {
    if (busy) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      if (action) await unwrap(action());
      setData(await load());
      setMessage(successMessage);
    } catch (cause) {
      setError(friendlyError(cause));
    } finally {
      setBusy(false);
    }
  };

  return <main className="flex-1 overflow-y-auto bg-slate-50 p-4 text-slate-900 dark:bg-slate-900 dark:text-slate-100 sm:p-6">
    <div className="mx-auto max-w-6xl space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div><h1 className="text-2xl font-black">Validación PI2</h1><p className="mt-1 text-sm">Pruebas del piloto con egresados de CIBERTEC. Versión activa: {PILOT_BUILD}.</p></div>
        <button type="button" className={tabStyle} onClick={() => run()} disabled={busy}>Actualizar</button>
      </header>
      {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800 dark:bg-rose-950 dark:text-rose-200">{error}</p>}
      {message && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">{message}</p>}
      {!data && !error && <p role="status">Cargando la validación…</p>}
      {data?.report && <nav className="flex flex-wrap gap-2" aria-label="Validación PI2">
        <button type="button" className={tabStyle} aria-pressed={tab === 'participant'} onClick={() => setTab('participant')}>Mi participación</button>
        <button type="button" className={tabStyle} aria-pressed={tab === 'report'} onClick={() => setTab('report')}>Informe del equipo</button>
      </nav>}
      {data && (tab === 'report' && data.report ? <PilotReport data={data.report} busy={busy}
        saveEvidence={(item) => run(() => item.id ? supabase.from('pi2_project_evidence').update({ title: item.title, reference: item.reference, completed: item.completed }).eq('id', item.id) : supabase.from('pi2_project_evidence').insert(item), 'Evidencia guardada.')}
        saveQuality={(item) => run(() => supabase.from('pi2_quality_reviews').insert(item), 'Revisión guardada.')}
      /> : <PilotParticipant participant={data.participant} times={data.times} generations={data.generations} interviews={data.interviews} busy={busy}
        enroll={() => run(() => supabase.from('pi2_participants').insert({ build: PILOT_BUILD }), 'Inscripción registrada.')}
        saveSurvey={(kind, score, interview) => run(() => supabase.rpc('pi2_save_survey', { p_kind: kind, p_score: score, p_build: PILOT_BUILD, p_interview_id: interview }), 'Respuesta registrada.')}
      />)}
    </div>
  </main>;
}
