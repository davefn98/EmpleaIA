import puppeteer from 'puppeteer';
import sanitizeHtml from 'sanitize-html';

let browserPromise;
let activeRenders = 0;

function getBrowser() {
  browserPromise ??= puppeteer.launch({ timeout: 15000 }).then((browser) => {
    browser.once('disconnected', () => { browserPromise = undefined; });
    return browser;
  }).catch((error) => {
    browserPromise = undefined;
    throw error;
  });
  return browserPromise;
}

const printStyles = `
  @page { size: A4; margin: 8mm 0; }
  @page :first { margin-top: 0; margin-bottom: 8mm; }
  @page cover-letter { margin: 16mm; }
  @page cover-letter:first { margin: 16mm; }
  * { box-sizing: border-box; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
  html, body { margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; line-height: 1.5; }
  h1, h2, h4, p, ul { margin: 0; }
  ul { padding: 0; list-style: none; }
  h1, h2, h4 { font-size: inherit; font-weight: inherit; }
  #cv-sheet-a4-canvas, #letter-sheet-a4-canvas { min-height: 0 !important; }
  #letter-sheet-a4-canvas { page: cover-letter; width: auto !important; padding: 0 !important; }
  .pdf-section-heading, .pdf-experience-heading { break-inside: avoid; break-after: avoid; }
  .pdf-keep-together, [data-pdf-keep-together="true"] { break-inside: avoid; }
  [data-pdf-break-before="true"] { break-before: page; }
  [data-pdf-break-after="true"] { break-after: page; }
`;

export async function renderDocumentPdf(html) {
  if (activeRenders >= 2) {
    throw Object.assign(new Error('El generador de PDF está ocupado. Intenta descargar en unos segundos.'), { code: 'PDF_BUSY' });
  }
  activeRenders++;
  let context;
  try {
    const content = sanitizeHtml(html, {
      allowedTags: ['div', 'p', 'span', 'h1', 'h2', 'h4', 'strong', 'code', 'ul', 'li', 'br'],
      allowedAttributes: { '*': ['id', 'class', 'style', 'data-pdf-keep-together', 'data-pdf-break-before', 'data-pdf-break-after'] },
    });
    const browser = await getBrowser();
    context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setJavaScriptEnabled(false);
    await page.setOfflineMode(true);
    await page.setContent(`<!doctype html><html lang="es"><head><meta charset="utf-8">
      <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
      <style>${printStyles}</style></head><body>${content}</body></html>`, { timeout: 10000 });
    return await page.pdf({ format: 'A4', preferCSSPageSize: true, printBackground: true, timeout: 15000 });
  } finally {
    await context?.close().catch(() => {});
    activeRenders--;
  }
}
