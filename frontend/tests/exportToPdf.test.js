import test from 'node:test';
import assert from 'node:assert/strict';
import { exportToPdf } from '../src/utils/exportToPdf.js';

const originalDocument = globalThis.document;
const originalURL = globalThis.URL;
const originalWindow = globalThis.window;
const originalGetComputedStyle = globalThis.getComputedStyle;
const html = '<div id="cv-sheet-a4-canvas"><p>Experiencia profesional</p></div>';

const setupBrowserMocks = () => {
  const clicks = [];
  const appended = [];
  const revoked = [];
  const createdUrls = [];
  const styles = new Map();
  const element = {
    querySelectorAll: () => [],
    cloneNode: () => ({ outerHTML: html, querySelectorAll: () => [], style: { setProperty: (key, value) => styles.set(key, value) } }),
  };
  globalThis.getComputedStyle = () => ({ getPropertyValue: (key) => key === 'font-size' ? '13px' : '' });

  globalThis.document = {
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

  return { clicks, appended, revoked, createdUrls, styles };
};

const restoreGlobals = () => {
  globalThis.document = originalDocument;
  globalThis.URL = originalURL;
  globalThis.window = originalWindow;
  globalThis.getComputedStyle = originalGetComputedStyle;
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

test('exportToPdf: genera un blob PDF y mantiene su URL hasta iniciar la descarga', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
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
  try {
    const result = await exportToPdf('cv-sheet-a4-canvas', 'CV_Test.pdf', async (preview) => {
      assert.equal(preview, html);
      assert.equal(browser.styles.get('font-size'), '13px');
      return pdfBlob;
    });

    assert.equal(result, true);
    assert.equal(openCalled, false, 'window.open no debe usarse');
    assert.equal(printCalled, false, 'window.print no debe usarse');
    assert.equal(browser.createdUrls[0], pdfBlob);
    assert.equal(browser.revoked.length, 0, 'La URL debe seguir disponible después del clic');
    t.mock.timers.tick(60000);
    assert.deepEqual(browser.revoked, ['blob:empleaia-pdf']);
    assert.equal(browser.appended.length, 1);
    assert.deepEqual(browser.clicks, [{ href: 'blob:empleaia-pdf', download: 'CV_Test.pdf' }]);
  } finally {
    restoreGlobals();
  }
});

test('exportToPdf: propaga errores de generación como PDF_EXPORT_ERROR', async () => {
  setupBrowserMocks();

  try {
    await assert.rejects(
      () => exportToPdf('cv-sheet-a4-canvas', 'CV_Test.pdf', async () => { throw new Error('Fallo simulado generando PDF'); }),
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

test('exportToPdf: rechaza respuestas sin PDF y evita descargar un archivo inválido', async () => {
  const browser = setupBrowserMocks();
  try {
    await assert.rejects(() => exportToPdf('cv-sheet-a4-canvas', 'CV_Test.pdf', async () => ({ success: true })), /PDF válido/);
    assert.equal(browser.clicks.length, 0);
  } finally {
    restoreGlobals();
  }
});
