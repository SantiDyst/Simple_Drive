const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { launchApp, closeApp } = require('../helpers/electron-launcher.cjs');

const TEST_DRIVE_ROOT = path.join(os.tmpdir(), `driveman-test-events-${process.pid}`);

test.beforeAll(async () => {
  fs.mkdirSync(TEST_DRIVE_ROOT, { recursive: true });
});

test.afterAll(async () => {
  try { fs.rmSync(TEST_DRIVE_ROOT, { recursive: true, force: true }); } catch {}
});

test('events — el watcher detecta archivos nuevos y refresca la lista', async () => {
  const { app, window } = await launchApp({ env: { GDRIVE_ROOT: TEST_DRIVE_ROOT } });

  try {
    const initialCount = await window.locator('.file-row').count();

    const driveRoot = await window.evaluate(async () => await window.driveman.app.getDriveRoot());
    await window.evaluate((root) => window.driveman.fs.watch(root), driveRoot);
    await window.waitForTimeout(500);

    const newFile = path.join(TEST_DRIVE_ROOT, 'llegando.txt');
    fs.writeFileSync(newFile, 'aparecer');

    await expect.poll(async () => {
      return await window.locator('.file-row__name-text', { hasText: 'llegando.txt' }).count();
    }, { timeout: 5000 }).toBeGreaterThan(0);

    const finalCount = await window.locator('.file-row').count();
    expect(finalCount).toBe(initialCount + 1);

    fs.rmSync(newFile, { force: true });
  } finally {
    await closeApp(app);
  }
});

test('events — el watcher detecta archivos borrados y refresca la lista', async () => {
  const fileToDelete = path.join(TEST_DRIVE_ROOT, 'chau.txt');
  fs.writeFileSync(fileToDelete, 'me voy');

  const { app, window } = await launchApp({ env: { GDRIVE_ROOT: TEST_DRIVE_ROOT } });

  try {
    await expect(window.locator('.file-row__name-text', { hasText: 'chau.txt' })).toHaveCount(1, { timeout: 5000 });

    const driveRoot = await window.evaluate(async () => await window.driveman.app.getDriveRoot());
    await window.evaluate((root) => window.driveman.fs.watch(root), driveRoot);
    await window.waitForTimeout(500);

    fs.rmSync(fileToDelete, { force: true });

    await expect.poll(async () => {
      return await window.locator('.file-row__name-text', { hasText: 'chau.txt' }).count();
    }, { timeout: 5000 }).toBe(0);
  } finally {
    await closeApp(app);
  }
});