const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { launchApp, closeApp } = require('../helpers/electron-launcher.cjs');

const TEST_DRIVE_ROOT = path.join(os.tmpdir(), `driveman-test-errors-${process.pid}`);

test.beforeAll(async () => {
  fs.mkdirSync(TEST_DRIVE_ROOT, { recursive: true });
});

test.afterAll(async () => {
  try { fs.rmSync(TEST_DRIVE_ROOT, { recursive: true, force: true }); } catch {}
});

test('errors — IPC rechaza rutas fuera de la raíz detectada', async () => {
  const { app, window } = await launchApp({ env: { GDRIVE_ROOT: TEST_DRIVE_ROOT } });

  try {
    const forbidden = path.join('C:', 'Windows', 'System32', 'drivers', 'etc', 'hosts');

    const result = await window.evaluate(async (p) => {
      try {
        await window.driveman.fs.stat(p);
        return { ok: true };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    }, forbidden);

    expect(result.ok).toBe(false);
    expect(result.error.toLowerCase()).toContain('fuera');
  } finally {
    await closeApp(app);
  }
});

test('errors — IPC rechaza intentos de path traversal (..\\..\\)', async () => {
  const { app, window } = await launchApp({ env: { GDRIVE_ROOT: TEST_DRIVE_ROOT } });

  try {
    const traversal = path.join(TEST_DRIVE_ROOT, '..', '..', 'Windows', 'System32');

    const result = await window.evaluate(async (p) => {
      try {
        await window.driveman.fs.listDir(p);
        return { ok: true };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    }, traversal);

    expect(result.ok).toBe(false);
    expect(result.error.toLowerCase()).toContain('fuera');
  } finally {
    await closeApp(app);
  }
});

test('errors — shell.openExternal rechaza protocolos no http/https', async () => {
  const { app, window } = await launchApp({ env: { GDRIVE_ROOT: TEST_DRIVE_ROOT } });

  try {
    const result = await window.evaluate(async () => {
      try {
        const r = await window.driveman.openExternal('file:///C:/Windows/System32/drivers/etc/hosts');
        return r;
      } catch (e) {
        return { ok: false, error: e.message };
      }
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('protocol not allowed');
  } finally {
    await closeApp(app);
  }
});

test('errors — la app no crashea cuando IPC devuelve null para driveRoot', async () => {
  const { app, window } = await launchApp({ env: { GDRIVE_ROOT: 'Z:\\ruta-inexistente-xyz' } });

  try {
    const headerVisible = await window.locator('.header__title').isVisible();
    expect(headerVisible).toBe(true);

    const pageErrors = [];
    window.on('pageerror', (err) => pageErrors.push(err.message));
    await window.waitForTimeout(1000);

    expect(pageErrors).toEqual([]);
  } finally {
    await closeApp(app);
  }
});