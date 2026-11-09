import { useState } from 'react';
import { readPilotTimer, writePilotTimer } from '../../utils/pi2TaskTimer';
import { PILOT_BUILD, TASKS } from '../../utils/pi2Validation';

const tasks = Object.entries(TASKS);
const methods = { manual: 'Manual', platform: 'Con EmpleaIA' };
const field = 'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900';
const primary = 'rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50';
const secondary = 'rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold dark:border-slate-600 disabled:opacity-50';
const format = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 2 });

export default function PilotPreparationTiming({ userId, participant, times, busy, onSave }) {
  const [task, setTask] = useState('cv');
  const [method, setMethod] = useState('manual');
  const [timer, setTimer] = useState(() => readPilotTimer(userId));
  const [notice, setNotice] = useState('');
  const savedTime = (taskId, methodId) => times.find((row) => row.task === taskId && row.method === methodId);
  const complete = tasks.filter(([taskId]) => savedTime(taskId, 'manual') && savedTime(taskId, 'platform')).length;
  const differentBuild = participant.build !== PILOT_BUILD;
  const timerFromAnotherBuild = timer && timer.build !== participant.build;
  const finished = timer?.finishedAt != null;

  function persist(next) {
    try {
      writePilotTimer(userId, next);
      setTimer(next);
      setNotice('');
      return true;
    } catch {
      setNotice('No se pudo guardar el cronómetro en esta pestaña. Comprueba la configuración del navegador.');
      return false;
    }
  }

  async function finishAndSave() {
    if (!finished && !persist({ ...timer, finishedAt: Date.now() })) return;
    const saved = await onSave();
    const pending = readPilotTimer(userId);
    setTimer(pending);
    if (!saved) setNotice(pending
      ? 'La medición sigue pendiente. Puedes volver a intentar guardarla.'
      : 'Actualiza la pantalla para comprobar el registro.');
  }

  return <div className="space-y-3 border-t border-slate-200 pt-4 dark:border-slate-700">
    <h3 className="font-bold">Medición actual de I3</h3>
    <p className="text-sm">Realiza cada tarea dos veces con el mismo puesto, datos y resultado esperado. Empieza justo antes de trabajar. Termina cuando tengas el CV o la carta listos y exportados, o cuando tengas tus notas de preparación para la entrevista.</p>
    <p className="text-sm">Para preparar la entrevista usa las mismas preguntas de práctica en ambos métodos. Mide el tiempo de preparar las respuestas, antes de la simulación.</p>
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead><tr><th scope="col" className="pr-3 pb-2">Tarea</th><th scope="col" className="pr-3 pb-2">Manual</th><th scope="col" className="pb-2">Con EmpleaIA</th></tr></thead>
        <tbody>{tasks.map(([taskId, label]) => <tr key={taskId} className="border-t border-slate-200 dark:border-slate-700">
          <th scope="row" className="py-2 pr-3 font-medium">{label}</th>
          {Object.keys(methods).map((methodId) => {
            const row = savedTime(taskId, methodId);
            return <td key={methodId} className="py-2 pr-3 tabular-nums">{row ? `${format.format(row.seconds)} s` : 'Pendiente'}</td>;
          })}
        </tr>)}</tbody>
      </table>
    </div>
    <p className="text-sm font-semibold">{complete} de {tasks.length} tareas con ambos tiempos.</p>
    {differentBuild && <p className="text-sm">Registra las mediciones en la versión del piloto en la que te inscribiste ({participant.build}).</p>}
    {timer ? <div className="space-y-2 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
      <p role="status" className="text-sm font-semibold">{TASKS[timer.task]} · {methods[timer.method]} · {finished ? 'Pendiente de guardar' : 'Cronómetro en curso'}</p>
      {timerFromAnotherBuild ? <p className="text-sm">Este cronómetro corresponde a otra versión. Descártalo para comenzar una medición nueva.</p>
        : !finished && <p className="text-sm">Vuelve a Validación PI2 en esta misma pestaña al terminar la tarea.</p>}
      <div className="flex flex-wrap gap-2">
        {!timerFromAnotherBuild && <button type="button" className={primary} onClick={finishAndSave} disabled={busy || differentBuild}>
          {busy ? 'Guardando…' : finished ? 'Reintentar guardado' : 'Terminar y guardar tiempo'}
        </button>}
        <button type="button" className={secondary} disabled={busy} onClick={() => persist(null)}>Descartar medición</button>
      </div>
    </div> : complete < tasks.length && !differentBuild && <div className="flex flex-wrap items-end gap-3">
      <label className="grid gap-1 text-sm">Tarea
        <select className={field} value={task} onChange={(event) => setTask(event.target.value)}>
          {tasks.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
      </label>
      <label className="grid gap-1 text-sm">Método
        <select className={field} value={method} onChange={(event) => setMethod(event.target.value)}>
          {Object.entries(methods).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
      </label>
      <button type="button" className={primary} disabled={busy || Boolean(savedTime(task, method))} onClick={() => persist({ task, method, build: participant.build, startedAt: Date.now(), finishedAt: null })}>Iniciar medición</button>
      {savedTime(task, method) && <p className="w-full text-sm">Ya tienes este tiempo registrado. Elige una tarea o un método pendiente.</p>}
    </div>}
    {notice && <p role="alert" className="text-sm text-rose-700 dark:text-rose-300">{notice}</p>}
  </div>;
}
