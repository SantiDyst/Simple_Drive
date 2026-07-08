# Driveman Desktop

Explorador de archivos minimalista para Windows que apunta a la carpeta que **Google Drive Desktop** ya sincroniza en tu PC.

Sin OAuth. Sin servidor. Sin base de datos. Sin red. Lee y escribe directamente sobre tu filesystem local.

## Setup (una sola vez)

### 1. Instalar Google Drive Desktop

Driveman NO maneja la sincronización con la nube — eso lo hace Google Drive Desktop.

1. Descargá Google Drive Desktop desde https://www.google.com/drive/download
2. Instalá y logueate con tu cuenta de Google
3. Esperá a que sincronice tu carpeta (por defecto está en `%USERPROFILE%\Google Drive\Mi unidad`)
4. Driveman detecta automáticamente esa carpeta al arrancar

### 2. Instalar Driveman

Opción A — Instalador NSIS (recomendado):
```bash
npm run build
```
Ejecutá `dist/Driveman Setup 0.1.0.exe`. Instalación per-user (no requiere admin).

Opción B — Portable:
```bash
npm run build:portable
```
Doble clic en `dist/Driveman 0.1.0.exe`. No requiere instalación.

### 3. Arrancar en modo dev

```bash
npm install
npm start          # producción
npm run dev        # con DevTools abierto
```

## Cómo se usa

| Acción | Cómo |
|--------|------|
| Navegar a una carpeta | Doble clic |
| Volver atrás | Botón "← Atrás" o `Alt+Left` |
| Crear carpeta | Botón "Nueva carpeta" |
| Subir/crear archivo | Crealo directamente en la carpeta sincronizada (Google Drive Desktop lo sube solo) |
| Mover archivos | Arrastrá la fila sobre una carpeta de destino |
| Renombrar | Click derecho → Renombrar, o edición inline |
| Eliminar | Click derecho → Mover a papelera (usa la papelera de Windows) |
| Copiar ruta | Click derecho → Copiar ruta |
| Ordenar | Click en encabezado de columna (Nombre, Extensión, Tamaño, Modificado) |
| Filtrar | Escribí en el input de filtro (case-insensitive, en tiempo real) |
| Cerrar ventana | La ventana se oculta, la app queda en la bandeja |
| Reabrir | Click en el ícono de la bandeja |
| Salir | Click derecho en el ícono → Salir |

## Arquitectura

```
electron/main.cjs          Proceso principal: IPC handlers, fs.*, tray, ventana, lifecycle
electron/preload.cjs       Bridge seguro: expone window.driveman.fs.* via contextBridge
public/index.html          Estructura del explorador (vanilla HTML)
public/styles.css          Diseño minimalista modo oscuro
public/app.js              Lógica de UI (vanilla JS, sin frameworks)
renderer/assets/tray-icon.png  Ícono de bandeja 16x16
```

### Flujo de datos

```
UI (renderer)
  ├─ window.driveman.fs.listDir(path)      → IPC → fs.readdir
  ├─ window.driveman.fs.move(src, dst)     → IPC → fs.rename (con fallback EXDEV)
  ├─ window.driveman.fs.delete(path)       → IPC → shell.trashItem (papelera)
  ├─ window.driveman.fs.createFolder(path) → IPC → fs.mkdir
  ├─ window.driveman.fs.openFile(path)     → IPC → shell.openPath
  ├─ window.driveman.fs.rename(o, n)       → IPC → fs.rename
  ├─ window.driveman.fs.watch(path)        → IPC → fs.watch (notifica fs:changed)
  ├─ window.driveman.app.getDriveRoot()    → IPC → detectar carpeta GDrive
  └─ window.driveman.app.openSettings()    → IPC → shell.openPath(settings.json)
```

**Sin servidor HTTP.** El renderer carga via `loadFile()` directo al HTML estático.

### Detección de la carpeta raíz

`detectDriveRoot()` busca en este orden:

1. `process.env.GDRIVE_ROOT` (override manual)
2. `%USERPROFILE%\Google Drive\Mi unidad`
3. `%USERPROFILE%\Google Drive\My Drive`
4. `%USERPROFILE%\Google Drive`
5. `%USERPROFILE%\OneDrive` (fallback documentado)
6. Si ninguna existe → muestra pantalla de bienvenida, NO crashea

### Seguridad

- `contextIsolation: true`, `nodeIntegration: false`
- El renderer **NO** tiene acceso directo a `fs`
- Toda operación pasa por IPC con validación en el main process
- `resolveInsideRoot()` rechaza cualquier ruta fuera de la raíz detectada (anti path-traversal)
- `shell:open-external` valida que el protocolo sea `http:` o `https:` antes de abrir
- Eliminaciones usan `shell.trashItem` (papelera del SO), nunca `fs.unlink` directo

## Comandos

| Acción | Comando |
|--------|---------|
| Dev | `npm start` o `npm run dev` |
| Build instalador NSIS | `npm run build` |
| Build portable .exe | `npm run build:portable` |

## Logs

Se guardan en `%APPDATA%\driveman-desktop\logs\driveman-YYYY-MM-DD.log` (rotación diaria, máximo 5 MB por día).

Capturan:
- Eventos del main process (arranque, errores, lifecycle)
- Crashes del renderer
- Uncaught exceptions y unhandled rejections

## Configuración

`%APPDATA%\driveman-desktop\settings.json`:

```json
{ "autoStart": true }
```

- `autoStart` (default `true`): arranca Driveman al iniciar Windows, oculto en la bandeja.

## Edge cases manejados

- **Sin Google Drive Desktop**: muestra pantalla de bienvenida, no crashea. Caé al fallback OneDrive si está disponible.
- **Sin permisos sobre un archivo**: `listDir` salta el archivo (EPERM/EACCES) y sigue con los demás.
- **Drag entre discos distintos**: `fs:move` hace copy + unlink automáticamente (EXDEV).
- **Watcher inestable**: si `fs.watch` falla, se loguea warning y el listado se refresca solo en próxima navegación.
- **Segunda instancia**: el single-instance lock enfoca la ventana existente, no abre nueva.

## Stack

- Runtime: Electron 33+ (sin dependencias de runtime adicionales)
- Renderer: HTML + CSS + JS vanilla
- Persistencia: filesystem local (no DB)
- IPC: `contextBridge` + `ipcRenderer.invoke`
- Packaging: electron-builder (NSIS per-user + portable .exe)

## Constraints (decisiones cerradas)

1. NO React, Vue ni ningún framework JS.
2. NO servidor HTTP de ningún tipo.
3. NO llamadas a la API de Google Drive.
4. NO OAuth, NO credentials.json, NO tokens.
5. NO base de datos.
6. NO librerías de terceros en runtime.
7. Vanilla JS + Vanilla CSS.
8. El renderer carga via `loadFile()`, no `loadURL()`.
9. Toda operación de filesystem pasa por IPC (no `nodeIntegration`).
10. `contextIsolation: true`, `nodeIntegration: false`.
11. Eliminaciones usan `shell.trashItem` (papelera), nunca `fs.unlink`.
12. El usuario no puede navegar fuera de la carpeta raíz de Google Drive.