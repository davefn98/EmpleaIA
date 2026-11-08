const previewStyles = [
  'font-family', 'font-size', 'font-weight', 'line-height', 'white-space', 'text-align',
  'color', 'background-color', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
];

function serializePreview(element) {
  const copy = element.cloneNode(true);
  const originals = [element, ...element.querySelectorAll('[class]')];
  const copies = [copy, ...copy.querySelectorAll('[class]')];
  originals.forEach((original, index) => {
    const computed = getComputedStyle(original);
    for (const property of previewStyles) {
      copies[index].style.setProperty(property, computed.getPropertyValue(property));
    }
  });
  return copy.outerHTML;
}

async function requestDocumentPdf(html) {
  const { apiRequest } = await import('./api.js');
  return apiRequest('/documents/pdf', 'POST', { html }, 45000, 'pdf');
}

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

/**
 * Exporta la vista previa como PDF con texto seleccionable y descarga el archivo.
 */
export const exportToPdf = async (elementId, fileName, requestPdf = requestDocumentPdf) => {
  const element = document.getElementById(elementId);
  if (!element) {
    const error = new Error(`Elemento con ID "${elementId}" no encontrado en el DOM.`);
    error.code = 'DOM_NOT_FOUND';
    throw error;
  }

  try {
    const pdfBlob = await requestPdf(serializePreview(element));
    if (pdfBlob?.type !== 'application/pdf' || !pdfBlob.size) {
      throw new Error('El servidor no devolvió un PDF válido.');
    }
    downloadBlob(pdfBlob, fileName);
    return true;
  } catch (err) {
    const exportError = new Error(err?.message || 'Error durante la exportación a PDF.', { cause: err });
    exportError.code = err.code || 'PDF_EXPORT_ERROR';
    throw exportError;
  }
};
