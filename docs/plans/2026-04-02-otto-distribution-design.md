# Otto — Terminal UI Distribution: Design Document

**Date:** 2026-04-02
**Status:** Draft (pending approval)

---

## 1. Problem

OpenCode + Kimaki + opencode-agent-memory — три окремі npm-пакети, кожен зі своїм lifecycle, конфігурацією та точками інтеграції. Користувачу треба:

1. Встановити 3 пакети глобально через npm
2. Налаштувати `~/.config/opencode/opencode.json` (додати `opencode-agent-memory` у `plugin`)
3. Налаштувати `~/.config/opencode/agent-memory.json` (journal, tags)
4. Після будь-яких змін — `kimaki restart`
5. Знати, які версії сумісні між собою

Все це — ручна робота з ризиком помилок.

## 2. Solution

**Otto** — CLI-дистрибутив (terminal UI), який:

- Встановлює/оновлює upstream пакети через npm (БЕЗ зміни їхнього коду)
- Оркеструє конфігурацію їхньої взаємодії
- Додає власні корисні обгортки/фічі поверх
- Валідує "health" інтеграції

### 2.1 Naming Strategy

| Що | Ім'я в npm | Ім'я в otto CLI |
|----|-----------|-----------------|
| AI coding agent | `opencode-ai` | opencode (upstream) |
| Discord bridge | `kimaki` | kimaki (upstream) |
| Memory plugin | `opencode-agent-memory` | memory plugin (upstream) |
| **Дистрибутив** | `otto` | `otto` |

Upstream package identity **не змінюється** — npm оновлення працюють штатно.

## 3. Commands

### 3.1 `otto install` — Conservative Install

```
$ otto install
```

**Поведінка: conservative** — не чіпає існуючі установки.

1. Перевіряє наявність `node`/`npm` (мінімальні версії)
2. Для кожного upstream пакета:
   - **немає** → встановлює версію з маніфесту дистрибутива
   - **є** → залишає як є (ніхто не піднімає версію)
3. Налаштовує конфігурацію:
   - Читає `~/.config/opencode/opencode.json`
   - Якщо `opencode-agent-memory` немає в `plugin[]` → додає (merge, не overwrite)
   - Якщо `~/.config/opencode/agent-memory.json` не існує → створює з дефолтними journal tags
4. Якщо були зміни конфіга → `kimaki restart`
5. Показує summary: що встановлено, які версії, статус health

**Що НЕ робить:**
- Не оновлює вже встановлені пакети
- Не перезаписує `opencode.json` повністю (тільки merge `plugin` array)
- Не чіпає `~/.kimaki/opencode-config.json` (kimaki керує ним сам)

### 3.2 `otto upgrade` — Explicit Upgrade

```
$ otto upgrade           # = otto upgrade stable
$ otto upgrade stable    # версії з маніфесту дистрибутива
$ otto upgrade latest    # npm latest
```

**Поведінка: explicit + backup.**

1. Показує план: "що буде оновлено і до яких версій"
2. Запитує підтвердження
3. Робить бекап конфігів (`opencode.json`, `agent-memory.json`)
4. Оновлює пакети:
   - `stable`: `npm install -g opencode-ai@<version> kimaki@<version>` (версії з otto manifest)
   - `latest`: `npm install -g opencode-ai@latest kimaki@latest`
5. Перевіряє, що `opencode-agent-memory` підтягується opencode як plugin
6. `kimaki restart`
7. Health check

### 3.3 `otto status`

```
$ otto status
```

Показує:
- Версії всіх 3 пакетів (встановлена vs manifest vs latest)
- Статус конфігурації (`opencode.json` plugin list, journal config)
- kimaki running/not running
- Health: green/yellow/red

### 3.4 `otto doctor`

```
$ otto doctor
```

Валідує:
- node/npm версії
- Всі 3 пакети присутні та доступні
- `opencode.json` містить `opencode-agent-memory` в plugin[]
- `agent-memory.json` валідний
- kimaki process alive
- Memory directories існують (`~/.config/opencode/memory/`, `.opencode/memory/`)
- Journal directory існує
- Permissions: external_directory правила для opencode/kimaki dirs

## 4. Version Manifest

Файл `src/manifest.ts` (або `manifest.json`):

```typescript
export const MANIFEST = {
  version: "0.0.1",  // otto's own version
  packages: {
    "opencode-ai": ">=1.0.115",
    "kimaki": ">=0.4.0",
    "opencode-agent-memory": ">=0.2.0",
  },
  // pinned versions for `otto upgrade stable`
  pinned: {
    "opencode-ai": "1.2.20",
    "kimaki": "0.4.90",
    "opencode-agent-memory": "0.2.0",
  },
}
```

## 5. Config Orchestration

### 5.1 Priority Chain (from kimaki source)

```
kimaki opencode-config.json (server-level, generated)
    ↓ loaded first
~/.config/opencode/opencode.json (user global)
    ↓ overrides kimaki defaults
<project>/.opencode/opencode.json (project-level)
    ↓ final override
```

Otto оперує **тільки** на рівні `~/.config/opencode/opencode.json` (user global).

### 5.2 Merge Strategy for `opencode.json`

```typescript
function mergePluginConfig(existing: object, pluginToAdd: string): object {
  const plugins = existing.plugin ?? []
  if (plugins.includes(pluginToAdd)) return existing // already present
  return { ...existing, plugin: [...plugins, pluginToAdd] }
}
```

**Idempotent:** повторний `otto install` не дублює plugin entry.

### 5.3 Agent Memory Config

Default `~/.config/opencode/agent-memory.json`:

```json
{
  "journal": {
    "enabled": true,
    "tags": [
      { "name": "infra", "description": "Infrastructure changes" },
      { "name": "debugging", "description": "Bug investigations" },
      { "name": "decision", "description": "Architecture decisions" },
      { "name": "incident", "description": "Service failures" },
      { "name": "automation", "description": "Agent workflows" }
    ]
  }
}
```

Created only if missing. Never overwritten.

## 6. Lifecycle

```
otto install
    ↓
install missing packages (npm -g)
    ↓
merge opencode.json plugin[]
    ↓
create agent-memory.json if missing
    ↓
kimaki restart (if config changed)
    ↓
health check → status summary
```

Critical rule (from opencode-cursor AGENTS.md):
> kimaki restart — обов'язково! Kimaki спавнить свій opencode-процес, який завантажує плагін при старті. Node.js кешує import/require, тому без перезапуску працює стара версія.

## 7. Future (not in v0.0.1)

- Docker mode (optional, for maximum isolation)
- `otto config` — interactive TUI for editing configs
- `otto plugin add <name>` — add custom opencode plugins
- Auto-detect new compatible versions on `otto status`
- Backup/restore of memory blocks
- Multi-environment profiles (dev/prod)
