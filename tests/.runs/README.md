# Driveman Desktop — Bitácora de corridas de tests

Este directorio guarda, en formato markdown legible, un resumen de cada ejecución de la suite E2E. Cada archivo `run-YYYY-MM-DD-HHMMSS.md` corresponde a una corrida completa.

## Por qué existe

Playwright genera reportes HTML (`playwright-report/`) y traces binarios (`test-results/`) que son excelentes para humanos pero **no consumibles por IAs ni por grep simple**. Este log en markdown sirve como:

- **Fuente única de verdad** del estado de la app testeada.
- **Historial** de regresiones y bugs conocidos a lo largo del tiempo.
- **Input** para que un agente de IA (como yo) pueda entender qué se rompió entre versiones sin tener que reproducir todo.
- **Inspección rápida** vía `cat` o `grep` sin abrir browsers ni HTMLs.

## Formato

Cada archivo sigue esta estructura:

```markdown
# Run YYYY-MM-DD HH:MM:SS

## Resumen
- Total: N | Passed: N | Failed: N | Skipped: N
- Duración: Ns
- Modo: dev (electron .) | built (.exe)

## Resultado por test
- ✅ smoke — la app arranca, detecta raíz, lista archivos y expone IPC (2.1s)
- ✅ smoke — navegación a subcarpeta actualiza breadcrumb y listado (3.6s)
- ⏭️ flows — botón "Nueva carpeta" crea una carpeta visible en la lista [SKIP]
  - Razón: window.prompt() no soportado en Electron contextIsolation. Pendiente migrar a input en DOM.
- ❌ <nombre> (N.Ns)
  - Error: ...
  - File: ...

## Bugs conocidos (carry-over)
- [flows] prompt() no funciona con contextIsolation=true
- ...