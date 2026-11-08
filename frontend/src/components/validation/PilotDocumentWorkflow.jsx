import { summarizeOperationTimes } from '../../utils/pi2Validation';

const formatSeconds = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 2 });
const steps = { preparation: 'Creación completa', pdf: 'Exportación a PDF' };

function TimingCell({ attempts, type }) {
  const { value, n, failures } = summarizeOperationTimes(attempts.filter((row) => row.document_type === type));
  return <td className="py-2 pr-3">
    <p className="font-semibold tabular-nums">{value === null ? 'Sin tiempos medidos' : `${formatSeconds.format(value)} s de promedio`}</p>
    <p className="text-xs text-slate-600 dark:text-slate-300">{n} con resultado · {failures} con error</p>
  </td>;
}

export default function PilotDocumentWorkflow({ attempts }) {
  return <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800" aria-labelledby="document-workflow-heading">
    <h2 id="document-workflow-heading" className="text-lg font-bold">Tiempos de creación y exportación</h2>
    <p className="text-sm">La creación completa se mide desde que entras al módulo hasta la primera descarga del documento que generas en esa visita. La exportación se mide desde «Descargar PDF» hasta que se inicia la descarga.</p>
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead><tr><th scope="col" className="pr-3 pb-2">Etapa</th><th scope="col" className="pr-3 pb-2">CV</th><th scope="col" className="pb-2">Carta</th></tr></thead>
        <tbody>{Object.entries(steps).map(([key, label]) => <tr key={key} className="border-t border-slate-200 align-top dark:border-slate-700">
          <th scope="row" className="py-2 pr-3 font-medium">{label}</th>
          <TimingCell attempts={attempts} type={`cv_${key}`} />
          <TimingCell attempts={attempts} type={`letter_${key}`} />
        </tr>)}</tbody>
      </table>
    </div>
  </section>;
}
