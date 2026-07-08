# Arquitectura

Este documento explica **por qué** Driveman está armado como está. El README describe _qué_ hace; este archivo describe _por qué se decidió así_.

## El problema de base

Driveman es una aplicación Electron. Electron, internamente, es un navegador web (Chromium) embebido. Eso significa que la **ventana que vos ves** (el "renderer") no es más que HTML + CSS + JavaScript ejecutándose dentro de un navegador.

Y acá está la trampa: si esa ventana tuviera acceso directo al sistema operativo, **cualquier código cargado en ella podría hacer cualquier cosa**. Imaginate:

- Un archivo HTML malicioso que se cuela y borra tu disco.
- Un script externo (inyectado por una vulnerabilidad de Chromium) que lee tus archivos personales.
- Una librería de terceros comprometida que instala malware.

Un navegador web tradicional evita esto ejecutando cada pestaña en un **sandbox** (un entorno restringido). Electron hereda esa idea, pero como nosotros _queremos_ hacer cosas con el disco (listar, mover, borrar archivos), necesitamos un modelo un poco más explícito.

## El modelo de dos procesos

Electron propone dividir la app en **dos mundos** con permisos muy distintos:

| Proceso | Quién es | Qué puede hacer | Qué NO puede hacer |
|---|---|---|---|
| **Main** (`electron/main.cjs`) | El "portero". Se ejecuta en Node.js puro. | Acceder al sistema de archivos, lanzar procesos, manejar ventanas, registrar ícono de bandeja, etc. | Mostrar UI directamente. |
| **Renderer** (`public/`) | La "cara" de la app. Es la ventana que ves. | Mostrar HTML, ejecutar JS del frontend, responder a clics. | Tocar el disco, abrir archivos del sistema, leer variables de entorno. |

**El renderer nunca toca el disco directamente.** Si necesita hacerlo, **se lo pide al main** mediante un canal controlado llamado IPC (Inter-Process Communication).

## ¿Por qué hay "una API de por medio"?

Esa "API de por medio" es justamente el IPC + el bridge de `contextBridge`. Su trabajo no es técnico, es de **seguridad**:

### 1. Aislar el renderer

Cuando abrís la app, el renderer carga `public/index.html` con:

- `contextIsolation: true`
- `nodeIntegration: false`

Eso significa que **el JavaScript de la ventana no tiene acceso a `require`, a `fs`, ni a nada de Node.js**. Solo puede llamar a las funciones que el main expone explícitamente.

En `electron/preload.cjs` definimos qué funciones quedan disponibles:

```js
contextBridge.exposeInMainWorld('driveman', {
  fs: {
    listDir: (dirPath) => ipcRenderer.invoke('fs:list-dir', dirPath),
    move: (src, dst) => ipcRenderer.invoke('fs:move', src, dst),
    delete: (filePath) => ipcRenderer.invoke('fs:delete', filePath),
    // ...
  }
});
```

Eso es **todo** lo que el frontend puede hacer con el disco. Nada más. Si alguien intenta llamar a `window.driveman.fs.ejecutarComandoArbitrario()`, simplemente no existe.

### 2. Validar cada pedido

Cada `ipcMain.handle(...)` en el main es una **puerta vigilada**. Antes de tocar el filesystem, valida que la ruta pedida esté adentro de la raíz permitida:

```js
function resolveInsideRoot(targetPath) {
  const root = detectDriveRoot();
  const normalizedRoot = path.resolve(root);
  const normalizedTarget = path.resolve(targetPath);
  if (normalizedTarget.startsWith(normalizedRoot + path.sep)) return normalizedTarget;
  return null;  // rechazo silencioso
}
```

Esto bloquea ataques de **path traversal** (ej.: pedir `..\..\Windows\System32`) y también limita el daño si alguien encuentra un bug en el frontend: como mucho puede tocar archivos _dentro_ de la carpeta de Drive, nada más.

### 3. Forzar decisiones de seguridad

La capa intermedia nos permite tomar decisiones que un acceso directo no nos dejaría:

- **Borrar = papelera.** El handler `fs:delete` usa `shell.trashItem()`. Nunca `fs.unlink()`. Si alguien (usuario o atacante) borra algo por error, se puede recuperar.
- **Abrir URLs externas = solo `http:` y `https:`.** El handler `shell:open-external` rechaza cualquier otro protocolo. Imposible lanzar `file://` maliciosos o ejecutar `mailto:` con payloads raros.
- **Mover entre unidades = fallback seguro.** Si `fs.rename` falla con `EXDEV` (cruce de unidades), el main hace `copyFile + unlink` en vez de dejar archivos huérfanos.

## ¿Y los eventos?

No todo es pedido/respuesta. Cuando algo cambia en la carpeta que estás mirando (Google Drive Desktop sincroniza un archivo nuevo, vos movés algo desde afuera, etc.), el main usa `fs.watch` para **escuchar el filesystem**. Cuando detecta un cambio, manda un evento al renderer:

```js
fs.watch(dirPath, { persistent: false }, (eventType, filename) => {
  mainWindow.webContents.send('fs:changed', { eventType, filename, dir: dirPath });
});
```

El renderer se entera y refresca la lista. **No hay polling, no hay recarga manual.** El sistema operativo avisa.

Resumen rápido:

| Mecanismo | Dirección | Cuándo se usa |
|---|---|---|
| **API (request/response)** | Renderer → Main | Cuando vos hacés algo: listar, mover, borrar, crear carpeta. |
| **Eventos (`fs:changed`)** | Main → Renderer | Cuando _algo cambia_ afuera y la UI necesita enterarse. |

## ¿Por qué no comunicación "nativa directa" con Windows?

Porque en Electron **no existe tal cosa**. El renderer es un navegador, no una app Win32. El "nativo" para el renderer es el navegador mismo: HTML, CSS, JS, eventos DOM. Todo lo que toca el sistema operativo pasa por el main.

Y eso es **justamente lo que queremos**. Sin esa división:

- Cualquier script cargado en la UI podría leer tu disco entero.
- No habría dónde validar rutas ni权限.
- No habría dónde centralizar logs, errores ni auditoría.
- Borrar accidentalmente no se podría recuperar.

## La metáfora del portero

Imaginátelo así:

- **El renderer** es un visitante en la puerta de un edificio. Puede tocar el timbre y pedir cosas, pero no entra.
- **El main** es el portero. Tiene la llave del edificio. Antes de abrir, mira quién sos, qué pedís, y si tiene sentido.
- **El bridge (`window.driveman`)** es el timbre. Es la única forma que tiene el visitante de comunicarse con el portero.
- **Cada `ipcMain.handle`** es una regla del portero: "Si me piden esto, hago esto otro. Si me piden cualquier otra cosa, ni me molesto en contestar."

Esa estructura no es un capricho de Electron. Es la **forma estándar** de construir apps de escritorio seguras hoy en día. Driveman la aplica al pie de la letra, y por eso puede correr HTML/CSS/JS "inocente" en el frontend sin poner en riesgo tu máquina.

## Referencias en el código

- Separación de procesos y window options: `electron/main.cjs` (función `createWindow`)
- Bridge expuesto: `electron/preload.cjs`
- Handlers IPC: `electron/main.cjs` (todos los `ipcMain.handle`)
- Validación de rutas: `electron/main.cjs` (`resolveInsideRoot`)
- Watcher de eventos: `electron/main.cjs` (`startWatching`)