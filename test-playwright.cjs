const { _electron: electron } = require('playwright');
const path = require('path');
const fs = require('fs');

(async () => {
  const exePath = path.resolve(__dirname, 'dist/win-unpacked/Driveman.exe');
  const devMode = process.argv.includes('--dev');
  if (!fs.existsSync(exePath) && !devMode) {
    console.error('No existe:', exePath);
    process.exit(1);
  }

  console.log('Modo:', devMode ? 'dev (electron .)' : 'built (.exe)');

  const screenshotsDir = path.join(__dirname, 'screenshots');
  if (!fs.existsSync(screenshotsDir)) fs.mkdirSync(screenshotsDir);

  const app = await electron.launch({
    args: devMode ? ['.'] : [exePath],
    cwd: __dirname,
    timeout: 30000
  });

  console.log('app launched, esperando ventana...');
  app.on('window', w => console.log('window event fired:', w.url()));
  const window = await app.firstWindow({ timeout: 25000 });

  window.on('console', msg => console.log(`[renderer ${msg.type()}]`, msg.text()));
  window.on('pageerror', err => console.log(`[renderer ERROR]`, err.message));
  await window.waitForLoadState('domcontentloaded');
  await window.waitForTimeout(2000);

  const headerTitle = await window.locator('.header__title').textContent();
  const breadcrumbText = await window.locator('#breadcrumb').textContent();
  const statusCount = await window.locator('#status-count').textContent();
  const statusPath = await window.locator('#status-path').textContent();
  const rowCount = await window.locator('.file-row').count();
  const welcomeVisible = await window.locator('#welcome').isVisible();

  console.log('\n=== UI STATE ===');
  console.log('header title:', headerTitle);
  console.log('breadcrumb:   ', breadcrumbText.trim());
  console.log('status count: ', statusCount);
  console.log('status path:  ', statusPath);
  console.log('file rows:    ', rowCount);
  console.log('welcome up:   ', welcomeVisible);

  const driveRoot = await window.evaluate(async () => {
    try {
      const r = await window.driveman.app.getDriveRoot();
      return { ok: true, value: r };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });
  console.log('IPC getDriveRoot:', JSON.stringify(driveRoot));

  const hasDriveman = await window.evaluate(() => typeof window.driveman);
  console.log('typeof window.driveman:', hasDriveman);

  if (rowCount > 0) {
    const firstRowName = await window.locator('.file-row .file-row__name-text').first().textContent();
    const firstRowIsDir = await window.locator('.file-row').first().evaluate(el => el.classList.contains('file-row--folder'));
    console.log('first row:    ', firstRowName, firstRowIsDir ? '[FOLDER]' : '[FILE]');

    const sampleNames = await window.locator('.file-row .file-row__name-text').allTextContents();
    console.log('all names:    ', sampleNames.slice(0, 8).join(', '), '...');
  }

  await window.screenshot({ path: path.join(screenshotsDir, '01-root.png'), fullPage: true });
  console.log('\nscreenshot: screenshots/01-root.png');

  if (rowCount > 0) {
    const firstFolder = window.locator('.file-row--folder').first();
    const hasFolder = await firstFolder.count();
    if (hasFolder > 0) {
      await firstFolder.dblclick();
      await window.waitForTimeout(1500);
      const newStatusPath = await window.locator('#status-path').textContent();
      const newRowCount = await window.locator('.file-row').count();
      console.log('\n=== NAV INTO FOLDER ===');
      console.log('status path:', newStatusPath);
      console.log('rows:       ', newRowCount);
      await window.screenshot({ path: path.join(screenshotsDir, '02-folder.png'), fullPage: true });
      console.log('screenshot: screenshots/02-folder.png');
    }
  }

  await app.close();
  console.log('\n[OK] test completo');
})().catch(err => {
  console.error('FAIL:', err.message);
  console.error(err.stack);
  process.exit(1);
});