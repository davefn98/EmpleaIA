import canvasUrl from '@pdf-canvas-script?url';
import pdfUrl from 'html2pdf.js/dist/html2pdf.min.js?url';

let enginePromise;

function loadScript(url, readExport) {
  const existing = readExport();
  if (typeof existing === 'function') return Promise.resolve(existing);

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const rejectLoad = () => {
      script.remove();
      reject(new Error('No se pudo inicializar una biblioteca de exportación PDF.'));
    };
    script.src = url;
    script.onload = () => {
      const exported = readExport();
      if (typeof exported === 'function') resolve(exported);
      else rejectLoad();
    };
    script.onerror = rejectLoad;
    document.head.appendChild(script);
  });
}

export function loadPdfEngine() {
  // Vite serves these as assets, so opening the PDF tools never depends on its optimized module cache.
  if (!enginePromise) {
    enginePromise = loadScript(canvasUrl, () => window.html2canvas)
      .then(() => loadScript(pdfUrl, () => window.html2pdf))
      .catch((error) => {
        enginePromise = undefined;
        throw error;
      });
  }
  return enginePromise;
}
