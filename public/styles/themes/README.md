# Themes

Este directorio contiene los **themes** visuales de Driveman. Cada theme define la paleta semántica (colores, surfaces, text hierarchy, semantic states) y el dark mode derivado.

## Estructura de un theme

Un theme es un archivo CSS que define tokens dentro de `@theme { }` y `.dark { }`. Los nombres de tokens están estandarizados:

| Categoría | Tokens | Uso |
|---|---|---|
| **Brand & accent** | `brand-coral`, `brand-magenta`, `brand-blue`, `brand-purple`, etc. | Reservados para product-identity (badges, product cards). NO usar en body o botones genéricos. |
| **Surface** | `canvas`, `surface`, `surface-soft`, `hairline`, `hairline-soft` | Backgrounds y bordes |
| **Text** | `ink`, `ink-strong`, `charcoal`, `slate`, `steel`, `stone`, `muted` | Jerarquía tipográfica |
| **Primary** | `primary`, `on-primary`, `primary-soft` | CTA dominante |
| **Semantic** | `success-bg`, `success-text`, `danger`, `warning` | Estados |
| **Type colors** | `type-doc`, `type-sheet`, `type-image`, `type-video`, etc. | Encoding por tipo de archivo (border-l en `.file-row`) |
| **Aliases** | `bg`, `text`, `text-secondary`, `text-muted`, `elevated`, `border`, `hover`, `active` | Compatibilidad con clases BEM/Tailwind existentes |

## Themes disponibles

- **`minimax.css`** (default) — Inspirado en el design system MiniMax. Primary negro, surfaces claras/oscuras bien diferenciadas, brand colors saturados.

## Cómo agregar un theme nuevo

1. Copiá `minimax.css` como base: `themes/mi-nuevo-theme.css`
2. Cambiá los valores de los tokens (NO los nombres, NO agregar nuevos)
3. En `styles.src.css`, cambiá el `@import` del theme:

   ```css
   @import "./styles/themes/mi-nuevo-theme.css";
   ```

4. Si querés que coexistan (ej. demo a clientes), agregá el theme con clase en `<html>`:

   ```html
   <html class="theme-mi-nuevo-theme">
   ```

   Y wrappeá el theme en `:root.theme-mi-nuevo-theme { }` en vez de `:root { }`.

## Lo que NO se cambia en un theme

- Nombres de tokens (la app los referencia directamente)
- Estructura de componentes (`components.css` no se toca)
- Tokens numéricos (`tokens.css` no se toca)
- Clases BEM o nombres del DOM (`.file-row`, `.btn`, etc.)

Un theme es **solo colores y dark mode**. Si querés cambiar espaciados o radios, eso es un cambio de tokens numéricos.
