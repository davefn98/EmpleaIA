export const NEW_LETTER_PATH = '/documents/cover-letter/new';

export function cvDraftPath(id, asCopy = false) {
  return `/documents/cv/draft/${encodeURIComponent(id)}${asCopy ? '/copy' : ''}`;
}

export function letterDraftPath(id, asCopy = false) {
  return `/documents/cover-letter/draft/${encodeURIComponent(id)}${asCopy ? '/copy' : ''}`;
}

export function readDocumentDraftPath(pathname) {
  const match = /^\/documents\/(cv|cover-letter)\/draft\/([^/]+)(\/copy)?$/.exec(pathname);
  if (!match) return null;

  try {
    return { type: match[1], id: decodeURIComponent(match[2]), asCopy: Boolean(match[3]) };
  } catch {
    return null;
  }
}
