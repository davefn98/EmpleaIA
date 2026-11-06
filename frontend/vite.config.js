import { defineConfig, normalizePath } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'url';
import { createRequire } from 'node:module';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss()
  ],
  optimizeDeps: {
    // The PDF loader expects URL strings for these classic scripts.
    exclude: ['@pdf-canvas-script?url', 'html2pdf.js/dist/html2pdf.min.js?url'],
  },
  resolve: {
    alias: [
      { find: '@', replacement: path.resolve(__dirname, './src') },
      { find: 'html2canvas', replacement: 'html2canvas-pro' },
      {
        find: /^@pdf-canvas-script(?=\?url$)/,
        replacement: normalizePath(path.join(path.dirname(require.resolve('html2canvas-pro')), 'html2canvas-pro.min.js')),
      },
    ],
  },
});
