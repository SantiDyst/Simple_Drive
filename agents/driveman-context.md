---
name: driveman-context
description: |
  Contexto del proyecto Driveman Desktop para agentes IA. Cargar esta skill
  antes de responder preguntas sobre Driveman, hacer cambios, correr tests,
  o implementar features del roadmap.
---

# Driveman Desktop — contexto del proyecto

## Qué es

Explorador de archivos minimalista para Windows que apunta a la carpeta sincronizada de Google Drive Desktop. Sin OAuth, sin servidor HTTP, sin base de datos. Lee y escribe directo sobre el filesystem local.

## Arquitectura

Es una app **Electron** con patrón de dos procesos:

- **Main process** (`electron/main.cjs`): Node.js puro. Maneja `BrowserWindow`, bandeja, IPC handlers, lifecycle, logs.
- **Renderer** (`public/`): HTML + CSS + JS vanilla. Cargado vía `mainWindow.loadFile()`. NO tiene acceso directo a `fs` ni a Node (por `contextIsolation: true`, `nodeIntegration: false`).
- **Preload bridge** (`electron/preload.cjs`): expone `window.driveman` (api namespaced: `fs`, `app`, `openExternal`, `logs`) vía `contextBridge`.

**Toda operación de filesystem pasa por IPC**. Cada handler valida con `resolveInsideRoot()` que la ruta esté dentro de la raíz detectada (anti path-traversal).

Para más detalle arquitectónico ver `ARCHITECTURE.md` en la raíz.

## Convenciones del código

- **Sin frameworks en runtime.** HTML/CSS/JS vanilla en el renderer. Fuse.js es la única excepción de runtime (justificada por la búsqueda fuzzy).
- **CSS con Tailwind v4** como única dependencia de build. Config CSS-first via `@theme` en `public/styles.src.css`. Variables design-token se nombran con prefijo `--color-*` y se materializan en utilities `bg-*`, `text-*`, `border-*`. Compilación vía `npm run build:css` (one-shot) o `npm run watch:css` (dev). Output en `public/dist/styles.css`, linkeado desde `index.html`.
- **Modo dark/light via clase `.dark`** en `<html>`, toggle gestionado por `darkMode: 'class'` (configurado en CSS con `@custom-variant dark`). Implementado desde día 1.
- **IPC** siempre via `window.driveman.*`. Nunca tocar `fs` desde el renderer.
- **Constraints cerrados** (no negociables):
  - Sin React, Vue ni frameworks de UI.
  - Sin servidor HTTP.
  - Sin llamadas a la API de Google Drive.
  - Sin OAuth, `credentials.json` ni tokens.
  - Sin base de datos.
  - Sin libs de terceros en runtime (excepto Fuse.js).
  - `contextIsolation: true`, `nodeIntegration: false`.
  - Borrar usa `shell.trashItem`, nunca `fs.unlink`.
  - El usuario no puede navegar fuera de la carpeta raíz detectada.

## Estructura del proyecto

```
Simple_Drive/
├── electron/
│   ├── main.cjs              # proceso principal (Node.js)
│   └── preload.cjs           # bridge seguro
├── public/                   # renderer (Chromium)
│   ├── index.html
│   ├── styles.css
│   ├── app.js                # lógica UI (vanilla)
│   └── vendor/
│       └── fuse.min.js       # Fuse.js v6.4.6 (UMD)
├── renderer/
│   └── assets/tray-icon.png
├── tests/                    # suite E2E con Playwright
│   ├── e2e/                  # specs (.spec.cjs)
│   ├── helpers/              # utilidades compartidas
│   └── .runs/                # bitácora markdown de corridas
├── agents/                   # herramientas para agentes IA
│   ├── test-runner.md        # instrucciones del agente test-runner
│   ├── test-runner.cjs       # ejecutor del agente
│   ├── historian.cjs         # comparador de runs
│   ├── driveman-context.md   # este archivo
│   └── .memory/              # estado del agente (local, versionado)
├── FEATURES.md               # roadmap + checklist de tasks
├── ARCHITECTURE.md           # arquitectura detallada
├── README.md                 # guía de uso del proyecto
├── package.json
└── playwright.config.cjs     # (en tests/)
```

## Sistema de tests

- **Runner**: `@playwright/test` con API `_electron`.
- **Modo dev**: `npm run test:log` corre la suite y genera markdown en `tests/.runs/LATEST.md`.
- **Modo agente**: `npm run agent:run` corre suite + parsea log + compara runs + actualiza memoria.
- **Tests siempre limpian** sus fixtures en `os.tmpdir()`, NUNCA en el Drive real del usuario.
- **Configuración**: `tests/playwright.config.cjs` (1 worker, fullyParallel=false, trace retain-on-failure).

### Cómo agregar un test

1. Elegir el spec file existente según categoría (`smoke`, `flows`, `events`, `errors`, `visual`, `shortcuts`) o crear uno nuevo.
2. Usar el helper `launchApp({ env: { GDRIVE_ROOT: ... } })` para arrancar Electron con un directorio temporal.
3. Crear fixtures en `beforeAll`, limpiar en `afterAll`.
4. **Después de cada cambio**, correr `npm run agent:run` para validar.

## Estado actual (auto-actualizado por el agente)

> Esta sección se actualiza automáticamente con los resultados de la última corrida.
> No la edites a mano — el agente la regenera en cada `npm run agent:run`.

<!-- AGENT_STATE_START -->

**Última corrida**: 2026-07-09 02:28:40

**Resumen rápido**:
- Passed: 23 / 23
- Failed: 0
- Skipped: 0
- Duración: 53.2s
- Bugs abiertos: 0
- Status: passed

**Delta vs corrida anterior**:
- Mejoraron: 0
- Regresiones: 0
- Sin cambios: 23

_Para detalle completo ver `tests/.runs/LATEST.md` y `agents/.memory/memory.md`._

<!-- AGENT_STATE_END -->

## Cómo trabajar en este proyecto

1. **Leer primero**: `README.md`, `ARCHITECTURE.md`, este archivo.
2. **Revisar el roadmap**: `FEATURES.md` tiene las tasks pendientes y completadas.
3. **Después de cada cambio**: correr `npm run agent:run` y leer el reporte.
4. **Si un test falla**: leer `tests/.runs/LATEST.md` para contexto, después `test-results/<nombre-test>/error-context.md` para el detalle.
5. **Si la app crashea**: leer `%APPDATA%\driveman-desktop\logs\driveman-<fecha>.log` para eventos del main process.

## Comandos útiles

| Comando | Qué hace |
|---|---|
| `npm install` | Instala dependencias |
| `npm start` | Lanza la app (sin DevTools) |
| `npm run dev` | Lanza la app con DevTools |
| `npm test` | Corre suite E2E |
| `npm run test:log` | Suite + log markdown |
| `npm run agent:run` | Suite + log + análisis + memoria |
| `npm run build` | Empaqueta instalador NSIS |
| `npm run build:portable` | Empaqueta binario portable |

## Memoria del agente (local)

- `agents/.memory/memory.md` — vista legible de la última corrida.
- `agents/.memory/last-run.json` — estado estructurado.
- `agents/.memory/history.jsonl` — log append-only de todas las corridas.

Esta memoria es **local y versionada** (no usa servicios externos como Engram MCP). Se commitea con el repo, así viaja entre máquinas (oficina ↔ casa).

## Limitaciones conocidas

- **Fuse.js v6.4.6** (no v8) porque la v8 es ESM puro y no se puede cargar como `<script>` clásico sin bundler.
- **Playwright + `.exe` empaquetado**: la API `_electron` no detecta ventanas de binarios empaquetados con asar en Windows. El test funciona en modo dev pero falla con el built. Validación alternativa: lanzar manualmente y leer el log.
- **single-instance lock**: si quedó una app zombie de una corrida anterior, `app.requestSingleInstanceLock()` mata la nueva. Solución: matar electrones antes (`Get-Process electron | Stop-Process`).

## Contacto con el usuario

- Idioma: español Rioplatense (voseo) cálido y directo.
- Estilo: explicar el "por qué" antes del "cómo".
- Cuando hay error: decirlo con evidencia, no asumir.
- Cuando funciona: reportar concreto con números (totales, duraciones, deltas).