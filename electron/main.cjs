const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, shell } = require('electron');
const fs = require('fs');
const path = require('path');

const SERVER_START_TIMEOUT_MS = 10_000;
const MAX_DAILY_BYTES = 5 * 1024 * 1024;
const RECENT_LINES = 500;

let mainWindow = null;
let tray = null;
let isQuitting = false;
let fsWatcher = null;

const userDataDir = app.getPath('userData');
const logsDir = path.join(userDataDir, 'logs');
const settingsPath = path.join(userDataDir, 'settings.json');

if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

let currentLogFile = path.join(logsDir, `driveman-${new Date().toISOString().split('T')[0]}.log`);
let writeStream = fs.createWriteStream(currentLogFile, { flags: 'a' });
let currentSize = 0;
try { currentSize = fs.statSync(currentLogFile).size; } catch {}

function log(level, source, message, extra) {
  const entry = { timestamp: new Date().toISOString(), level, source, message, ...(extra || {}) };
  const line = JSON.stringify(entry) + '\n';
  const buf = Buffer.from(line, 'utf8');
  if (currentSize + buf.length > MAX_DAILY_BYTES) {
    const archived = currentLogFile.replace('.log', `-${Date.now()}.log`);
    try { writeStream.end(); fs.renameSync(currentLogFile, archived); } catch {}
    currentLogFile = path.join(logsDir, `driveman-${new Date().toISOString().split('T')[0]}.log`);
    try { currentSize = fs.statSync(currentLogFile).size; } catch { currentSize = 0; }
    writeStream = fs.createWriteStream(currentLogFile, { flags: 'a' });
  }
  writeStream.write(buf);
  currentSize += buf.length;
}

process.on('uncaughtException', (err) => log('error', 'main', 'Uncaught exception', { message: err.message, stack: err.stack }));
process.on('unhandledRejection', (reason) => {
  const err = reason instanceof Error ? reason : new Error(String(reason));
  log('error', 'main', 'Unhandled rejection', { message: err.message, stack: err.stack });
});

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  log('warn', 'main', 'Another instance is already running, quitting');
  app.quit();
  process.exit(0);
}

app.on('second-instance', () => {
  log('info', 'main', 'Second instance detected, focusing existing window');
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    if (!mainWindow.isVisible()) mainWindow.show();
    mainWindow.focus();
  }
});

function isDirectorySafe(p) {
  try { return fs.existsSync(p) && fs.statSync(p).isDirectory(); } catch { return false; }
}

function detectDriveRoot() {
  if (process.env.GDRIVE_ROOT && isDirectorySafe(process.env.GDRIVE_ROOT)) {
    return process.env.GDRIVE_ROOT;
  }

  if (process.platform === 'win32') {
    const folderNames = ['Mi unidad', 'My Drive', 'Google Drive'];
    for (let code = 65; code <= 90; code++) {
      const letter = String.fromCharCode(code);
      const root = letter + ':\\';
      if (!isDirectorySafe(root)) continue;
      if (root === process.env.SystemDrive + '\\') continue;
      for (const name of folderNames) {
        const candidate = path.join(root, name);
        if (isDirectorySafe(candidate)) return candidate;
      }
    }
  }

  const userHome = process.env.USERPROFILE || process.env.HOME || '';
  const classicCandidates = [
    path.join(userHome, 'Google Drive', 'Mi unidad'),
    path.join(userHome, 'Google Drive', 'My Drive'),
    path.join(userHome, 'Google Drive')
  ];
  for (const candidate of classicCandidates) {
    if (isDirectorySafe(candidate)) return candidate;
  }

  const oneDrive = path.join(userHome, 'OneDrive');
  if (isDirectorySafe(oneDrive)) return oneDrive;

  return null;
}

function resolveInsideRoot(targetPath) {
  const root = detectDriveRoot();
  if (!root) return null;
  const normalizedRoot = path.resolve(root);
  const normalizedTarget = path.resolve(targetPath);
  if (normalizedTarget === normalizedRoot) return normalizedTarget;
  if (normalizedTarget.startsWith(normalizedRoot + path.sep)) return normalizedTarget;
  return null;
}

function readSettings() {
  try { return JSON.parse(fs.readFileSync(settingsPath, 'utf8')); } catch { return {}; }
}

function configureAutoStart() {
  if (process.platform !== 'win32') return;
  const settings = readSettings();
  const autoStart = settings.autoStart !== false;
  app.setLoginItemSettings({ openAtLogin: autoStart, openAsHidden: true, args: ['--hidden'] });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'Driveman',
    backgroundColor: '#111111',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'public', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (process.argv.includes('--dev')) mainWindow.webContents.openDevTools({ mode: 'detach' });
  });

  mainWindow.on('close', (event) => {
    log('info', 'main', 'mainWindow close event', {
      isQuitting,
      isVisible: mainWindow.isVisible(),
      isDestroyed: mainWindow.isDestroyed()
    });
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      log('info', 'main', 'mainWindow close prevented, hidden', {});
    } else {
      log('info', 'main', 'mainWindow close allowed (isQuitting=true)', {});
    }
  });

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    log('error', 'renderer', 'Renderer crashed', { reason: details.reason, exitCode: details.exitCode });
  });

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    log('error', 'renderer', 'Page failed to load', { errorCode, errorDescription, url: validatedURL });
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url);
      if (['https:', 'http:'].includes(parsed.protocol)) shell.openExternal(url);
    } catch {}
    return { action: 'deny' };
  });
}

function createTray() {
  const iconPath = path.join(__dirname, '..', 'renderer', 'assets', 'tray-icon.png');
  let icon;
  try {
    icon = nativeImage.createFromPath(iconPath);
    if (icon.isEmpty()) throw new Error('empty');
  } catch {
    icon = nativeImage.createEmpty();
  }
  tray = new Tray(icon);
  tray.setToolTip('Driveman');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Abrir Driveman', click: () => mainWindow && mainWindow.show() },
    { type: 'separator' },
    { label: 'Salir', click: () => { isQuitting = true; app.quit(); } }
  ]));
  tray.on('click', () => {
    if (!mainWindow) return;
    if (mainWindow.isVisible()) mainWindow.hide();
    else mainWindow.show();
  });
}

function startWatching(dirPath) {
  if (fsWatcher) {
    try { fsWatcher.close(); } catch {}
    fsWatcher = null;
  }
  try {
    fsWatcher = fs.watch(dirPath, { persistent: false }, (eventType, filename) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('fs:changed', { eventType, filename, dir: dirPath });
      }
    });
    fsWatcher.on('error', (err) => log('warn', 'main', 'fs.watch error', { message: err.message }));
  } catch (err) {
    log('warn', 'main', 'Could not start watcher', { dir: dirPath, message: err.message });
  }
}

ipcMain.handle('fs:list-dir', async (_e, dirPath) => {
  const safe = resolveInsideRoot(dirPath);
  if (!safe) throw new Error('Acceso denegado: ruta fuera de la raíz de Google Drive');
  const entries = await fs.promises.readdir(safe, { withFileTypes: true });
  const items = [];
  for (const entry of entries) {
    const fullPath = path.join(safe, entry.name);
    try {
      const stat = await fs.promises.stat(fullPath);
      items.push({
        name: entry.name,
        path: fullPath,
        isDir: entry.isDirectory(),
        ext: entry.isDirectory() ? null : path.extname(entry.name).slice(1).toLowerCase() || null,
        size: stat.size,
        mtime: stat.mtimeMs
      });
    } catch (err) {
      if (err.code !== 'EPERM' && err.code !== 'EACCES') throw err;
    }
  }
  return items;
});

ipcMain.handle('fs:stat', async (_e, filePath) => {
  const safe = resolveInsideRoot(filePath);
  if (!safe) throw new Error('Acceso denegado: ruta fuera de la raíz');
  const stat = await fs.promises.stat(safe);
  return { size: stat.size, mtime: stat.mtimeMs, isDir: stat.isDirectory() };
});

ipcMain.handle('fs:move', async (_e, srcPath, dstPath) => {
  const src = resolveInsideRoot(srcPath);
  const dst = resolveInsideRoot(dstPath);
  if (!src || !dst) throw new Error('Acceso denegado: ruta fuera de la raíz');
  try {
    await fs.promises.rename(src, dst);
  } catch (err) {
    if (err.code === 'EXDEV') {
      await fs.promises.copyFile(src, dst);
      await fs.promises.unlink(src);
    } else {
      throw err;
    }
  }
  return { ok: true };
});

ipcMain.handle('fs:delete', async (_e, filePath) => {
  const safe = resolveInsideRoot(filePath);
  if (!safe) throw new Error('Acceso denegado: ruta fuera de la raíz');
  await shell.trashItem(safe);
  return { ok: true };
});

ipcMain.handle('fs:create-folder', async (_e, dirPath) => {
  const safe = resolveInsideRoot(dirPath);
  if (!safe) throw new Error('Acceso denegado: ruta fuera de la raíz');
  await fs.promises.mkdir(safe, { recursive: false });
  return { ok: true };
});

ipcMain.handle('fs:open-file', async (_e, filePath) => {
  log('info', 'main', 'fs:open-file called', {
    filePath,
    ext: path.extname(filePath).toLowerCase()
  });
  const safe = resolveInsideRoot(filePath);
  if (!safe) {
    log('warn', 'main', 'fs:open-file denied', { filePath, reason: 'outside drive root' });
    throw new Error('Acceso denegado: ruta fuera de la raíz de Google Drive');
  }
  log('info', 'main', 'fs:open-file invoking shell.openPath', { safe });
  const result = await shell.openPath(safe);
  log('info', 'main', 'fs:open-file shell.openPath returned', { safe, result });
  return { ok: true, result };
});

ipcMain.handle('fs:rename', async (_e, oldPath, newPath) => {
  const oldSafe = resolveInsideRoot(oldPath);
  const newSafe = resolveInsideRoot(newPath);
  if (!oldSafe || !newSafe) throw new Error('Acceso denegado: ruta fuera de la raíz');
  await fs.promises.rename(oldSafe, newSafe);
  return { ok: true };
});

ipcMain.handle('fs:watch', async (_e, dirPath) => {
  const safe = resolveInsideRoot(dirPath);
  if (!safe) throw new Error('Acceso denegado: ruta fuera de la raíz');
  startWatching(safe);
  return { ok: true };
});

ipcMain.handle('app:get-drive-root', () => detectDriveRoot());
ipcMain.handle('app:get-version', () => app.getVersion());
ipcMain.handle('app:open-settings', () => shell.openPath(settingsPath));
ipcMain.handle('shell:open-external', (_e, url) => {
  try {
    const parsed = new URL(url);
    if (!['https:', 'http:'].includes(parsed.protocol)) return { ok: false, reason: 'protocol not allowed' };
  } catch { return { ok: false, reason: 'invalid url' }; }
  shell.openExternal(url);
  return { ok: true };
});

ipcMain.handle('logs:get-recent', () => {
  try {
    const content = fs.readFileSync(currentLogFile, 'utf8');
    return content.trim().split('\n').filter(Boolean).slice(-RECENT_LINES).map(line => {
      try { return JSON.parse(line); } catch { return { level: 'raw', message: line }; }
    });
  } catch { return []; }
});

ipcMain.handle('logs:get-dir', () => logsDir);

app.whenReady().then(() => {
  try {
    Menu.setApplicationMenu(null);
    createWindow();
    createTray();
    configureAutoStart();
    log('info', 'main', 'App ready', { version: app.getVersion(), driveRoot: detectDriveRoot() });
  } catch (err) {
    log('error', 'main', 'Failed to start app', { message: err.message, stack: err.stack });
    app.quit();
  }
});

app.on('window-all-closed', (event) => event.preventDefault());

app.on('before-quit', () => {
  const stack = new Error('before-quit stack').stack;
  log('info', 'main', 'App before-quit', { stack });
  isQuitting = true;
  if (fsWatcher) { try { fsWatcher.close(); } catch {} }
  if (writeStream) writeStream.end();
});

app.on('will-quit', () => {
  log('info', 'main', 'App will-quit');
});

app.on('quit', (_event, exitCode) => {
  // Nota: este log puede no escribirse si el writeStream ya se cerró arriba.
  console.log(`[driveman] App quit exitCode=${exitCode} timestamp=${new Date().toISOString()}`);
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
  else mainWindow && mainWindow.show();
});