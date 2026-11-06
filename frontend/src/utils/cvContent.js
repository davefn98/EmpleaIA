export const hasCvText = (...values) => values.some((value) => typeof value === 'string' && value.trim());

export function toCvTextList(value) {
  if (!value) return [];
  return (Array.isArray(value) ? value : [value])
    .map((item) => typeof item === 'string' ? item : item?.name || item?.label || item?.skill || item?.text)
    .filter((item) => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);
}

export const hasCvExperience = (record) => Boolean(record && (
  hasCvText(record.role, record.company, record.impact_description, record.description) ||
  toCvTextList(record.bullets || record.achievements).length
));

export const hasCvEducation = (record) => Boolean(record && hasCvText(record.degree, record.institution));
