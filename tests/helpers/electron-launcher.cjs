const { _electron: electron } = require('@playwright/test');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_TIMEOUT = 30_000;

async function launchApp({ env = {}, devMode = true } = {}) {
  const app = await electron.launch({
    args: devMode ? ['.'] : [path.join(PROJECT_ROOT, 'dist', 'win-unpacked', 'Driveman.exe')],
    cwd: PROJECT_ROOT,
    timeout: DEFAULT_TIMEOUT,
    env: {
      ...process.env,
      ...env,
    },
  });

  app.on('window', (w) => console.log('[helper] window event:', w.url()));
  app.process().stdout?.on('data', (chunk) => {
    const txt = chunk.toString();
    if (txt.trim()) console.log('[main]', txt.trim());
  });
  app.process().stderr?.on('data', (chunk) => {
    const txt = chunk.toString();
    if (txt.trim()) console.error('[main:err]', txt.trim());
  });

  const window = await app.firstWindow({ timeout: DEFAULT_TIMEOUT });
  window.on('console', (msg) => {
    if (msg.type() === 'error') console.error('[renderer]', msg.text());
  });
  window.on('pageerror', (err) => console.error('[renderer ERROR]', err.message));

  await window.waitForLoadState('domcontentloaded');
  await window.waitForTimeout(1500);

  return { app, window };
}

async function closeApp(app) {
  try {
    await app.close();
  } catch (err) {
    console.warn('[helper] close failed, killing process', err.message);
    try { app.process().kill(); } catch {}
  }
}

module.exports = { launchApp, closeApp, PROJECT_ROOT };