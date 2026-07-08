# LATEST - ultima corrida

_Este archivo se sobreescribe en cada corrida. Para historial completo ver archivos run-*.md._

Run timestamp: 2026-07-08 18:19:24

# Run 2026-07-08 21:19:24

## Resumen
- Total: 20 | Passed: 20 | Failed: 0 | Skipped: 0
- Duracion: 2.5s
- Status final: passed
- Modo: dev (electron .)

## Resultado por test

- ✅ errors — IPC rechaza rutas fuera de la raíz detectada (2.2s)
- ✅ errors — IPC rechaza intentos de path traversal (..\..\) (2.5s)
- ✅ errors — shell.openExternal rechaza protocolos no http/https (2.7s)
- ✅ errors — la app no crashea cuando IPC devuelve null para driveRoot (4.2s)
- ✅ events — el watcher detecta archivos nuevos y refresca la lista (4.2s)
- ✅ events — el watcher detecta archivos borrados y refresca la lista (3.4s)
- ✅ flows — botón "Nueva carpeta" crea una carpeta visible en la lista (3.3s)
- ✅ flows — botón "Atrás" regresa a la raíz (5.0s)
- ✅ flows — búsqueda filtra la lista en tiempo real (4.2s)
- ✅ flows — abrir un archivo ejecuta IPC sin errores (2.4s)
- ✅ shortcuts — Ctrl+L enfoca el input de búsqueda (2.6s)
- ✅ shortcuts — Ctrl+N abre el modal de nueva carpeta (2.4s)
- ✅ shortcuts — Escape limpia la búsqueda cuando hay texto (2.5s)
- ✅ shortcuts — F2 inicia rename en el item seleccionado (3.2s)
- ✅ smoke — la app arranca, detecta raíz, lista archivos y expone IPC (3.5s)
- ✅ smoke — navegación a subcarpeta actualiza breadcrumb y listado (5.5s)
- ✅ visual — cada tipo de archivo recibe su clase CSS data-type (4.6s)
- ✅ visual — las carpetas reciben data-type=folder (3.4s)
- ✅ visual — el ícono de cada fila corresponde al tipo semántico (2.0s)
- ✅ visual — botón "Agrupar" alterna entre vista plana y agrupada (2.5s)

## Bugs conocidos (carry-over)

- **BUG-001** [fixed] _flows / nueva carpeta_
  - window.prompt() no funciona en Electron con contextIsolation=true
  - Evidencia: Renderer log: prompt() is not supported. Playwright no puede automatizar el flujo.
  - Impacto: Boton Nueva carpeta no permite al usuario ingresar nombre en produccion.
  - Fix propuesto: Migrar a input en el DOM (modal propio) o usar dialog.showMessageBox desde el main process.
  - Fix aplicado: Task 4.3 reemplazo prompt() por <dialog> HTML con input nativo. Suite ahora 15/15 sin skips.

## Artefactos
- Screenshots: screenshots/
- Traces: test-results/
- Reporte HTML: playwright-report/