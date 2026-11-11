const path = require('node:path');

// Render conserva node_modules entre la compilación y el arranque del servicio.
module.exports = process.env.RENDER === 'true'
  ? { cacheDirectory: path.join(__dirname, 'backend', 'node_modules', '.cache', 'puppeteer') }
  : {};
