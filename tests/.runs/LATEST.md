# LATEST - ultima corrida

_Este archivo se sobreescribe en cada corrida. Para historial completo ver archivos run-*.md._

Run timestamp: 2026-07-08 23:28:40

# Run 2026-07-09 02:28:40

## Resumen
- Total: 23 | Passed: 23 | Failed: 0 | Skipped: 0
- Duracion: 53.2s
- Status final: passed
- Modo: dev (electron .)

## Resultado por test

- ✅ errors — IPC rechaza rutas fuera de la raíz detectada (1.9s)
- ✅ errors — IPC rechaza intentos de path traversal (..\..\) (1.8s)
- ✅ errors — shell.openExternal rechaza protocolos no http/https (1.8s)
- ✅ errors — la app no crashea cuando IPC devuelve null para driveRoot (2.9s)
- ✅ events — el watcher detecta archivos nuevos y refresca la lista (2.4s)
- ✅ events — el watcher detecta archivos borrados y refresca la lista (2.4s)
- ✅ flows — botón "Nueva carpeta" crea una carpeta visible en la lista (1.9s)
- ✅ flows — botón "Atrás" regresa a la raíz (3.9s)
- ✅ flows — búsqueda filtra por prefijo estricto (modo strict) (3.5s)
- ✅ flows — abrir un archivo ejecuta IPC sin errores (1.8s)
- ✅ shortcuts — Ctrl+L enfoca el input de búsqueda (2.1s)
- ✅ shortcuts — Ctrl+N abre el modal de nueva carpeta (2.1s)
- ✅ shortcuts — Escape limpia la búsqueda cuando hay texto (2.3s)
- ✅ shortcuts — F2 inicia rename en el item seleccionado (2.2s)
- ✅ shortcuts — Ctrl+B abre el overlay de búsqueda y Esc lo cierra (2.3s)
- ✅ shortcuts — Enter en #search aplica el filtro y limpia el input (2.2s)
- ✅ shortcuts — toggle de tema cambia entre light y dark con persistencia (2.1s)
- ✅ smoke — la app arranca, detecta raíz, lista archivos y expone IPC (1.9s)
- ✅ smoke — navegación a subcarpeta actualiza breadcrumb y listado (3.4s)
- ✅ visual — cada tipo de archivo recibe su clase CSS data-type (1.9s)
- ✅ visual — las carpetas reciben data-type=folder (1.8s)
- ✅ visual — el ícono de cada fila corresponde al tipo semántico (1.8s)
- ✅ visual — botón "Agrupar" alterna entre vista plana y agrupada (1.9s)

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