const path = require('path');
const fs = require('fs');
const os = require('os');
const { launchApp, closeApp, PROJECT_ROOT } = require('./tests/helpers/electron-launcher.cjs');

const TEST_DRIVE_ROOT = path.join(os.tmpdir(), `driveman-test-menubar-${process.pid}`);
const SCREENSHOTS_DIR = path.join(PROJECT_ROOT, 'screenshots');

(async () => {
  fs.mkdirSync(TEST_DRIVE_ROOT, { recursive: true });
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  fs.writeFileSync(path.join(TEST_DRIVE_ROOT, 'reporte.pdf'), 'pdf');

  const { app, window } = await launchApp({ env: { GDRIVE_ROOT: TEST_DRIVE_ROOT } });
  try {
    await window.locator('.file-row').first().waitFor({ timeout: 5000 });
    await window.waitForTimeout(300);
    await window.screenshot({ path: path.join(SCREENSHOTS_DIR, '08-no-menubar.png'), fullPage: true });
    console.log('Sin menubar capturado');
  } finally {
    await closeApp(app);
    try { fs.rmSync(TEST_DRIVE_ROOT, { recursive: true, force: true }); } catch {}
  }
})();
