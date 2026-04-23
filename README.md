# Otto

**Otto** is a production-grade AI coding runtime that makes your agent **fast**, **reliable**, and **operator-friendly** from day one.

It combines `opencode-ai` + `@otto-assistant/bridge` + `mempalace` into one high-performance stack for Discord-driven and terminal-driven development.

Otto is built for teams that want to move fast without sacrificing control:

- **Super-fast execution**: prebuilt Docker channels, one-command tenant bootstrap, repeatable runtime.
- **Super-smart context**: persistent memory and project continuity through `mempalace`.
- **Battle-ready reliability**: stable pinning, edge channel for rapid iteration, CI-published images.
- **Zero-friction onboarding**: path-based tenant operations and clear operator runbooks.

## Why Otto

Most agent stacks fail in operations, not demos. Otto standardizes setup, runtime, and upgrades into one predictable system:

- installs and upgrades required runtime components,
- enforces consistent runtime config and safe defaults,
- supports isolated multi-tenant Docker operation,
- ships stable and edge Docker channels to GHCR,
- keeps the same operator workflow across local and production environments.

## What makes Otto powerful

Otto includes a Discord control plane on top of OpenCode, so users can operate coding sessions from chat as if they were texting the codebase.

Under the hood, the runtime supports high-impact capabilities you can use immediately:

- text and voice-driven coding requests,
- file attachments as session context (images, docs, code files),
- session lifecycle control (resume, fork, share),
- scheduled and recurring automation tasks,
- git worktree-based isolation for parallel development,
- slash commands for session/config/worktree operations,
- queue and utility controls for long-running workflows,
- team-ready permission and approval patterns,
- model and agent profile configuration,
- CI and automation entry points (`kimaki send`, task commands, upload-to-discord).

## What Otto includes

Otto orchestrates three upstream components without patching their source code:

- `opencode-ai` — coding agent runtime
- `@otto-assistant/bridge` — Discord-to-runtime control bridge
- `mempalace` — persistent memory plugin for long-lived context

## Memory that compounds

Otto does not treat sessions as disposable chats.

With `mempalace` + tenant memory layout, each tenant keeps durable context across sessions:

- project learnings and operational notes persist between runs,
- identity files (`AGENTS.md`, `soul.md`, `persona.md`) are scaffolded automatically,
- memory survives container restarts through bind mounts,
- new sessions start with history-aware context instead of a cold start.

Result: the agent gets better over time on your real codebase and team workflows.

## Release channels

Docker images are published to GHCR under:

- `ghcr.io/otto-assistant/otto:edge` (latest from `master`)
- `ghcr.io/otto-assistant/otto:stable` (latest stable tag)
- `ghcr.io/otto-assistant/otto:latest` (stable release alias)
- `ghcr.io/otto-assistant/otto:vX.Y.Z` (versioned stable tags)

## Quick start (Docker)

### 1) Pull image

```bash
docker pull ghcr.io/otto-assistant/otto:edge
```

For stable use:

```bash
docker pull ghcr.io/otto-assistant/otto:stable
```

### 2) Run container

```bash
docker run --rm -it \
  -v "$HOME/.config/opencode:/root/.config/opencode" \
  -v "$HOME/.kimaki:/root/.kimaki" \
  -v "$PWD:/workspace" \
  ghcr.io/otto-assistant/otto:edge
```

By default, image entrypoint starts `bridge`.

## Agent start and runtime setup

### Tenant-first model (recommended)

Otto is designed as **compose-per-tenant**. Each tenant has its own folder with runtime files:

- `compose.yml`
- `.env`
- `projects/` (bind mount)
- `memory/` (bind mount)

If `COMPOSE_PROJECT_NAME` is missing, Otto resolves a safe default:

- `otto-<folder_name>`

This prevents collisions when multiple tenants run on one host.

### Minimal tenant bootstrap

```bash
# create tenant runtime structure
otto tenant init /path/to/tenant-a

# configure required env before first start
$EDITOR /path/to/tenant-a/.env
# set: DISCORD_BOT_TOKEN=... and one AI provider key

# start containerized runtime
otto tenant up /path/to/tenant-a

# verify runtime and mounts
otto tenant status /path/to/tenant-a

# inspect logs
otto tenant logs /path/to/tenant-a --follow
```

If `DISCORD_BOT_TOKEN` is empty, the runtime cannot authenticate to Discord and the container may restart until the token is configured.

### How to get `DISCORD_BOT_TOKEN`

1. Open [Discord Developer Portal](https://discord.com/developers/applications).
2. Click **New Application**, name it, and create.
3. Open **Bot** tab and click **Reset Token** (or **Copy**) to get the bot token.
4. In **Bot** settings, enable **Message Content Intent**.
5. Open **OAuth2 -> URL Generator**:
   - Scopes: `bot`
   - Bot Permissions: `Send Messages`, `Read Message History`, `Add Reactions`
6. Open generated URL and add the bot to your server.
7. Put token in tenant `.env`:

```bash
DISCORD_BOT_TOKEN=your-bot-token-here
```

### Memory and identity files

Inside each tenant `memory/` Otto ensures required artifacts exist (without overwriting user content):

- `AGENTS.md`
- `soul.md`
- `persona.md`
- mempalace state

This gives every tenant isolated identity + long-lived memory continuity.

### Skills onboarding

Baseline skills are versioned and shipped with Otto release images.

```bash
otto tenant skills bootstrap /path/to/tenant-a
```

Behavior:

- installs missing baseline skills,
- keeps user-added skills intact,
- supports repeatable onboarding for new tenants.

### Required runtime env and mounts

For production-like runs, keep these mounts persistent:

- tenant `projects/` -> workspace in container
- tenant `memory/` -> memory/config state in container
- optional host-level `~/.config/opencode` and `~/.kimaki` where applicable

### Start flow for operators

1. Pull `edge` or `stable` image.
2. `otto tenant init <path>`.
3. Fill `.env` (`DISCORD_BOT_TOKEN` + one provider key).
4. `otto tenant up <path>`.
5. Validate with `otto tenant status <path>` and `otto tenant logs <path> --follow`.
6. Bootstrap baseline skills if needed.

## Quick start (CLI from source)

### Requirements

- Node.js 22+
- pnpm

### Build and install

```bash
pnpm install
pnpm build
npm install -g .
```

### Verify

```bash
otto status
otto doctor
```

## Simple onboarding flow

1. Install Otto (Docker or global CLI).
2. Run `otto install` once.
3. Confirm health with `otto doctor`.
4. Start your bridge/runtime.
5. Begin coding sessions with persistent memory enabled.

## Core commands

```bash
otto install
otto upgrade stable
otto upgrade latest
otto status
otto doctor
otto tenant init <path>
otto tenant up <path>
otto tenant down <path>
otto tenant status <path>
otto tenant logs <path> --follow
otto tenant skills bootstrap <path>
```

## Stable upgrade policy

- **Edge**: follows `master` continuously.
- **Stable**: published on git tags `vX.Y.Z`.
- Use `otto upgrade stable` for predictable pinned versions.
- Use `otto upgrade latest` for newest upstream packages.

## Production notes

- Keep `~/.config/opencode` and `~/.kimaki` persistent.
- If runtime dependencies or config changed, restart bridge.
- Use unique compose project names per tenant/environment.

## Developer workflow

```bash
pnpm build
pnpm test
```

Then push to `master` for edge Docker publish, or push `vX.Y.Z` tag for stable publish.

## Security and operational model

- no forceful mutation of upstream source packages,
- explicit version pinning for stable path,
- deterministic Docker builds for CI/CD,
- memory-enabled sessions through plugin orchestration.

## Operator docs

- `docs/PRODUCTION-QUICKSTART.md`
- `docs/PRODUCTION-RUNBOOK.md`
- `docs/RELEASE-AND-UPGRADE-POLICY.md`
- `docs/TROUBLESHOOTING.md`
- `docs/plans/2026-04-23-otto-docker-tenant-design.md`

## Project links

- Repository: https://github.com/otto-assistant/otto
- Docker image: https://github.com/otto-assistant/otto/pkgs/container/otto

---

Otto is optimized for one goal: **ship faster with AI agents, without losing control of runtime quality and memory continuity.**
