const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { launchApp, closeApp, PROJECT_ROOT } = require('../helpers/electron-launcher.cjs');

const TEST_DRIVE_ROOT = path.join(os.tmpdir(), `driveman-test-visual-${process.pid}`);
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

test.beforeAll(async () => {
  fs.mkdirSync(TEST_DRIVE_ROOT, { recursive: true });
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  for (const [name, content] of Object.entries(FIXTURES)) {
    fs.writeFileSync(path.join(TEST_DRIVE_ROOT, name), content);
  }
});

test.afterAll(async () => {
  try { fs.rmSync(TEST_DRIVE_ROOT, { recursive: true, force: true }); } catch {}
});

test('visual — cada tipo de archivo recibe su clase CSS data-type', async () => {
  const { app, window } = await launchApp({ env: { GDRIVE_ROOT: TEST_DRIVE_ROOT } });

  try {
    await expect(window.locator('.file-row').first()).toBeVisible({ timeout: 5000 });

    const rows = window.locator('.file-row');
    const count = await rows.count();
    expect(count).toBe(Object.keys(FIXTURES).length);

    const typeByFile = {};
    for (let i = 0; i < count; i++) {
      const row = rows.nth(i);
      const name = await row.locator('.file-row__name-text').textContent();
      const type = await row.getAttribute('data-type');
      typeByFile[name] = type;
    }

    expect(typeByFile['reporte.pdf']).toBe('docs');
    expect(typeByFile['presupuesto.xlsx']).toBe('office');
    expect(typeByFile['foto.png']).toBe('media');
    expect(typeByFile['intro.mp4']).toBe('media');
    expect(typeByFile['tema.mp3']).toBe('media');
    expect(typeByFile['paquete.zip']).toBe('binary');
    expect(typeByFile['app.js']).toBe('sensitive');
    expect(typeByFile['notas.xyz']).toBe('default');

    await window.screenshot({ path: path.join(SCREENSHOTS_DIR, '03-visual-types.png'), fullPage: true });
  } finally {
    await closeApp(app);
  }
});

test('visual — las carpetas reciben data-type=folder', async () => {
  const folderPath = path.join(TEST_DRIVE_ROOT, 'mi-carpeta');
  fs.mkdirSync(folderPath, { recursive: true });

  const { app, window } = await launchApp({ env: { GDRIVE_ROOT: TEST_DRIVE_ROOT } });

  try {
    const folderRow = window.locator('.file-row[data-type="folder"]').first();
    await expect(folderRow).toBeVisible();
    const folderName = await folderRow.locator('.file-row__name-text').textContent();
    expect(folderName).toBe('mi-carpeta');

    fs.rmSync(folderPath, { recursive: true, force: true });
  } finally {
    await closeApp(app);
  }
});

test('visual — el ícono de cada fila corresponde al tipo semántico', async () => {
  const { app, window } = await launchApp({ env: { GDRIVE_ROOT: TEST_DRIVE_ROOT } });

  try {
    const pdfRow = window.locator('.file-row[data-type="doc"]').first();
    await expect(pdfRow).toBeVisible();
    const pdfIcon = await pdfRow.locator('.file-row__icon').textContent();
    expect(pdfIcon.length).toBeGreaterThan(0);

    const jsRow = window.locator('.file-row[data-type="code"]').first();
    const jsIcon = await jsRow.locator('.file-row__icon').textContent();
    expect(jsIcon).not.toBe(pdfIcon);
  } finally {
    await closeApp(app);
  }
});

test('visual — botón "Agrupar" alterna entre vista plana y agrupada', async () => {
  const { app, window } = await launchApp({ env: { GDRIVE_ROOT: TEST_DRIVE_ROOT } });

  try {
    const groupBtn = window.locator('#btn-group-by');
    await expect(groupBtn).toBeVisible();
    await expect(groupBtn).toHaveAttribute('aria-pressed', 'false');

    const flatRowsBefore = await window.locator('.file-row').count();
    const flatHeadersBefore = await window.locator('.group-header').count();
    expect(flatRowsBefore).toBe(Object.keys(FIXTURES).length);
    expect(flatHeadersBefore).toBe(0);

    await groupBtn.click();
    await expect(groupBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(groupBtn).toHaveClass(/btn--active/);

    const headersAfter = await window.locator('.group-header').count();
    expect(headersAfter).toBeGreaterThan(1);

    const pdfGroup = window.locator('.group-header[data-group="pdf"]');
    await expect(pdfGroup).toBeVisible();
    await expect(pdfGroup).toContainText('pdf');

    const pdfRow = window.locator('.file-row[data-path*="reporte.pdf"]');
    await expect(pdfRow).toBeVisible();

    await pdfGroup.click();
    await expect(pdfGroup).toHaveClass(/group-header--collapsed/);
    await expect(pdfRow).toHaveCount(0);

    await pdfGroup.click();
    await expect(pdfGroup).not.toHaveClass(/group-header--collapsed/);
    await expect(pdfRow).toBeVisible();

    await groupBtn.click();
    await expect(groupBtn).toHaveAttribute('aria-pressed', 'false');
    const headersAgain = await window.locator('.group-header').count();
    expect(headersAgain).toBe(0);
  } finally {
    await closeApp(app);
  }
});