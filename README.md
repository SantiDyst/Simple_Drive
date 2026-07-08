# Driveman Desktop

Explorador de archivos minimalista para Windows que apunta a la carpeta sincronizada por **Google Drive Desktop** en el equipo local.

Sin OAuth. Sin servidor HTTP. Sin base de datos. Sin llamadas de red. Driveman lee y escribe directamente sobre el filesystem local; la sincronización con la nube queda a cargo de Google Drive Desktop.

---

## Requisitos previos

| Requisito | Versión / detalle |
|-----------|-------------------|
| Sistema operativo | Windows 10 u 11 (x64) |
| Node.js | 22 o superior (`node --version`) |
| npm | Incluido con Node.js |
| Google Drive Desktop | Instalado, autenticado y con la carpeta sincronizada |
| Espacio en disco | ~500 MB para `node_modules` + ~150 MB para el build |

Si no se cuenta con Google Drive Desktop, la aplicación abre una pantalla de bienvenida y, si está disponible, cae como fallback sobre OneDrive.

---

## Documentación adicional

- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — Por qué la app está dividida en dos procesos (main + renderer), qué problema de seguridad resuelve la capa IPC, y por qué no existe "comunicación nativa directa" con Windows.

---

## Quickstart (post `git clone`)

```bash
git clone <url-del-repo>
cd driveman-desktop-starter
npm install
npm start
```

`npm start` lanza Electron en modo producción. Para abrir DevTools automáticamente:

```bash
npm run dev
```

---

## Estructura del proyecto

```
electron/main.cjs            Proceso principal: IPC handlers, fs.*, bandeja, ventana, lifecycle
electron/preload.cjs         Bridge seguro: expone window.driveman.* vía contextBridge
public/index.html            Estructura del explorador (HTML estático)
public/styles.css            Estilos dark mode minimalistas
public/app.js                Lógica de UI (vanilla JS, sin frameworks)
renderer/assets/tray-icon.png  Ícono de bandeja 16x16
test-playwright.cjs          Test E2E con la API _electron de Playwright
tools/7za-wrapper/           Wrappers de 7-Zip (los .exe no se versionan)
```

---

## Detección de la carpeta raíz

`detectDriveRoot()` (en `electron/main.cjs`) evalúa las siguientes ubicaciones en orden de prioridad y devuelve la primera coincidencia válida:

1. Variable de entorno `GDRIVE_ROOT` (override manual).
2. Scan de letras de unidad `D:` a `Z:` (excluyendo la unidad del sistema) buscando las carpetas `Mi unidad`, `My Drive` o `Google Drive`.
3. Candidatos clásicos bajo `%USERPROFILE%`:
   - `%USERPROFILE%\Google Drive\Mi unidad`
   - `%USERPROFILE%\Google Drive\My Drive`
   - `%USERPROFILE%\Google Drive`
4. `%USERPROFILE%\OneDrive` como último fallback documentado.
5. Si ninguna existe, retorna `null` y la UI muestra la pantalla de bienvenida en lugar de fallar.

---

## Arquitectura IPC

El renderer no tiene acceso directo a `fs`. Toda operación pasa por el bridge expuesto en `window.driveman`:

| Método | Operación |
|--------|-----------|
| `window.driveman.fs.listDir(path)` | Listar contenido (con `stat` por entrada) |
| `window.driveman.fs.stat(path)` | Tamaño y mtime de una entrada |
| `window.driveman.fs.move(src, dst)` | Renombrar; fallback `copyFile + unlink` si cruza unidades (`EXDEV`) |
| `window.driveman.fs.delete(path)` | Mover a la papelera de Windows (`shell.trashItem`) |
| `window.driveman.fs.createFolder(path)` | Crear directorio |
| `window.driveman.fs.openFile(path)` | Abrir con la aplicación predeterminada |
| `window.driveman.fs.rename(old, new)` | Renombrar in-place |
| `window.driveman.fs.watch(path)` | Iniciar `fs.watch` y recibir eventos `fs:changed` |
| `window.driveman.app.getDriveRoot()` | Devuelve la raíz detectada |
| `window.driveman.app.getVersion()` | Versión del `package.json` |
| `window.driveman.app.openSettings()` | Abre `settings.json` en el editor predeterminado |
| `window.driveman.shell.openExternal(url)` | Abre URL en navegador (solo `http:` y `https:`) |
| `window.driveman.logs.getRecent()` | Últimas 500 líneas de log |
| `window.driveman.logs.getDir()` | Ruta del directorio de logs |

Cada handler valida que la ruta solicitada esté dentro de la raíz detectada mediante `resolveInsideRoot()`, que rechaza cualquier intento de path-traversal.

---

## Comandos disponibles

| Comando | Descripción |
|---------|-------------|
| `npm install` | Instalar dependencias (solo `electron` y `electron-builder`) |
| `npm start` | Lanzar la aplicación (`electron .`) sin DevTools |
| `npm run dev` | Lanzar la aplicación con DevTools abierto en panel desacoplado |
| `npm run build` | Empaquetar instalador NSIS (`dist/Driveman Setup <version>.exe`) |
| `npm run build:portable` | Empaquetar binario portable (`dist/Driveman <version>.exe`) |

---

## Seguridad

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox` efectivo vía preload.
- El renderer no tiene acceso directo a Node.js ni a `fs`.
- Cada handler IPC valida la ruta solicitada contra la raíz detectada (`resolveInsideRoot`).
- `shell.openExternal` rechaza cualquier protocolo distinto de `http:` o `https:`.
- Las eliminaciones usan `shell.trashItem` (papelera del sistema operativo); nunca `fs.unlink` directo.

---

## Edge cases manejados

- **Sin Google Drive Desktop**: pantalla de bienvenida, sin crash. Fallback automático a OneDrive si existe.
- **Archivos sin permisos**: `listDir` omite entradas con `EPERM`/`EACCES` y continúa.
- **Movimiento entre unidades distintas**: `fs:move` ejecuta `copyFile + unlink` cuando `rename` falla con `EXDEV`.
- **Watcher inestable**: si `fs.watch` falla, se registra un warning y el siguiente `listDir` refresca la vista.
- **Segunda instancia**: el single-instance lock enfoca la ventana existente en lugar de abrir una nueva.

---

## Configuración

Archivo: `%APPDATA%\driveman-desktop\settings.json`

```json
{ "autoStart": true }
```

| Campo | Default | Significado |
|-------|---------|-------------|
| `autoStart` | `true` | Registrar Driveman para arrancar al iniciar Windows, oculto en la bandeja. |

---

## Logs

Ubicación: `%APPDATA%\driveman-desktop\logs\driveman-YYYY-MM-DD.log`

- Rotación diaria con tope de 5 MB por archivo.
- Capturan eventos del main process, crashes del renderer, `uncaughtException` y `unhandledRejection`.

Para inspeccionar logs desde la UI se exponen los handlers `logs:get-recent` y `logs:get-dir`.

---

## Tests E2E

El proyecto incluye `test-playwright.cjs`, un test E2E basado en la API `_electron` de Playwright. La documentación detallada (bugs detectados, limitaciones, modo dev vs built, salida esperada) está en [`TEST_PLAYWRIGHT.md`](./TEST_PLAYWRIGHT.md).

Ejecución rápida:

```bash
npm install --no-save playwright
node test-playwright.cjs --dev
```

---

## Build de distribución

```bash
npm run build           # dist/Driveman Setup 0.1.0.exe   (instalador NSIS per-user)
npm run build:portable  # dist/Driveman 0.1.0.exe          (portable, sin instalación)
```

El instalador NSIS es per-user (no requiere elevación) y permite elegir directorio de instalación.

---

## Stack técnico

- **Runtime**: Electron 35.x
- **Renderer**: HTML + CSS + JavaScript vanilla (sin frameworks ni librerías de terceros en runtime)
- **Persistencia**: filesystem local (sin base de datos)
- **IPC**: `contextBridge` + `ipcRenderer.invoke`
- **Empaquetado**: electron-builder (targets NSIS y portable)
- **Testing E2E**: Playwright (instalado bajo demanda, no en `devDependencies`)

---

## Constraints (decisiones cerradas)

1. Sin React, Vue ni ningún framework de UI.
2. Sin servidor HTTP de ningún tipo.
3. Sin llamadas a la API de Google Drive.
4. Sin OAuth, `credentials.json` ni tokens.
5. Sin base de datos.
6. Sin librerías de terceros en runtime (solo Electron y las APIs nativas).
7. JavaScript y CSS vanilla.
8. El renderer carga vía `loadFile()`, nunca `loadURL()`.
9. Toda operación de filesystem pasa por IPC; el renderer no tiene `nodeIntegration`.
10. `contextIsolation: true`, `nodeIntegration: false`.
11. Las eliminaciones usan `shell.trashItem` (papelera), nunca `fs.unlink`.
12. El usuario no puede navegar fuera de la carpeta raíz detectada.

---

## Solución de problemas

| Síntoma | Causa probable | Solución |
|---------|----------------|----------|
| La app abre la pantalla de bienvenida aunque Google Drive Desktop está instalado | `detectDriveRoot()` no encontró la carpeta | Verificar `%USERPROFILE%\Google Drive\Mi unidad` o definir `GDRIVE_ROOT` con la ruta absoluta |
| Los archivos no aparecen tras navegar | El watcher cayó o el listado no se refrescó | Re-navegar a la carpeta (disparador implícito de `listDir`) |
| `npm start` falla con `Electron failed to install correctly` | Instalación de Electron interrumpida | Borrar `node_modules` y ejecutar `npm install` nuevamente |
| El instalador NSIS pide elevación | Caso atípico en Windows | Verificar que la versión de electron-builder sea la del `package.json` (`^25.0.0`) |
| `node test-playwright.cjs --dev` no detecta la ventana | Playwright no instalado | `npm install --no-save playwright` |

Para reportar un bug, adjuntar la última línea del log con `level: "error"` y la salida de `window.driveman.app.getDriveRoot()`.