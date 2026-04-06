# Otto AI Organization — Design Document

**Date:** 2026-04-06
**Status:** Approved
**Author:** Otto (agent) + Serhii

## Overview

Створення GitHub організації `otto-ai` як мультисервісної архітектури для дистрибутива Otto. Upstream-пакети форкаються, кастомізуються (брендинг + фічі) і автоматично синхронізуються з батьківськими репо.

## Motivation

- **Кастомний брендинг** — ім'я, повідомлення, кольори, theme
- **Свої фічі** — функціонал, який upstream не прийме (otto-specific інтеграція)
- **Контроль релізів** — версії, які Otto дистрибутив доставляє користувачам
- **Масштабованість** — нові форки додаються за тим самим паттерном

## Decisions

### D1: Org Structure — Separate Forks in GitHub Org

```
github.com/otto-ai/
├── otto          ← distro CLI (transfer from SerhiiD/otto)
├── bridge        ← fork of remorses/kimaki (repo name only rename)
└── (future)      ← additional forks as needed
```

**Rationale:** Кожен форк — окремий репо зі своїм CI, issues, PRs. Легко додати новий. На відміну від monorepo з submodules — простіше публікувати npm packages і керувати lifecycle.

### D2: Naming — Repo Rename Only (no internal rebrand)

| Level | Upstream | Otto Fork |
|-------|----------|-----------|
| GitHub repo | `remorses/kimaki` | `otto-ai/bridge` |
| npm package | `kimaki` | `@otto-ai/bridge` |
| CLI binary | `kimaki` | `kimaki` (unchanged) |
| Internal code | `kimaki` everywhere | `kimaki` everywhere (unchanged) |

**Rationale:** Повне перейменування всередині коду (CLI binary, env vars, logging, configs) створить конфлікти при КОЖНОМУ auto-merge з upstream. Repo name + npm scope — достатньо для брендингу без ризику.

### D3: Auto-Sync — GitHub Actions сron-based merge

**Workflow:** `sync-upstream.yml` in each fork repo.

- **Trigger:** кожні 4 години (cron) + ручний `workflow_dispatch`
- **Action:** `git merge upstream/main --no-edit` → `git push`
- **On conflict:** створює GitHub Issue з тегами `upstream-sync`, `conflict`
- **On success:** тихо пушить в main

**Rationale:** Повністю автоматична синхронізація. Конфлікти — edge case, обробляються через Issue-driven workflow.

### D4: Extension Points — Isolated Custom Code

Щоб мінімізувати конфлікти при auto-merge, всі кастомізації живуть в окремій папці:

```
otto-ai/bridge/
├── src/
│   ├── (upstream code — untouched)
│   └── otto/                    ← OUR folder
│       ├── index.ts             ← extension registration
│       ├── branding/
│       │   ├── name.ts          ← "Otto" branding overrides
│       │   ├── colors.ts        ← custom theme
│       │   └── messages.ts      ← custom messages
│       └── features/
│           └── (custom features)
├── otto.patch.ts                ← minimal entry point patch (1-2 lines)
└── .github/workflows/
    └── sync-upstream.yml
```

**The only upstream file modified:** entry point (e.g., `src/index.ts`) — додається один `import "./otto/index.js"` в кінці.

**Rationale:** Upstream rarely changes the last line of entry point → nearly zero merge conflicts.

### D5: Otto CLI Manifest Update

```ts
// src/manifest.ts — updated package sources
export const MANIFEST = {
  version: "0.1.0",
  packages: {
    "opencode-ai": ">=1.0.115",        // upstream, not forked
    "@otto-ai/bridge": ">=0.5.0",      // OUR fork (scoped)
  },
  pinned: {
    "opencode-ai": "1.2.20",
    "@otto-ai/bridge": "0.5.0",
  },
  plugins: ["opencode-agent-memory"],
}
```

New commands:
- `otto sync` — trigger sync across all fork repos via GitHub API
- `otto org` — show status of all repos in otto-ai org

## Architecture Diagram

```
┌─────────────────────────────────────────────────┐
│                 GitHub: otto-ai                  │
│                                                  │
│  ┌──────────┐  ┌──────────────┐  ┌───────────┐  │
│  │   otto   │  │ bridge (fork)│  │  (future) │  │
│  │  distro  │  │              │  │  forks    │  │
│  │   CLI    │  │ src/ (upstr) │  │           │  │
│  │          │  │ src/otto/ ←──│──│─ extensions│  │
│  │manifest  │  │  (our code)  │  │           │  │
│  │install   │  │              │  │           │  │
│  │upgrade   │  │ Actions:     │  │ Actions:  │  │
│  │status    │  │ sync-upstream│  │ sync-...  │  │
│  │doctor    │  └──────┬───────┘  └─────┬─────┘  │
│  │sync NEW  │         │                │        │
│  └────┬─────┘         │                │        │
│       │               │                │        │
└───────┼───────────────┼────────────────┼────────┘
        │               │                │
        ▼               ▼                ▼
   npm publish     npm publish      npm publish
   otto@0.1.0   @otto-ai/bridge  @otto-ai/...
        │               │                │
        └───────────────┼────────────────┘
                        ▼
                    User installs:
                  npm install -g otto
                    otto install
```

## Auto-Sync Workflow Detail

```yaml
name: Sync Upstream
on:
  schedule:
    - cron: '0 */4 * * *'
  workflow_dispatch:

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          ref: main
          fetch-depth: 0

      - name: Add upstream remote
        run: |
          git remote add upstream https://github.com/remorses/kimaki.git
          git fetch upstream

      - name: Merge upstream/main
        run: |
          git config user.name "otto-bot"
          git config user.email "bot@otto-ai.dev"
          git merge upstream/main --no-edit

      - name: Push if success
        run: git push origin main

      - name: Create issue on conflict
        if: failure()
        uses: actions/github-script@v7
        with:
          script: |
            github.rest.issues.create({
              owner: context.repo.owner,
              repo: context.repo.repo,
              title: '⚠️ Upstream sync conflict',
              body: 'Auto-merge from upstream failed. Manual resolution needed.',
              labels: ['upstream-sync', 'conflict']
            })
```

## Alternatives Considered

### Monorepo with git submodules
- ✅ One repo, one CI
- ❌ Submodules are painful for npm packages
- ❌ Harder to publish individual packages
- ❌ Less flexible for multiple contributors

### Direct patch-based fork
- ✅ Simplest start
- ❌ Conflicts on every upstream change touching modified files
- ❌ Hard to track what's ours vs upstream

## Open Questions (for implementation phase)

1. **npm publishing strategy:** publish `@otto-ai/bridge` from fork CI, or keep using `kimaki` name?
2. **Branch strategy:** upstream sync into `main`, our features in `otto` branch, or everything in `main`?
3. **CI/CD for fork:** build + test + publish pipeline in fork repo?
4. **GitHub org permissions:** who has admin access? bot account for auto-merge?

## Success Criteria

- [ ] GitHub org `otto-ai` created
- [ ] `SerhiiD/otto` transferred to `otto-ai/otto`
- [ ] `remorses/kimaki` forked to `otto-ai/bridge`
- [ ] Auto-sync workflow runs every 4 hours, merges without conflicts
- [ ] Extension point infrastructure in fork (src/otto/ folder)
- [ ] Otto CLI manifest updated to use `@otto-ai/bridge`
- [ ] `otto install` works with forked package
