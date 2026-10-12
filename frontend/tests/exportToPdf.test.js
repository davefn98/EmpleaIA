import test from 'node:test';
import assert from 'node:assert/strict';
import {
  exportToPdf,
  createPdfOptions,
  PDF_PAGEBREAK_OPTIONS,
  __setHtml2PdfLoaderForTests
} from '../src/utils/exportToPdf.js';

const originalDocument = globalThis.document;
const originalURL = globalThis.URL;
const originalWindow = globalThis.window;

const setupBrowserMocks = ({ element = { scrollWidth: 794, offsetWidth: 794 } } = {}) => {
  const clicks = [];
  const appended = [];
  const revoked = [];
  const createdUrls = [];

  globalThis.document = {
    fonts: { ready: Promise.resolve() },
    getElementById: () => element,
    createElement: (tagName) => {
      assert.equal(tagName, 'a');
      return {
        href: '',
        download: '',
        style: {},
        click() {
          clicks.push({ href: this.href, download: this.download });
        },
        remove() {}
      };
    },
    body: {
      appendChild(node) {
        appended.push(node);
      }
    }
  };

  globalThis.URL = {
    createObjectURL: (blob) => {
      createdUrls.push(blob);
      return 'blob:empleaia-pdf';
    },
    revokeObjectURL: (url) => {
      revoked.push(url);
    }
  };

  return { clicks, appended, revoked, createdUrls };
};

const createHtml2PdfMock = ({ blob = new Blob(['pdf'], { type: 'application/pdf' }), fail = false } = {}) => {
  const calls = [];
  const worker = {
    set(options) {
      calls.push(['set', options]);
      return worker;
    },
    from(element) {
      calls.push(['from', element]);
      return worker;
    },
    toPdf() {
      calls.push(['toPdf']);
      return worker;
    },
    async outputPdf(type) {
      calls.push(['outputPdf', type]);
      if (fail) throw new Error('Fallo simulado generando PDF');
      return blob;
    }
  };

  const html2pdf = () => worker;
  html2pdf.calls = calls;
  return html2pdf;
};

const restoreGlobals = () => {
  globalThis.document = originalDocument;
  globalThis.URL = originalURL;
  globalThis.window = originalWindow;
  __setHtml2PdfLoaderForTests(null);
};

test('exportToPdf: arroja DOM_NOT_FOUND si el elemento no existe en el DOM y no abre ventanas', async () => {
  globalThis.document = {
    getElementById: () => null
  };

  let openCalled = false;
  globalThis.window = {
    open: () => {
      openCalled = true;
    }
  };

  try {
    await assert.rejects(
      async () => {
        await exportToPdf('non-existent-id', 'test.pdf');
      },
      (err) => {
        assert.equal(err.code, 'DOM_NOT_FOUND');
        return true;
      }
    );
    assert.equal(openCalled, false, 'window.open no debió ser llamado');
  } finally {
    restoreGlobals();
  }
});

test('exportToPdf: genera un blob PDF y lo descarga sin usar impresión nativa', async () => {
  const browser = setupBrowserMocks();
  let openCalled = false;
  let printCalled = false;
  globalThis.window = {
    open: () => {
      openCalled = true;
    },
    print: () => {
      printCalled = true;
    }
  };

  const pdfBlob = new Blob(['pdf'], { type: 'application/pdf' });
  const html2pdf = createHtml2PdfMock({ blob: pdfBlob });
  __setHtml2PdfLoaderForTests(() => html2pdf);

  try {
    const result = await exportToPdf('cv-sheet-a4-canvas', 'CV_Test.pdf');

    assert.equal(result, true);
    assert.equal(openCalled, false, 'window.open no debe usarse');
    assert.equal(printCalled, false, 'window.print no debe usarse');
    assert.equal(browser.createdUrls[0], pdfBlob);
    assert.equal(browser.revoked[0], 'blob:empleaia-pdf');
    assert.equal(browser.appended.length, 1);
    assert.deepEqual(browser.clicks, [{ href: 'blob:empleaia-pdf', download: 'CV_Test.pdf' }]);
    assert.equal(html2pdf.calls[0][0], 'set');
    assert.equal(html2pdf.calls[1][0], 'from');
    assert.equal(html2pdf.calls[2][0], 'toPdf');
    assert.deepEqual(html2pdf.calls[3], ['outputPdf', 'blob']);
    assert.equal(html2pdf.calls[0][1].jsPDF.format, 'a4');
    assert.deepEqual(html2pdf.calls[0][1].pagebreak, PDF_PAGEBREAK_OPTIONS);
  } finally {
    restoreGlobals();
  }
});

test('createPdfOptions: usa selectores de paginación reales sin avoid-all ni secciones completas', () => {
  const options = createPdfOptions({ scrollWidth: 820, offsetWidth: 794 }, 'CV.pdf');

  assert.deepEqual(options.pagebreak.mode, ['css', 'legacy']);
  assert.equal(options.pagebreak.mode.includes('avoid-all'), false);
  assert.equal(options.pagebreak.avoid.includes('.pdf-section-heading'), true);
  assert.equal(options.pagebreak.avoid.includes('.pdf-experience-heading'), true);
  assert.equal(options.pagebreak.avoid.includes('[data-pdf-keep-together="true"]'), true);
  assert.equal(options.html2canvas.windowWidth, 820);
  assert.equal(options.filename, 'CV.pdf');
});

test('exportToPdf: propaga errores de generación como PDF_EXPORT_ERROR', async () => {
  setupBrowserMocks();
  const html2pdf = createHtml2PdfMock({ fail: true });
  __setHtml2PdfLoaderForTests(() => html2pdf);

  try {
    await assert.rejects(
      async () => {
        await exportToPdf('cv-sheet-a4-canvas', 'CV_Test.pdf');
      },
      (err) => {
        assert.equal(err.code, 'PDF_EXPORT_ERROR');
        assert.match(err.message, /Fallo simulado/);
        return true;
      }
    );
  } finally {
    restoreGlobals();
  }
});
