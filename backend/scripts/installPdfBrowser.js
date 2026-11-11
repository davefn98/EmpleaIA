import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

// Se ejecuta en cada instalación del backend, incluso si Render reutiliza dependencias.
if (process.env.RENDER === 'true' && !process.env.PUPPETEER_EXECUTABLE_PATH) {
  const require = createRequire(import.meta.url);
  const cli = require.resolve('puppeteer/internal/node/cli.js');
  const result = spawnSync(process.execPath, [cli, 'browsers', 'install', 'chrome'], {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  process.exit(result.status ?? 1);
}
