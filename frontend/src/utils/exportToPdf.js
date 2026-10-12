let html2pdfLoaderOverride = null;

const getHtml2Pdf = async () => {
  if (html2pdfLoaderOverride) return html2pdfLoaderOverride();

  const module = await import('html2pdf.js');
  return module.default || module;
};

const waitForFonts = async () => {
  if (!document.fonts?.ready) return;

  await Promise.race([
    document.fonts.ready,
    new Promise((resolve) => setTimeout(resolve, 1500))
  ]);
};

const downloadBlob = (pdfBlob, fileName) => {
  const blobUrl = URL.createObjectURL(pdfBlob);
  const link = document.createElement('a');

  try {
    link.href = blobUrl;
    link.download = fileName || 'EmpleaIA.pdf';
    link.style.display = 'none';

    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    // The browser consumes the download asynchronously after link.click().
    const cleanup = setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
    cleanup.unref?.();
  }
};

export const PDF_PAGEBREAK_OPTIONS = Object.freeze({
  mode: ['css', 'legacy'],
  before: ['[data-pdf-break-before="true"]'],
  after: ['[data-pdf-break-after="true"]'],
  avoid: [
    '.pdf-section-heading',
    '.pdf-experience-heading',
    '.pdf-keep-together',
    '[data-pdf-keep-together="true"]'
  ]
});

export const createPdfOptions = (element, fileName) => ({
  margin: 0,
  filename: fileName || 'EmpleaIA.pdf',
  image: { type: 'jpeg', quality: 0.98 },
  html2canvas: {
    scale: 2,
    useCORS: true,
    backgroundColor: '#ffffff',
    scrollX: 0,
    scrollY: 0,
    windowWidth: element.scrollWidth || element.offsetWidth
  },
  jsPDF: {
    unit: 'mm',
    format: 'a4',
    orientation: 'portrait',
    compress: true
  },
  pagebreak: PDF_PAGEBREAK_OPTIONS
});

/**
 * Exporta un elemento del DOM como PDF real y lo descarga en la pestaña actual.
 * No usa impresión nativa, ventanas emergentes ni eventos afterprint.
 */
export const exportToPdf = async (elementId, fileName) => {
  const element = document.getElementById(elementId);
  if (!element) {
    const error = new Error(`Elemento con ID "${elementId}" no encontrado en el DOM.`);
    error.code = 'DOM_NOT_FOUND';
    throw error;
  }

  try {
    await waitForFonts();

    const html2pdf = await getHtml2Pdf();
    const options = createPdfOptions(element, fileName);

    const worker = html2pdf().set(options).from(element).toPdf();
    const pdfBlob = await worker.outputPdf('blob');

    downloadBlob(pdfBlob, options.filename);
    return true;
  } catch (err) {
    const exportError = new Error(err?.message || 'Error durante la exportación a PDF.', { cause: err });
    exportError.code = err.code || 'PDF_EXPORT_ERROR';
    throw exportError;
  }
};

export const __setHtml2PdfLoaderForTests = (loader) => {
  html2pdfLoaderOverride = loader;
};
