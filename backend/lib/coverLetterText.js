// Used to recognize dates inserted by the previous formatter.
const previousDateFormatter = new Intl.DateTimeFormat('es-PE', {
  dateStyle: 'long',
  timeZone: 'America/Lima',
});

const emptyTemplateFields = new Set([
  'ciudad', 'ciudad, estado, codigo postal', 'codigo postal', 'direccion',
  'direccion de la empresa', 'tu direccion', 'telefono', 'tu telefono',
  'numero de telefono', 'tu numero de telefono', 'correo', 'correo electronico',
  'tu correo electronico', 'email', 'fecha',
]);

function isEmptyTemplateField(line) {
  const field = line.trim().match(/^(?:[^:[\]]+:\s*|\[Ciudad\],\s*)?\[([^\]]+)\]$/i)?.[1];
  const key = field?.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
  return emptyTemplateFields.has(key);
}

export function formatCoverLetterText(content, { generated = false, previousAutomaticDate = '' } = {}) {
  if (typeof content !== 'string' || !content.trim()) return content;

  const lines = content.split(/\r?\n/);
  const firstContent = lines.findIndex((line) => line.trim());
  const greeting = lines.findIndex((line) => /^(?:estimad[oa]s?\b|apreciad[oa]s?\b|a quien corresponda\b|de mi consideraci[oó]n\b|señor(?:a|es|as)?\b)/i.test(line.trim()));
  const header = lines.slice(0, Math.max(0, greeting));
  const hasTemplateHeader = header.some((line) => isEmptyTemplateField(line) || /^equipo de selecci[oó]n\b/i.test(line.trim()));
  const firstLine = lines[firstContent].trim();
  const hasAutomaticDate = generated
    ? /^\d{1,2} de \p{L}+ de \d{4}$/iu.test(firstLine)
    : firstLine === previousAutomaticDate;
  const start = greeting > 0 && (generated || hasTemplateHeader || hasAutomaticDate)
    ? greeting
    : hasAutomaticDate ? firstContent + 1 : 0;

  const body = lines.slice(start).filter((line) => !isEmptyTemplateField(line));
  if (!generated && start === 0 && body.length === lines.length) return content;

  return body.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function formatSavedCoverLetter(letter) {
  const created = new Date(letter.created_at ?? NaN);
  const previousAutomaticDate = Number.isFinite(created.getTime()) ? previousDateFormatter.format(created) : '';
  return { ...letter, letter_content: formatCoverLetterText(letter.letter_content, { previousAutomaticDate }) };
}
