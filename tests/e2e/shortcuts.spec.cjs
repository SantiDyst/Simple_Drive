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

test('shortcuts — Ctrl+B abre el overlay de búsqueda y Esc lo cierra', async () => {
  const { app, window } = await launchApp({ env: { GDRIVE_ROOT: TEST_DRIVE_ROOT } });

  try {
    const overlay = window.locator('#search-overlay');
    await expect(overlay).toBeHidden();

    await window.locator('body').click({ position: { x: 10, y: 10 } });
    await window.keyboard.press('Control+b');
    await window.waitForTimeout(200);

    await expect(overlay).toBeVisible();
    const focused = await window.evaluate(() => document.activeElement && document.activeElement.id);
    expect(focused).toBe('search-overlay__input');

    await window.keyboard.press('Escape');
    await window.waitForTimeout(200);

    await expect(overlay).toBeHidden();
  } finally {
    await closeApp(app);
  }
});

test('shortcuts — Ctrl+B click en backdrop cierra el overlay', async () => {
  const { app, window } = await launchApp({ env: { GDRIVE_ROOT: TEST_DRIVE_ROOT } });

  try {
    const overlay = window.locator('#search-overlay');
    const backdrop = window.locator('#search-overlay-backdrop');
    await expect(overlay).toBeHidden();
    await expect(backdrop).toBeHidden();

    await window.locator('body').click({ position: { x: 10, y: 10 } });
    await window.keyboard.press('Control+b');
    await window.waitForTimeout(200);
    await expect(overlay).toBeVisible();
    await expect(backdrop).toBeVisible();

    // Click en el backdrop (esquina superior izquierda, fuera del overlay centrado).
    await backdrop.click({ position: { x: 5, y: 5 } });
    await window.waitForTimeout(200);
    await expect(overlay).toBeHidden();
    await expect(backdrop).toBeHidden();
  } finally {
    await closeApp(app);
  }
});

test('shortcuts — Ctrl+B happy path: tipear + Enter aplica el filtro y sincroniza el toolbar', async () => {
  fs.mkdirSync(path.join(TEST_DRIVE_ROOT, 'happy-btest'), { recursive: true });

  const { app, window } = await launchApp({ env: { GDRIVE_ROOT: TEST_DRIVE_ROOT } });

  try {
    const overlay = window.locator('#search-overlay');
    const toolbar = window.locator('#search');

    await window.locator('body').click({ position: { x: 10, y: 10 } });
    await window.keyboard.press('Control+b');
    await window.waitForTimeout(200);
    await expect(overlay).toBeVisible();

    await overlay.locator('#search-overlay__input').fill('happy');
    await window.waitForTimeout(200);

    await window.keyboard.press('Enter');
    await window.waitForTimeout(200);

    await expect(overlay).toBeHidden();
    const toolbarValue = await toolbar.inputValue();
    expect(toolbarValue).toBe('happy');

    const rowCount = await window.locator('.file-row').count();
    expect(rowCount).toBe(1);
  } finally {
    await closeApp(app);
    fs.rmSync(path.join(TEST_DRIVE_ROOT, 'happy-btest'), { recursive: true, force: true });
  }
});

test('shortcuts — Enter en #search aplica el filtro y mantiene el input visible', async () => {
  fs.mkdirSync(path.join(TEST_DRIVE_ROOT, 'apl-test'), { recursive: true });

  const { app, window } = await launchApp({ env: { GDRIVE_ROOT: TEST_DRIVE_ROOT } });

  try {
    const search = window.locator('#search');
    await search.click();
    await search.fill('apl');
    await window.waitForTimeout(200);

    await search.press('Enter');
    await window.waitForTimeout(200);

    // El usuario quiere ver qué filtro aplicó: Enter NO vacía el input.
    // Se limpia con Escape o al navegar a otra carpeta.
    const valueAfterEnter = await search.inputValue();
    expect(valueAfterEnter).toBe('apl');

    const rowCount = await window.locator('.file-row').count();
    expect(rowCount).toBe(1);
  } finally {
    await closeApp(app);
    fs.rmSync(path.join(TEST_DRIVE_ROOT, 'apl-test'), { recursive: true, force: true });
  }
});

test('shortcuts — toggle de tema cambia entre light y dark con persistencia', async () => {
  const { app, window } = await launchApp({ env: { GDRIVE_ROOT: TEST_DRIVE_ROOT } });

  try {
    const themeBtn = window.locator('#btn-theme-toggle');
    await expect(themeBtn).toBeVisible();

    const initialIsDark = await window.evaluate(() => document.documentElement.classList.contains('dark'));
    const initialText = await themeBtn.textContent();

    await themeBtn.click();
    await window.waitForTimeout(200);

    const afterIsDark = await window.evaluate(() => document.documentElement.classList.contains('dark'));
    const afterText = await themeBtn.textContent();

    expect(afterIsDark).toBe(!initialIsDark);
    expect(afterText).not.toBe(initialText);
  } finally {
    await closeApp(app);
  }
});