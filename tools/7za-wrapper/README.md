# 7za-wrapper

Wrapper para `7za.exe` que traduce `-snld` → `-snl-` automáticamente.

## Por qué

`electron-builder` (vía `app-builder.exe`) llama a `7za.exe` con el flag `-snld`
para extraer `winCodeSign-2.6.0.7z`. Ese flag intenta crear **symbolic links** durante
la extracción, y los archivos de darwin dentro de `winCodeSign` incluyen symlinks.

En entornos Windows **sin privilegios de administrador**, 7zip falla con:

```
ERROR: Cannot create symbolic link : El cliente no dispone de un privilegio requerido.
```

## Solución

`-snl-` extrae los symlinks como archivos planos en vez de symlinks. Como
`app-builder.exe` tiene `-snld` hardcoded y no podemos modificar el binario,
este wrapper se interpone:

1. `7za.exe` (en `node_modules/7zip-bin/win/x64/`) es un binario SEA (Single Executable
   Application) de Node 22 que ejecuta `wrapper.js`.
2. `wrapper.js` toma los argumentos, traduce `-snld` → `-snl-`, y los pasa al binario
   real `7za-bin.exe`.
3. `7za-bin.exe` es el `7za.exe` original de `7zip-bin` sin modificar.

## Cómo se compiló

```bash
node --experimental-sea-config sea-config.json
cp "C:\Program Files\nodejs\node.exe" 7za-wrapper.exe
npx postject 7za-wrapper.exe NODE_SEA_BLOB 7za.exe \
  --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2 --overwrite
```

## Instalación

Reemplazar en el proyecto destino:

```
node_modules/7zip-bin/win/x64/7za.exe     <- este wrapper
node_modules/7zip-bin/win/x64/7za-bin.exe <- binario 7za original
```

## Limitaciones

- El wrapper es ~91 MB (binario Node + SEA blob). Inflación del repo.
- Solo aplica a Windows x64. Para otras plataformas, no es necesario.
- Si en el futuro `electron-builder` cambia el flag `-snld` por otro, ajustar `wrapper.js`.