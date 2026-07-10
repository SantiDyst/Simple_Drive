# Themes

Este directorio contiene los **themes** visuales de Driveman. Cada theme define la paleta semántica (colores, surfaces, text hierarchy, semantic states) y el override del claro cuando aplica.

## Theme activo

- **`figma.css`** — Estilo Figma, sustituye al anterior `minimax.css`. Dark navy como default + cream (cálido) como alterno, ambos comparten el sistema de tokens numéricos de `tokens.css`.

## Estructura del theme

Un theme es un archivo CSS que define tokens dentro de `@theme { }` y un override opcional. Los nombres de tokens están estandarizados:

| Categoría | Tokens | Uso |
|---|---|---|
| **Brand & accent** | `brand-coral`, `brand-magenta`, `brand-blue`, `brand-purple`, etc. | Reservados para product-identity (badges, product cards). NO usar en body o botones genéricos. |
| **Surface** | `canvas`, `surface`, `surface-soft`, `hairline`, `hairline-soft` | Backgrounds y bordes |
| **Text** | `ink`, `ink-strong`, `charcoal`, `slate`, `steel`, `stone`, `muted` | Jerarquía tipográfica |
| **Primary** | `primary`, `on-primary`, `primary-soft` | CTA dominante |
| **Semantic** | `success-bg`, `success-text`, `danger`, `warning` | Estados |
| **Type colors** | `type-sensitive`, `type-binary`, `type-office`, `type-docs`, `type-media`, `type-default` | Encoding por tipo de archivo (border-l en `.file-row` / `.file-card`) |
| **Icon colors** | `icon-folder`, `icon-document`, `icon-office`, `icon-code`, `icon-image`, `icon-video`, `icon-audio`, `icon-archive`, `icon-exe` | Color del icono en cards (Figma-style: cada tipo su color) |
| **Aliases** | `bg`, `text`, `text-secondary`, `text-muted`, `elevated`, `border`, `hover`, `active` | Compatibilidad con clases BEM/Tailwind existentes |

## Cómo funciona el switching

- **Default** = dark Figma (sin clase en `<html>`)
- **Cream** = override (clase `.theme-cream` en `<html>`)
- Toggle en `app.js#initTheme` y `app.js#themeToggle.onclick` aplica la clase
- LocalStorage guarda `'dark'` o `'cream'`

## Cómo agregar un theme nuevo

1. Copiá `figma.css` como base: `themes/mi-nuevo-theme.css`
2. Modificá solo los tokens de color (palette, surfaces, text); los numéricos vienen de `../tokens.css` y son compartidos
3. En `styles.src.css`, cambiá el `@import` del theme:

   ```css
   @import "./styles/themes/mi-nuevo-theme.css";
   ```

4. Si querés que coexistan (ej. theme picker), wrappeá el theme en una clase:

   ```css
   .theme-mi-nuevo { ...tokens... }
   ```

   Y aplicá `<html class="theme-mi-nuevo">`.

## Lo que NO se cambia en un theme

- Nombres de tokens (la app los referencia directamente)
- Estructura de componentes (`components.css` no se toca)
- Tokens numéricos (`tokens.css` no se toca)
- Clases BEM o nombres del DOM (`.file-row`, `.btn`, etc.)

Un theme es **solo colores**. Si querés cambiar espaciados o radios, eso es un cambio de tokens numéricos.
