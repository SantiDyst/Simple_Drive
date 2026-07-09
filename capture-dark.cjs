const path = require('path');
const fs = require('fs');
const os = require('os');
const { launchApp, closeApp, PROJECT_ROOT } = require('./tests/helpers/electron-launcher.cjs');

const TEST_DRIVE_ROOT = path.join(os.tmpdir(), `driveman-test-dark-${process.pid}`);
const SCREENSHOTS_DIR = path.join(PROJECT_ROOT, 'screenshots');

const FIXTURES = {
  'reporte.pdf': 'pdf-content',
  'presupuesto.xlsx': 'xlsx-content',
  'foto.png': 'png-content',
  'intro.mp4': 'mp4-content',
  'tema.mp3': 'mp3-content',
  'paquete.zip': 'zip-content',
  'app.js': 'js-content',
  'README.md': 'md-content',
  'notas.xyz': 'xyz-content',
};

(async () => {
  fs.mkdirSync(TEST_DRIVE_ROOT, { recursive: true });
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  for (const [name, content] of Object.entries(FIXTURES)) {
    fs.writeFileSync(path.join(TEST_DRIVE_ROOT, name), content);
  }

  const { app, window } = await launchApp({ env: { GDRIVE_ROOT: TEST_DRIVE_ROOT } });
  try {
    await window.locator('.file-row').first().waitFor({ timeout: 5000 });
    await window.evaluate(() => {
      document.documentElement.classList.add('dark');
    });
    await window.waitForTimeout(300);
    await window.screenshot({ path: path.join(SCREENSHOTS_DIR, '04-dark.png'), fullPage: true });
    console.log('Captured dark mode screenshot');
  } finally {
    await closeApp(app);
    try { fs.rmSync(TEST_DRIVE_ROOT, { recursive: true, force: true }); } catch {}
  }
})();
