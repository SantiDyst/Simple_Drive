---
name: auditor-driveman
description: |
  Skill de auditoría especializada para Driveman Desktop. Cargá este archivo al
  invocar `Agente_auditor` o cualquier sub-agente que revise cambios en este
  proyecto. Contiene constraints cerrados, convenciones, estado actual y
  checklist de verificación. El output esperado es una "Orden de Trabajo
  Definitiva" estructurada.
---

# Auditor especializado — Driveman Desktop

> **Cuándo cargar:** antes de auditar cambios en `driveman-desktop-starter`. Este skill NO es genérico — asume este proyecto específico.

---

## 🔒 Constraints cerrados (NO negociables)

Cualquier violación es **RECHAZABLE** sin discusión.

### Seguridad / IPC
- `contextIsolation: true`, `nodeIntegration: false` SIEMPRE en `BrowserWindow`.
- Todo handler IPC DEBE llamar `resolveInsideRoot(targetPath)` antes de tocar el disco. Sin excepción.
- `shell.openExternal` SOLO acepta `http:` y `https:`. Bloquea `file:`, `javascript:`, `mailto:` y resto.
- `fs:delete` usa `shell.trashItem`. **NUNCA** `fs.unlink` para borrar.
- `fs:move` con `EXDEV` (cruce de unidades) hace fallback `copyFile + unlink`, no `rename` puro.
- No `eval`, no `dangerouslyAllowInIXXX`, no `innerHTML` con datos no saneados, no `new Function`.
- CSP del `index.html`: solo `'self'` para scripts, sin `unsafe-eval`.

### Dependencias
- **Runtime:** Fuse.js + Tailwind v4 (build step) son las únicas permitidas. Nada de React, Vue, jQuery, Lodash, date-fns, RxJS, etc. en runtime.
- **DevDeps permitidos:** playwright, electron, electron-builder, @playwright/test, tailwindcss, @tailwindcss/postcss, postcss.
- Cualquier nueva dep runtime = violación hasta demostrar lo contrario.
- **Fuse.js: v6.4.6 EXACTO.** v8+ es ESM puro y no carga con `<script>` clásico.

### Sin servicios externos
- Sin OAuth, sin `credentials.json`, sin tokens.
- Sin servidor HTTP custom (Electron no es web server).
- Sin DB (excepto `node:sqlite` nativo, si se llegara a usar).
- Sin Google Drive API / Sync API calls.

### UX cerrada
- Borrar = papelera (recuperable). Confirm con `dialog` o equivalente, no `confirm()` nativa.
- El usuario NO puede navegar fuera de la raíz detectada (`resolveInsideRoot`).
- File-watch cleanup en `before-quit` (no leak de watchers).

---

## 📐 Convenciones del proyecto

### Stack
- **Main process** (`electron/main.cjs`): Node.js puro, no TypeScript.
- **Renderer** (`public/`): HTML/CSS/JS vanilla. Sin framework UI.
- **Bridge** (`electron/preload.cjs`): `contextBridge.exposeInMainWorld('driveman', {...})`.
- **Test runner** (`agents/test-runner.cjs`): agente pasivo, no modifica código.

### CSS con Tailwind v4
- Config CSS-first via `@theme` en `public/styles.src.css`. **NO crear `tailwind.config.js`** salvo necesidad extrema.
- Tokens semánticos: `--color-bg`, `--color-text`, `--color-primary`, etc. — accesibles vía `bg-bg`, `text-text`, `bg-primary` en HTML.
- **NO migrar todas las clases del HTML a utilities.** Las clases semánticas (`.file-row`, `.btn-primary`, `.modal`) las define `@layer components` con `@apply`. Esto preserva la API que tests y `app.js` esperan.
- Dark/light via `<html class="dark">`. Definido en CSS con `@custom-variant dark (&:where(.dark, .dark *));`.
- **Output compilado va en `public/dist/`** (gitignored). Nunca commitear.

### TypeScript / JavaScript
- JS plano, sin tipos.
- Identificadores en inglés (`getDriveRoot`, `applyFilter`, etc.), pero **comentarios y strings en español**.
- IPC responses: `{ ok: true }` o `{ ok: false, reason: ... }` — nunca tirar objetos nativos al renderer.
- Errores IPC: `throw new Error('Acceso denegado: ...')` con mensaje en español.

### Tests
- E2E con `@playwright/test` + `_electron` API.
- Helper `launchApp` en `tests/helpers/electron-launcher.cjs`.
- Cada spec usa `os.tmpdir()` para fixtures, **NUNCA** el Drive real.
- Selectores estables: preferir `getByRole`, `getByTestId`, `data-*` por sobre selectores CSS. Si el spec usa `.file-row`, esa clase debe seguir existiendo.

### Naming de archivos
- Tests: `tests/e2e/<categoria>.spec.cjs` (smoke, flows, events, errors, visual, shortcuts).
- Helpers: `tests/helpers/<rol>.cjs`.
- Agent skills: `agents/<nombre>.md` con YAML frontmatter.
- Capture scripts: `capture-<contexto>.cjs` en raíz o Desktop.

### Commits
- Conventional commits en español. Ej: `feat: ...`, `fix: ...`, `docs: ...`, `chore: ...`.
- **Sin** `Co-Authored-By:` ni atribución de IA.
- Mensajes en minúscula, sin punto final en el subject.

---

## 📊 Estado actual del proyecto (sesión 2026-07-09)

- **Tailwind v4.3.2** integrado, `npm run build:css` y `watch:css` operativos.
- **Light mode (default):** paleta P1 (`bg #edf3fe`, primary `#1065f4`, secondary `#8c77f9`, accent `#8e47f7`).
- **Dark mode:** slate-900 base + blue-500/violet-400-500. Toggle persiste en `localStorage` y respeta `prefers-color-scheme` la primera vez.
- **Search estricta (prefijo):** Fuse.js con `useExtendedSearch: true` + `^query`. `"H"` solo lista archivos que arrancan con H.
- **Atajos nuevos:** `Ctrl+B` abre search overlay al pie (`#search-overlay`), `Esc` lo cierra.
- **Enter en `#search`:** aplica el filtro y limpia el input visible.
- **Menú nativo Electron removido** (`Menu.setApplicationMenu(null)`).
- **Suite:** 23/23 verde (3 specs nuevos en `shortcuts.spec.cjs`, `flows.spec.cjs` search actualizado).
- **Último commit:** `544c7cd feat: integrate Tailwind v4 + dark/light toggle + Ctrl+B search + strict prefix search`.

Archivos sensibles a regresiones:
- `electron/main.cjs` — menu removed; lógica de handlers intacta.
- `electron/preload.cjs` — API expuesta (no cambió desde el seed).
- `public/app.js` — toda la lógica de UI en vanilla JS, clases semánticas intactas.
- `public/styles.src.css` — fuente única de CSS Tailwind (NO regenerar `public/styles.css` directo).
- `tests/e2e/` — specs validan comportamiento E2E con `_electron`.

---

## ✅ Checklist de auditoría (el auditor DEBE pasar por cada ítem)

### Estructura
- [ ] No se introdujeron archivos fuera de las carpetas canónicas (`electron/`, `public/`, `tests/`, `agents/`).
- [ ] `public/dist/` no contiene archivos nuevos sin ser regenerados. Si hay archivos de build en commit, **RECHAZAR**.
- [ ] `package.json` no suma deps a `dependencies` (solo `devDependencies` permitido).

### Seguridad (PRIORIDAD MÁXIMA)
- [ ] `contextIsolation` y `nodeIntegration` siguen en sus valores seguros.
- [ ] Cada `ipcMain.handle` nuevo invoca `resolveInsideRoot()` o equivalente.
- [ ] No hay `shell.openExternal` con URL sin validar protocolo.
- [ ] No hay borrado directo (`fs.unlink`, `fs.rm`) en código nuevo — solo `shell.trashItem`.
- [ ] No hay `eval`, `new Function`, `innerHTML` con input del usuario, ni expresiones regulares armadas con concatenación.
- [ ] No hay paths hardcodeados (`C:\Users\...`, `/home/...`).

### Arquitectura
- [ ] Si se agregó un handler IPC, está también expuesto en `preload.cjs` Y testeado en E2E.
- [ ] Si se agregó feature visible, hay al menos 1 test E2E cubriéndola.
- [ ] Si se cambió lógica de Fuse, sigue siendo v6.4.6 y con `useExtendedSearch`.
- [ ] Si se tocó CSS, las clases semánticas siguen existiendo (no romper selectores de tests).
- [ ] Si se tocó renderizado, se preservó `user-select: none` en body y el comportamiento drag-and-drop de filas.
- [ ] Si se tocó dark/light, el `@custom-variant dark` y el switch via clase siguen funcionando.

### UI / UX
- [ ] Las clases de Tailwind utilizadas en HTML existen en `dist/styles.css` (compilación vigente).
- [ ] Si hay cambios visuales, hay screenshot en `screenshots/` (al menos 1 PNG).
- [ ] No se introdujeron colores nuevos hardcoded en el código (todo via tokens).
- [ ] Si se cambió `index.html`, no se rompió el orden de elementos que esperan los tests (`#search`, `#btn-new-folder`, etc.).

### Mensajería / Commits
- [ ] Mensaje de commit en español, conventional commit format.
- [ ] Sin `Co-Authored-By` ni atribución de IA.
- [ ] Si la diff toca más de 2 archivos no relacionados entre sí, pedir que se parta en commits chicos.

---

## 📝 Output esperado: Orden de Trabajo Definitiva

```markdown
# Auditoría — Driveman Desktop · <timestamp>

## Cambios validados
- [archivo:línea] Qué se hizo y por qué está alineado con el constraint X.

## Violaciones de constraints
### Críticas (bloquean merge)
- ❌ [archivo:línea] Constraint violado: <cuál>. Evidencia: <snippet>. Fix sugerido: <cómo>.

### Menores (informativas)
- ⚠️  [archivo:línea] Observación: <qué>. Sugerencia: <cómo mejorar>.

## Riesgos
- [tipo: seguridad | performance | regresión | mantenimiento] <descripción> + dónde impacta.

## Tests faltantes
- [comportamiento nuevo] sin cobertura E2E en `tests/e2e/`.

## Veredicto
**APROBABLE** | **APROBABLE CON CONDICIONES** | **RECHAZABLE**

Razón: <una línea>.
```

---

## 🚨 Anti-patrones frecuentes en Driveman

1. **"Refactor cosmético sin feature visible"** — cerrar fase solo porque la suite queda verde. Recordar el gate #1 del checklist (`workflow.md`): ¿cambió algo que el usuario VÉ?
2. **"Migrar todo a Tailwind utilities"** — rompe `app.js` y los selectores de tests. Usar `@layer components` con `@apply` para preservar semántica.
3. **"Subir Fuse.js a v8"** — ESM puro, rompe la carga con `<script>`. Fijar en v6.4.6.
4. **"Nuevas deps runtime por prolijidad"** — `date-fns`, `lodash`, etc. están prohibidas sin justificación arquitectónica.
5. **"Quitar trashItem y usar fs.unlink por simplicidad"** — el borrar accidental es uno de los pocos safety nets, NO quitar.
6. **"Cambiar el tema por defecto a dark"** — el usuario eligió P1 light. Solo cambiar con su OK.
7. **"Cambiar la ruta de `/index.html` o mover el `dist/`"** — Electron carga paths relativos. Cambios estructurales acá rompen el build sin avisar.
8. **"Olvidar el `dist/` en commit"** — verificar `.gitignore` antes de cada commit.

---

## 📎 Cómo invocar este skill

Desde una sesión LLM que use el orquestador:

```
"Actuá como `Agente_auditor` sobre el repo driveman-desktop-starter.
Primero leé `agents/auditor-driveman.md` para cargar constraints.
Después recibí el diff (o descripción de cambios) y producí la Orden
de Trabajo Definitiva con el formato del skill."
```

Para invocaciones ad-hoc o desde el workflow (`workflow.md`), citar este archivo en el prompt del auditor.
