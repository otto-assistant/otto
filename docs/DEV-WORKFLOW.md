# Otto Ecosystem — Development Workflow

Єдиний довідник для розробки, тестування та деплою двох репо: **otto** (wrapper CLI) та **bridge** (kimaki fork).

## Ecosystem Map

```
otto-assistant (GitHub org)
├── otto    (@otto-assistant/otto)     — wrapper CLI: install/upgrade/status/doctor/skills
└── bridge  (@otto-assistant/bridge)   — fork of remorses/kimaki, Discord bot + AI bridge

Local paths:
├── /data/projects/otto     — otto repo (default branch: master)
└── /data/projects/bridge   — bridge repo (default branch: main)
```

### How they relate

```
┌──────────────────────┐         ┌─────────────────────────┐
│  otto CLI             │         │  bridge (kimaki fork)    │
│  @otto-assistant/otto │         │  @otto-assistant/bridge  │
│                       │         │                          │
│  Installs + configs:  │────────►│  npm install -g          │
│  manifest.ts has      │         │  @otto-assistant/bridge  │
│  pinned versions      │         │                          │
│                       │         │  Upstream auto-sync:     │
│  otto upgrade stable  │         │  remorses/kimaki → main  │
│  pulls bridge to      │         │  every 4h via GH Action  │
│  pinned version       │         │                          │
└──────────────────────┘         └─────────────────────────┘
         │                                    │
         │  otto also manages:                │  bridge publishes to npm as
         │  - opencode.json plugins           │  @otto-assistant/bridge
         │  - agent-memory.json               │  (same CLI binary as kimaki)
         │  - otto.json                       │
         │  - skills install                  │
         ▼                                    ▼
┌─────────────────────────────────────────────────────────────┐
│  Runtime: opencode-ai (AI coding agent)                      │
│  + opencode-agent-memory plugin                              │
│  + @otto-assistant/bridge as Discord bot                     │
│  All configured by otto, running independently               │
└─────────────────────────────────────────────────────────────┘
```

## Otto — Development

### Repo structure

```
/data/projects/otto/
├── src/
│   ├── cli.ts          CLI entry (otto install/upgrade/status/doctor/skills)
│   ├── manifest.ts     Version manifest (packages, pinned, plugins)
│   ├── detect.ts       Detect installed npm packages
│   ├── config.ts       Merge opencode.json, otto.json
│   ├── installer.ts    npm global install/upgrade
│   ├── lifecycle.ts    kimaki restart + process detection
│   ├── health.ts       Health checks
│   ├── skills.ts       Skills management (parse, discover, install, cache)
│   ├── sync.ts         Upstream fork sync
│   └── index.ts        Re-exports
├── docs/
│   └── plans/          Design docs + implementation plans
├── AGENTS.md           Agent onboarding guide
└── MEMORY.md           Session memory for agents
```

### Dev cycle

```bash
# 1. Edit source
vim src/whatever.ts

# 2. Build
pnpm build              # tsc + chmod +x dist/cli.js

# 3. Test
pnpm test               # vitest run (25 tests, ~15s)

# 4. Local smoke test (without global install)
node dist/cli.js status

# 5. Global install (optional, for manual testing)
npm install -g .         # symlinks dist/cli.js → otto

# 6. Push — CI auto-publishes to npm if version bumped
git push origin master
```

### Releasing a new version

1. Bump version in **both** `package.json` and `src/manifest.ts` (`MANIFEST.version`)
2. `pnpm build && pnpm test`
3. Commit: `release: otto@X.Y.Z`
4. Push to `master` — GitHub Actions publishes to npm

### Test notes

- 6 test files, **25** tests
- `detect.test.ts` and `health.test.ts` are slow (~6s each) — they call `npm list -g`
- Tests that check kimaki binary presence are skipped on CI via env check

## Bridge — Development

### What bridge is

A fork of [remorses/kimaki](https://github.com/remorses/kimaki) published as `@otto-assistant/bridge`. The fork adds Otto-specific features while tracking upstream changes.

### Repo structure (key parts)

```
/data/projects/bridge/
├── cli/                    ← Main package: Discord bot + CLI
│   ├── src/
│   │   ├── cli.ts          CLI entry (kimaki send, etc.)
│   │   ├── discord-bot.ts  Discord event handling
│   │   ├── task-runner.ts  Scheduled task execution
│   │   ├── task-schedule.ts Scheduled task types/parsing
│   │   └── system-message.ts System message generation
│   ├── package.json        name: @otto-assistant/bridge
│   └── tsconfig.json
├── gateway-proxy/          Rust proxy (submodule)
├── discord-digital-twin/   Separate workspace package
├── .github/workflows/
│   ├── ci.yml              Tests on PR
│   ├── publish.yml         Publish to npm after merge/sync
│   └── sync-upstream.yml   Auto-merge upstream every 4h
└── AGENTS.md               Fork-specific agent guide
```

### Dev cycle

```bash
# 1. Edit source in cli/src/
vim cli/src/whatever.ts

# 2. Type-check (cli only — ignore discord-digital-twin errors)
npx tsc --noEmit 2>&1 | grep 'cli/src/' || echo "Clean"

# 3. Run tests
pnpm test --run                    # all tests in cli/
# Or with snapshot update:
pnpm test -u --run

# 4. Push feature branch + PR
git push -u origin feat/my-feature
gh pr create --title "feat: my feature" --body "..."

# 5. After merge to main → CI auto-publishes to npm
```

### Known build issues

- **`discord-digital-twin` Prisma errors**: `npx tsc --noEmit` shows errors from `../discord-digital-twin/` — these are pre-existing and unrelated to `cli/src/`. CI runs `pnpm generate` in `discord-digital-twin/` first. Locally, filter: `npx tsc --noEmit 2>&1 | grep 'cli/src/'`
- **`pnpm build`** in `cli/` triggers full monorepo tsc which includes sibling packages. Use `npx tsc --noEmit` for quick validation.
- **e2e tests** that depend on `discord-digital-twin` fail locally without Prisma generate. Unit tests pass fine.

### Otto-specific changes (vs upstream kimaki)

| Feature | Files | Branch | Status |
|---------|-------|--------|--------|
| `--silent-prompt` | cli.ts, task-runner.ts, task-schedule.ts, system-message.ts | feat/silent-prompt | Pushed, not merged |

### Upstream sync

GitHub Action `sync-upstream.yml` runs every 4 hours:
1. Fetches `remorses/kimaki` main
2. Merges into `otto-assistant/bridge` main
3. Restores `@otto-assistant/bridge` package name (upstream overwrites to `kimaki`)
4. Pushes to main
5. On conflict → creates GitHub issue with `upstream-sync` label

Manual sync:
```bash
git remote add upstream https://github.com/remorses/kimaki.git  # once
git fetch upstream main
git merge upstream/main
# Fix conflicts if any
# Restore package name if needed
git push origin main
```

## Cross-Repo Coordination

### When bridge publishes a new version

1. Bridge merges PR / upstream sync → CI publishes `@otto-assistant/bridge@X.Y.Z`
2. Update `otto/src/manifest.ts`:
   - `pinned["@otto-assistant/bridge"]` → new version
   - `packages["@otto-assistant/bridge"]` → adjust range if needed
3. `pnpm build && pnpm test` in otto
4. Release otto with updated pinned version

### Version flow

```
upstream kimaki releases 0.4.93
        │
        ▼ (auto-sync 4h)
bridge main merges upstream → CI publishes @otto-assistant/bridge@0.4.93
        │
        ▼ (manual)
otto manifest.ts: pinned["@otto-assistant/bridge"] = "0.4.93"
        │
        ▼ (otto release)
users run: otto upgrade stable → gets bridge 0.4.93
```

## Git Conventions

### Commit messages

Both repos use conventional commits:
- `feat:` — new feature
- `fix:` — bug fix
- `docs:` — documentation only
- `refactor:` — code change that neither fixes nor adds
- `release:` — version bump + publish
- `chore:` — maintenance (deps, CI, tooling)

### Branch naming

- `feat/description` — features
- `fix/description` — bug fixes
- `docs/description` — documentation

### Current WIP branches

| Repo | Branch | Description | Status |
|------|--------|-------------|--------|
| otto | `feat/skills` | Skills management module | On feat/skills, not merged to master |
| bridge | `feat/silent-prompt` | Hidden prompt for scheduled tasks | Pushed, not merged to main |
