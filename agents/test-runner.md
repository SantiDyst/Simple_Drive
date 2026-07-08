# Test Runner Agent — Driveman

Agente pasivo que ejecuta la suite E2E, observa el log en markdown, y reporta el estado actual. NO modifica código, NO toca git.

## Cuándo se invoca

- Manualmente: `npm run agent:run`.
- Programáticamente desde otras herramientas de IA.

## Antes de actuar

Leer `agents/driveman-context.md` para entender el proyecto. Esa skill contiene arquitectura, convenciones, comandos y estructura.

## Lo que hace

1. Limpia procesos electron zombie.
2. Corre `npm run test:log` (suite + log en markdown).
3. Lee `tests/.runs/LATEST.md` y los últimos 5 runs históricos.
4. Compara con la corrida anterior y calcula:
   - Tests que mejoraron (de fall/skip a pass).
   - Tests que empeoraron (de pass a fail/skip).
   - Regresiones nuevas (test que fallaba antes y sigue fallando, o que empeoró).
5. Persiste el resumen en memoria local (`agents/.memory/`).
6. Imprime un reporte final en consola.

## Lo que NO hace

- No modifica código fuente.
- No corre comandos git.
- No abre issues ni PRs.
- No aplica fixes automáticamente.
- No borra archivos de tests/.

## Output esperado en consola

```
[agent] corrida: 20/20 pass, 0 fail, 0 skip (60s)
[agent] bugs conocidos: 0 abiertos
[agent] delta vs corrida anterior: sin cambios
[agent] regresiones: 0 | mejoras: 0
[agent] memoria: guardada en agents/.memory/memory.md
```

## Memoria del agente

Cada ejecución guarda estado en `agents/.memory/`:

- `memory.md` — vista legible por humanos/IA con la última corrida.
- `last-run.json` — estado estructurado de la última corrida.
- `history.jsonl` — log append-only de todas las corridas (una línea JSON por corrida).

Estos archivos le permiten a un agente de IA (como yo) reconstruir el historial entre sesiones sin necesidad de un servicio externo. Cuando preguntes "¿cómo viene la suite?", puedo leer `agents/.memory/memory.md` para responderte sin reejecutar nada.

El agente **NO** usa Engram directamente porque ese servicio es un MCP server con su propio protocolo. La memoria local es más simple, versionable y suficiente para este proyecto.

## Estructura de archivos

```
agents/
├── test-runner.md       ← este archivo (instrucciones)
├── test-runner.cjs      ← ejecutor principal
├── historian.cjs        ← comparador de runs
├── driveman-context.md  ← skill con contexto del proyecto (cargar antes de actuar)
└── .memory/             ← estado del agente (versionado)
    ├── memory.md
    ├── last-run.json
    └── history.jsonl
```

## Contrato con el log

El agente consume `tests/.runs/LATEST.md` producido por `run-logger.cjs`. Si el log no existe o está corrupto, el agente aborta con código 2 y mensaje claro.

## Límites

- **Memoria histórica**: mantiene los últimos 20 runs locales, los demás se purgan.
- **Tamaño del reporte**: máximo 80 líneas en consola para no inundar.
- **Frecuencia mínima**: 30 segundos entre corridas (rate limit para evitar loops).