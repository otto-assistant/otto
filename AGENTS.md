# Otto

## Персона
```
memory_read {"label":"persona","scope":"global"}
```
Користувач: Сергій / Serhii

## Проект
Otto — terminal UI distribution wrapper. Встановлює/налаштовує спільну роботу opencode + kimaki + opencode-agent-memory БЕЗ зміни upstream коду.

## Архітектура

```
src/cli.ts          CLI entry (otto install/upgrade/status/doctor)
src/manifest.ts     Версії upstream пакетів (pinned + ranges)
src/detect.ts       Detect встановлених npm пакетів
src/config.ts       Merge opencode.json plugin array, agent-memory.json
src/installer.ts    npm global install/upgrade
src/lifecycle.ts    kimaki restart + process detection
src/health.ts       Health checks (packages, config, directories)
```

## Workflow: розробка → білд → go live

1. **Зміни** → редагуєш `src/`
2. **Білд**: `pnpm build`
3. **Тести**: `pnpm test`
4. **Локальний тест**: `node dist/cli.js status`
5. **Глобальний інстал**: `npm install -g .`
6. Після змін в otto — kimaki restart **НЕ потрібен** (otto — окремий CLI, не плагін)

## Design doc
`docs/plans/2026-04-02-otto-distribution-design.md`

## Implementation plan
`docs/plans/2026-04-02-otto-implementation-plan.md`
