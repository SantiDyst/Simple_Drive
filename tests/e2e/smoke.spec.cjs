const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { launchApp, closeApp, PROJECT_ROOT } = require('../helpers/electron-launcher.cjs');

const TEST_DRIVE_ROOT = path.join(os.tmpdir(), `driveman-test-root-${process.pid}`);
const SCREENSHOTS_DIR = path.join(PROJECT_ROOT, 'screenshots');

test.beforeAll(async () => {
  if (!fs.existsSync(TEST_DRIVE_ROOT)) {
    fs.mkdirSync(TEST_DRIVE_ROOT, { recursive: true });
  }
  fs.mkdirSync(path.join(TEST_DRIVE_ROOT, 'subfolder-test'), { recursive: true });
  fs.writeFileSync(path.join(TEST_DRIVE_ROOT, 'subfolder-test', 'nota.txt'), 'hola mundo');
  fs.writeFileSync(path.join(TEST_DRIVE_ROOT, 'archivo-raiz.txt'), 'test');

  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
});

test.afterAll(async () => {
  try {
    fs.rmSync(TEST_DRIVE_ROOT, { recursive: true, force: true });
  } catch (err) {
    console.warn('cleanup failed:', err.message);
  }
});

test('smoke — la app arranca, detecta raíz, lista archivos y expone IPC', async () => {
  const { app, window } = await launchApp({ env: { GDRIVE_ROOT: TEST_DRIVE_ROOT } });

  try {
    await expect(window.locator('.header__title')).toHaveText('Driveman');
    await expect(window.locator('#breadcrumb')).not.toBeEmpty();

    const statusCount = await window.locator('#status-count').textContent();
    expect(statusCount).toMatch(/\d+ elementos?/);

    const statusPath = await window.locator('#status-path').textContent();
    expect(statusPath).toContain(TEST_DRIVE_ROOT);

    const rowCount = await window.locator('.file-row').count();
    expect(rowCount).toBeGreaterThan(0);

    await expect(window.locator('#welcome')).toBeHidden();

    const hasDriveman = await window.evaluate(() => typeof window.driveman);
    expect(hasDriveman).toBe('object');

    const driveRoot = await window.evaluate(async () => {
      try { return await window.driveman.app.getDriveRoot(); }
      catch (e) { return null; }
    });
    expect(driveRoot).toBe(TEST_DRIVE_ROOT);

    await window.screenshot({ path: path.join(SCREENSHOTS_DIR, '01-smoke-root.png'), fullPage: true });
  } finally {
    await closeApp(app);
  }
});

test('smoke — navegación a subcarpeta actualiza breadcrumb y listado', async () => {
  const { app, window } = await launchApp({ env: { GDRIVE_ROOT: TEST_DRIVE_ROOT } });

  try {
    const folderRow = window.locator('.file-row--folder').first();
    await expect(folderRow).toBeVisible();

    await folderRow.dblclick();
    await window.waitForTimeout(1500);

    const statusPath = await window.locator('#status-path').textContent();
    expect(statusPath).toContain('subfolder-test');

    const newRowCount = await window.locator('.file-row').count();
    expect(newRowCount).toBeGreaterThan(0);

    await window.screenshot({ path: path.join(SCREENSHOTS_DIR, '02-smoke-folder.png'), fullPage: true });
  } finally {
    await closeApp(app);
  }
});