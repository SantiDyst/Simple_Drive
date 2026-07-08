# Test con Playwright — Driveman Desktop v3

Documentación de la sesión de validación con la API `_electron` de Playwright tras la detección de que la app no sincronizaba con `G:\Mi unidad`.

## Resumen

Se ejecutó un test E2E con Playwright para validar la integración entre el main process (Electron) y el renderer (UI). Se detectaron y corrigieron dos bugs críticos que impedían que la app cargara el filesystem de Google Drive.

## Bugs encontrados y corregidos

### Bug #1 — `detectDriveRoot()` con orden incorrecto

**Síntoma**: La app abría OneDrive en `C:\Users\...\OneDrive` en lugar de Google Drive en `G:\Mi unidad`.

**Causa raíz**: La función `detectDriveRoot()` probaba primero los candidatos clásicos en `%USERPROFILE%` (incluido el fallback OneDrive), y solo después escaneaba drive letters A-Z. Como OneDrive existía, ganaba la primera coincidencia y nunca se llegaba al scan de unidades.

**Fix** (`electron/main.cjs:62-94`): invertir el orden de prioridad:

1. `process.env.GDRIVE_ROOT` (override manual)
2. Scan drive letters D-Z (excluyendo `SystemDrive`) buscando `Mi unidad`, `My Drive`, `Google Drive`
3. Candidatos clásicos en `%USERPROFILE%`
4. OneDrive como último fallback

**Validación**: ahora devuelve `G:\Mi unidad` correctamente.

### Bug #2 — Paths absolutos en `public/index.html`

**Síntoma**: Playwright reportaba `welcome up: true` y `0 file rows` aunque `IPC getDriveRoot` devolvía el path correcto.

**Causa raíz**: El HTML usaba `<link href="/styles.css">` y `<script src="/app.js">` con slash inicial. Con `mainWindow.loadFile()` la URL base es `file:///`, así que `/styles.css` se resolvía como `file:///styles.css` (raíz del filesystem) en lugar de `file:///C:/.../public/styles.css`. El navegador reportaba:

```
Failed to load resource: net::ERR_FILE_NOT_FOUND
Failed to load resource: net::ERR_FILE_NOT_FOUND
```

`app.js` nunca cargaba, el `try/catch` silenciaba todo, y la UI caía en la pantalla de bienvenida.

**Fix** (`public/index.html:7,45`): cambiar a paths relativos sin slash inicial (`styles.css`, `app.js`).

**Validación**: 49 archivos listados correctamente, navegación a subcarpetas funcional.

## Validaciones

### 1. Validación con Playwright en modo dev

Ejecutado vía `node test-playwright.cjs --dev`. Lanza `electron .` (sin empaquetar) y automatiza la UI.

```bash
$ node test-playwright.cjs --dev
Modo: dev (electron .)
app launched, esperando ventana...
window event fired: file:///C:/.../public/index.html

=== UI STATE ===
header title: Driveman
breadcrumb:    Mi unidad
status count:  49 elementos
status path:   G:\Mi unidad
file rows:     49
welcome up:    false
IPC getDriveRoot: {"ok":true,"value":"G:\\Mi unidad"}
typeof window.driveman: object
first row:     app-gastos [FOLDER]
all names:     app-gastos, auto_wpp2, conextiones y script, Cronograma Excel,
               DocuSync_Siso, FACU  R-Laborales, GAS REACT CRUD, Google AI Studio ...

screenshot: screenshots/01-root.png

=== NAV INTO FOLDER ===
status path: G:\Mi unidad\app-gastos
rows:        3

screenshot: screenshots/02-folder.png

[OK] test completo
```

### 2. Validación visual con screenshots

- `screenshots/01-root.png` — vista de `G:\Mi unidad` con las 49 carpetas raíz, breadcrumb "Mi unidad", tabla con columnas Nombre, Extensión, Tamaño, Modificado. Dark mode, look minimalista.
- `screenshots/02-folder.png` — vista de `app-gastos` con breadcrumb clickeable "Mi unidad › app-gastos", 3 archivos (`.gscript`, `.gsheet`, `.ini`) con tamaño y fecha relativa.

### 3. Validación del `.exe` built

Lanzado manualmente con PowerShell (`Start-Process`), Playwright no puede automatizar binarios empaquetados con asar en Windows.

```
PID: 25772
running: True
window:  Driveman
--- log ---
{"timestamp":"2026-07-08T03:57:28.536Z","level":"info","source":"main",
 "message":"App ready","version":"0.1.0","driveRoot":"G:\\Mi unidad"}
```

El instalador NSIS generado (`dist/Driveman Setup 0.1.0.exe`, ~85 MB) y el portable (`dist/Driveman 0.1.0.exe`, ~85 MB) arrancan correctamente y apuntan a `G:\Mi unidad`.

## Archivos cambiados

| Archivo | Cambio |
|---------|--------|
| `electron/main.cjs` | `detectDriveRoot()` reescrito con scan de drive letters D-Z (orden correcto) |
| `public/index.html` | Paths relativos sin slash inicial (`styles.css`, `app.js`) |
| `test-playwright.cjs` | Nuevo: script E2E con Playwright Electron API |

## Limitaciones

- **Playwright + `.exe` empaquetado**: la API `_electron` de Playwright no detecta ventanas de binarios empaquetados con asar en Windows. El test funciona en modo dev (`electron .`) pero falla con `--remote-debugging-port=0` sobre el built. Validación alternativa: lanzar manualmente y leer el log.
- **Sin display en CI/sandbox**: la automatización visual solo es posible con un display real. En entornos headless el `.exe` arranca (el log lo confirma) pero la ventana crashea con `exitCode: 143` al matarla.
- **Test dirigido a Drive específica**: el test asume que existe `G:\Mi unidad`. Si en otra máquina la raíz está en otra letra o en `%USERPROFILE%`, el test sigue siendo válido porque `detectDriveRoot()` cubre todos los casos.

## Cómo correr el test

### Prerequisitos

1. Google Drive Desktop instalado y sincronizado en alguna unidad.
2. Node.js 22+.
3. Dependencias instaladas: `npm install`.
4. Dependencia de testing: `npm install --no-save playwright`.

### Modo dev (recomendado)

```bash
node test-playwright.cjs --dev
```

Lanza `electron .`, espera la ventana, captura el estado del DOM, navega a la primera carpeta, toma screenshots y cierra.

### Modo built

```bash
npm run build
node test-playwright.cjs
```

Probablemente falle al detectar la ventana (limitación conocida). Para validar el built, usar PowerShell:

```powershell
$env:APPDATA\driveman-desktop\logs\*.log | Remove-Item -Force
Start-Process '.\dist\win-unpacked\Driveman.exe'
Start-Sleep 4
Get-Content "$env:APPDATA\driveman-desktop\logs\driveman-2026-07-08.log"
```

Verificar que la última línea incluya `"driveRoot":"G:\\Mi unidad"` (o el path correspondiente).

## Salida esperada

Para una instalación típica de Google Drive Desktop en una unidad dedicada:

- breadcrumb: nombre de la carpeta raíz de Drive (`Mi unidad` o `My Drive`)
- status count: número de archivos/carpetas en la raíz
- status path: ruta absoluta detectada
- file rows: mayor o igual a 1
- welcome up: `false`
- IPC getDriveRoot: path absoluto, no `null`

Si `welcome up: true`, el bug #2 (paths) volvió. Si `IPC getDriveRoot` es `null`, el bug #1 (drive root) volvió.
