const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { launchApp, closeApp, PROJECT_ROOT } = require('../helpers/electron-launcher.cjs');

const TEST_DRIVE_ROOT = path.join(os.tmpdir(), `driveman-test-flows-${process.pid}`);

test.beforeAll(async () => {
  fs.mkdirSync(TEST_DRIVE_ROOT, { recursive: true });
});

test.afterAll(async () => {
  try { fs.rmSync(TEST_DRIVE_ROOT, { recursive: true, force: true }); } catch {}
});

test('flows — botón "Nueva carpeta" crea una carpeta visible en la lista', async () => {
  const { app, window } = await launchApp({ env: { GDRIVE_ROOT: TEST_DRIVE_ROOT } });

  try {
    const folderName = `pw-folder-${Date.now()}`;

    await window.locator('#btn-new-folder').click();

    const dialog = window.locator('#modal-new-folder');
    await expect(dialog).toBeVisible();

    await window.locator('#modal-new-folder__input').fill(folderName);
    await window.locator('#modal-new-folder__confirm').click();

    await expect(dialog).toBeHidden({ timeout: 3000 });

    const exists = fs.existsSync(path.join(TEST_DRIVE_ROOT, folderName));
    expect(exists).toBe(true);

    const newFolderVisible = await window.locator('.file-row__name-text', { hasText: folderName }).first().isVisible();
    expect(newFolderVisible).toBe(true);

    fs.rmSync(path.join(TEST_DRIVE_ROOT, folderName), { recursive: true, force: true });
  } finally {
    await closeApp(app);
  }
});

test('flows — botón "Atrás" regresa a la raíz', async () => {
  const folderName = 'nav-test';
  fs.mkdirSync(path.join(TEST_DRIVE_ROOT, folderName), { recursive: true });

  const { app, window } = await launchApp({ env: { GDRIVE_ROOT: TEST_DRIVE_ROOT } });

  try {
    await window.locator('.file-row--folder').first().dblclick();
    await window.waitForTimeout(1000);

    let statusPath = await window.locator('#status-path').textContent();
    expect(statusPath).not.toBe(TEST_DRIVE_ROOT);

    await window.locator('#btn-back').click();
    await window.waitForTimeout(1000);

    statusPath = await window.locator('#status-path').textContent();
    expect(statusPath).toBe(TEST_DRIVE_ROOT);
  } finally {
    await closeApp(app);
    fs.rmSync(path.join(TEST_DRIVE_ROOT, folderName), { recursive: true, force: true });
  }
});

test('flows — búsqueda filtra por prefijo estricto (modo strict)', async () => {
  fs.mkdirSync(path.join(TEST_DRIVE_ROOT, 'azul-buscar'), { recursive: true });
  fs.mkdirSync(path.join(TEST_DRIVE_ROOT, 'rojo-buscar'), { recursive: true });
  fs.mkdirSync(path.join(TEST_DRIVE_ROOT, 'verde-otro'), { recursive: true });

  const { app, window } = await launchApp({ env: { GDRIVE_ROOT: TEST_DRIVE_ROOT } });

  try {
    const initialCount = await window.locator('.file-row').count();
    expect(initialCount).toBeGreaterThanOrEqual(3);

    await window.locator('#search').fill('azul');
    await window.waitForTimeout(400);

    const filteredCount = await window.locator('.file-row').count();
    expect(filteredCount).toBe(1);
    const visibleName = await window.locator('.file-row__name-text').first().textContent();
    expect(visibleName.toLowerCase()).toContain('azul');

    await window.locator('#search').fill('roj');
    await window.waitForTimeout(400);

    const prefixCount = await window.locator('.file-row').count();
    expect(prefixCount).toBe(1);

    await window.locator('#search').fill('buscar');
    await window.waitForTimeout(400);

    const substringCount = await window.locator('.file-row').count();
    expect(substringCount).toBe(0);

    await window.locator('#search').fill('');
    await window.waitForTimeout(400);

    const restoredCount = await window.locator('.file-row').count();
    expect(restoredCount).toBe(initialCount);
  } finally {
    await closeApp(app);
    fs.rmSync(path.join(TEST_DRIVE_ROOT, 'azul-buscar'), { recursive: true, force: true });
    fs.rmSync(path.join(TEST_DRIVE_ROOT, 'rojo-buscar'), { recursive: true, force: true });
    fs.rmSync(path.join(TEST_DRIVE_ROOT, 'verde-otro'), { recursive: true, force: true });
  }
});

test('flows — abrir un archivo ejecuta IPC sin errores', async () => {
  const filePath = path.join(TEST_DRIVE_ROOT, 'archivo-para-abrir.txt');
  fs.writeFileSync(filePath, 'contenido de prueba');

  const { app, window } = await launchApp({ env: { GDRIVE_ROOT: TEST_DRIVE_ROOT } });

  try {
    const result = await window.evaluate(async (p) => {
      try {
        await window.driveman.fs.openFile(p);
        return { ok: true };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    }, filePath);

    expect(result.ok).toBe(true);
  } finally {
    await closeApp(app);
    fs.rmSync(filePath, { force: true });
  }
});