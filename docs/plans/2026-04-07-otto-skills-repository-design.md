# Otto Skills Repository — Design Document

**Date:** 2026-04-07
**Status:** Draft
**Author:** Otto (with Serhii)

## Problem

Otto orchestrates opencode + kimaki + opencode-agent-memory. It already generates skill files (e.g., `otto-subagent-threads/SKILL.md`, `reminder-routing/SKILL.md`) but they live scattered across the filesystem without version control, discoverability, or update mechanisms.

The broader ecosystem has standardized on the [Agent Skills](https://agentskills.io) format (`SKILL.md` with YAML frontmatter), and Vercel's `npx skills` CLI (13.2k stars) provides a generic installer. However, `npx skills` doesn't know about Otto's lifecycle (kimaki restart, otto.json, Discord thread policy, memory config).

## Decision

Build a dedicated **`otto-assistant/skills`** GitHub repository + **`otto skills`** CLI commands in the otto binary. Follow the agentskills.io spec for compatibility but add Otto-specific lifecycle integration.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  GitHub: otto-assistant/skills                              │
│                                                             │
│  skills/                                                    │
│  ├── otto-subagent-threads/SKILL.md    (Discord threads)    │
│  ├── otto-reminder-routing/SKILL.md    (reminder→cal/kimaki)│
│  ├── otto-memory-management/SKILL.md   (journal/memory ops) │
│  ├── kimaki-session-lifecycle/SKILL.md (session mgmt)       │
│  ├── kimaki-tunnel-dev/SKILL.md        (dev server tunnel)  │
│  ├── kimaki-scheduled-tasks/SKILL.md   (cron/scheduled)     │
│  ├── infra-hunter-docker/SKILL.md      (Docker media stack) │
│  ├── infra-proxmox/SKILL.md            (LXC/VM management)  │
│  └── ...                                                    │
│                                                             │
│  AGENTS.md  ← instructions for agents editing this repo     │
│  README.md                                                  │
└─────────────────────────────────────────────────────────────┘
         │
         │ git clone --depth=1 (cached)
         ▼
┌─────────────────────────────────────────────────────────────┐
│  Local cache: ~/.cache/otto/skills-repo/                    │
│                                                             │
│  otto skills add <name>                                     │
│    → clone/update cache                                     │
│    → copy skill dir → ~/.config/opencode/skills/<name>/     │
│    → verify SKILL.md validity                               │
│    → if kimaki-dependent: warn about restart                │
└─────────────────────────────────────────────────────────────┘
         │
         │ OpenCode discovers at startup
         ▼
┌─────────────────────────────────────────────────────────────┐
│  ~/.config/opencode/skills/                                 │
│  ├── otto-subagent-threads/SKILL.md                         │
│  ├── otto-reminder-routing/SKILL.md                         │
│  ├── kimaki-session-lifecycle/SKILL.md                      │
│  └── infra-hunter-docker/SKILL.md                           │
└─────────────────────────────────────────────────────────────┘
```

## Skill Repository Structure

### GitHub: `otto-assistant/skills`

```
otto-assistant/skills/
├── AGENTS.md                    # Agent instructions for editing this repo
├── README.md                    # Human-readable catalog
├── skills/
│   ├── otto-subagent-threads/
│   │   └── SKILL.md
│   ├── otto-reminder-routing/
│   │   └── SKILL.md
│   ├── otto-memory-management/
│   │   └── SKILL.md
│   ├── kimaki-session-lifecycle/
│   │   └── SKILL.md
│   ├── kimaki-tunnel-dev/
│   │   └── SKILLILL.md
│   ├── kimaki-scheduled-tasks/
│   │   └── SKILL.md
│   ├── infra-hunter-docker/
│   │   └── SKILL.md
│   ├── infra-proxmox/
│   │   └── SKILL.md
│   └── ...
```

Each skill follows the [agentskills.io spec](https://agentskills.io/specification):

```yaml
---
name: otto-subagent-threads
description: Enforce visible Discord threads for every subagent spawn. Use before dispatching any subagent via kimaki send.
metadata:
  author: otto-assistant
  version: "1.0"
  category: otto-core
  requires-kimaki: "true"
---

# Skill instructions in Markdown...
```

### Otto-specific metadata extensions

We extend the agentskills.io spec with optional metadata fields that Otto understands:

| Field | Type | Description |
|-------|------|-------------|
| `category` | string | Grouping: `otto-core`, `kimaki`, `infra`, `productivity` |
| `requires-kimaki` | string | `"true"` if skill needs kimaki (triggers restart warning) |
| `requires-memory` | string | `"true"` if skill needs opencode-agent-memory plugin |

These are ignored by other agents (agentskills.io spec allows arbitrary metadata).

## CLI Design

### `otto skills list`

```bash
$ otto skills list

Installed skills:
  ✓ otto-subagent-threads    (v1.0) — Discord thread policy for subagents
  ✓ otto-reminder-routing    (v1.0) — Calendar vs kimaki task routing
  ✓ kimaki-session-lifecycle (v1.0) — Session create/read/archive

Available in otto-assistant/skills:
  • otto-memory-management    — Journal and memory block operations
  • kimaki-tunnel-dev         — Dev server tunnel management
  • kimaki-scheduled-tasks    — Cron and scheduled task management
  • infra-hunter-docker       — Hunter Docker media stack operations
  • infra-proxmox             — Proxmox LXC/VM management

Run `otto skills add <name>` to install.
```

### `otto skills add <name>`

```bash
$ otto skills add kimaki-session-lifecycle

Cloning otto-assistant/skills...
Installing kimaki-session-lifecycle → ~/.config/opencode/skills/kimaki-session-lifecycle/
⚠ This skill requires kimaki. Run `kimaki restart` to activate.
Done!
```

Options:
- `--all` — install all skills from repo
- `--force` — reinstall even if already installed (overwrite)

### `otto skills update`

```bash
$ otto skills update

Checking for updates...
  otto-subagent-threads: v1.0 → v1.1 (update available)
  otto-reminder-routing: v1.0 (up to date)

Updating otto-subagent-threads...
⚠ Changes require kimaki restart.
Done! 1 skill updated.
```

### `otto skills remove <name>`

```bash
$ otto skills remove kimaki-session-lifecycle

Removed ~/.config/opencode/skills/kimaki-session-lifecycle/
Done!
```

## Code Changes in Otto

### New files

```
src/
├── skills.ts          Skills resolver: clone/cache/update GitHub repo, install/remove
└── (existing files updated)
```

### `src/skills.ts` — Skill Resolver

```typescript
// Key functions:
export function getSkillsCacheDir(): string           // ~/.cache/otto/skills-repo/
export function ensureSkillsRepo(): string             // git clone or git pull
export function listAvailableSkills(): SkillMeta[]     // parse SKILL.md from cache
export function listInstalledSkills(): SkillMeta[]     // parse SKILL.md from opencode skills dir
export function installSkill(name: string): boolean    // copy from cache → opencode skills
export function removeSkill(name: string): boolean     // rm -rf from opencode skills
export function updateSkills(): UpdateResult           // git pull + diff versions + reinstall
export interface SkillMeta {
  name: string
  description: string
  version?: string
  category?: string
  requiresKimaki?: boolean
  requiresMemory?: boolean
  installedPath?: string
  cachedPath?: string
}
```

### `src/cli.ts` — New commands

Add `skills` as a sub-command router:

```typescript
case "skills":
  await cmdSkills(args.slice(1))
  break
```

### Integration with existing commands

- **`otto install`**: After existing steps, call `ensureSkillsRepo()` and install any missing Otto-core skills (those with `category: otto-core`)
- **`otto status`**: Show installed skills count and update status
- **`otto doctor`**: Verify skills cache + installed skills integrity

### Config tracking

Add to `~/.config/opencode/otto.json`:

```json
{
  "subagentThreads": { ... },
  "skills": {
    "repo": "https://github.com/otto-assistant/skills.git",
    "installed": ["otto-subagent-threads", "otto-reminder-routing"],
    "lastUpdate": "2026-04-07T17:00:00Z"
  }
}
```

## Initial Skills for the Repository

### Category: otto-core (auto-installed with `otto install`)

1. **otto-subagent-threads** — Discord thread policy (currently auto-generated, moves to repo)
2. **otto-reminder-routing** — Calendar vs kimaki task routing (currently in filesystem)

### Category: kimaki

3. **kimaki-session-lifecycle** — Session create, read, archive, list, search
4. **kimaki-tunnel-dev** — Dev server tunnel management (tmux + kimaki tunnel)
5. **kimaki-scheduled-tasks** — Cron scheduling, one-time tasks, task management
6. **kimaki-cross-project** — Cross-project commands, project add/list

### Category: infra

7. **infra-hunter-docker** — Docker media stack operations (qflood, rclone, prowlarr)
8. **infra-proxmox** — Proxmox LXC/VM management

### Category: productivity

9. **otto-memory-management** — Journal, memory blocks, project memory operations
10. **otto-critique-workflow** — Diff review workflow with critique

## Migration from Current State

1. **Move existing skills**: `~/.config/opencode/skills/otto-subagent-threads/SKILL.md` → `otto-assistant/skills/skills/otto-subagent-threads/SKILL.md`
2. **Move `reminder-routing`**: same
3. **Update `config.ts`**: `ensureSubagentThreadSkill()` no longer writes directly — it calls `installSkill("otto-subagent-threads")` from cache
4. **Backward compatible**: if cache is empty (offline), fall back to inline generation (current behavior)

## Edge Cases

- **Offline**: If `~/.cache/otto/skills-repo/` exists, use it. If not, fall back to inline skill generation (current behavior for `otto-subagent-threads`).
- **Custom repo URL**: `otto.json` → `skills.repo` can point to a fork or custom repo
- **Conflict with user skills**: Otto installs to `~/.config/opencode/skills/otto-*/` namespace. User skills can coexist.
- **Superpowers/kimaki skills**: Not managed by otto skills (they come from npm packages). `otto skills list` shows them as "external".

## Security

- Only clone from GitHub over HTTPS
- Verify SKILL.md frontmatter before installing (reject malformed YAML)
- Never execute scripts from skills (OpenCode handles that)
- Namespace isolation: all Otto-managed skills use `otto-`, `kimaki-`, or `infra-` prefix

## Not in Scope (YAGNI)

- Skill authoring/scaffolding (`otto skills init`) — use `npx skills init` for that
- Skill search across multiple repos — one repo is enough
- Skill version pinning — always latest from main branch
- Web UI for skills — OpenChamber already has this
