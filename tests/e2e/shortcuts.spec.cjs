const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { launchApp, closeApp, PROJECT_ROOT } = require('../helpers/electron-launcher.cjs');

const TEST_DRIVE_ROOT = path.join(os.tmpdir(), `driveman-test-shortcuts-${process.pid}`);

test.beforeAll(async () => {
  fs.mkdirSync(TEST_DRIVE_ROOT, { recursive: true });
  fs.writeFileSync(path.join(TEST_DRIVE_ROOT, 'borrame.txt'), 'contenido');
});

test.afterAll(async () => {
  try { fs.rmSync(TEST_DRIVE_ROOT, { recursive: true, force: true }); } catch {}
});

test('shortcuts — Ctrl+L enfoca el input de búsqueda', async () => {
  const { app, window } = await launchApp({ env: { GDRIVE_ROOT: TEST_DRIVE_ROOT } });

  try {
    await window.locator('.file-row').first().click();
    await window.locator('body').click({ position: { x: 10, y: 10 } });

    await window.keyboard.press('Control+l');
    await window.waitForTimeout(200);

    const focused = await window.evaluate(() => document.activeElement && document.activeElement.id);
    expect(focused).toBe('search');
  } finally {
    await closeApp(app);
  }
});

test('shortcuts — Ctrl+N abre el modal de nueva carpeta', async () => {
  const { app, window } = await launchApp({ env: { GDRIVE_ROOT: TEST_DRIVE_ROOT } });

  try {
    await window.keyboard.press('Control+n');
    await window.waitForTimeout(300);

    const dialog = window.locator('#modal-new-folder');
    await expect(dialog).toBeVisible();
  } finally {
    await closeApp(app);
  }
});

test('shortcuts — Escape limpia la búsqueda cuando hay texto', async () => {
  const { app, window } = await launchApp({ env: { GDRIVE_ROOT: TEST_DRIVE_ROOT } });

  try {
    await window.locator('#search').fill('algo');
    await window.waitForTimeout(200);

    const hasText = await window.locator('#search').inputValue();
    expect(hasText).toBe('algo');

    await window.keyboard.press('Escape');
    await window.waitForTimeout(200);

    const cleared = await window.locator('#search').inputValue();
    expect(cleared).toBe('');
  } finally {
    await closeApp(app);
  }
});

test('shortcuts — F2 inicia rename en el item seleccionado', async () => {
  const target = path.join(TEST_DRIVE_ROOT, 'renombrame.txt');
  fs.writeFileSync(target, 'data');

  const { app, window } = await launchApp({ env: { GDRIVE_ROOT: TEST_DRIVE_ROOT } });

  try {
    const row = window.locator(`.file-row[data-path*="renombrame.txt"]`);
    await expect(row).toBeVisible();
    await row.click();

    await window.keyboard.press('F2');
    await window.waitForTimeout(300);

    const input = row.locator('.file-row__name-input');
    await expect(input).toBeVisible();
    const value = await input.inputValue();
    expect(value).toBe('renombrame.txt');
  } finally {
    await closeApp(app);
    try { fs.rmSync(target, { force: true }); } catch {}
  }
});