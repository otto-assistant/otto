# Otto

**Otto** is a production-focused wrapper that turns `opencode-ai` + `bridge` + `mempalace` into one fast, repeatable runtime for AI coding in Discord and terminal flows.

It is built for teams and solo builders who want:

- **Speed**: prebuilt Docker images and one-command onboarding.
- **Intelligence**: persistent memory via `mempalace`.
- **Reliability**: pinned stable channel + edge channel with CI publishing.
- **Low friction**: run locally or in Docker with the same behavior.

## Why Otto

Most agent stacks break because setup is spread across tools, configs, and machine-specific assumptions.
Otto standardizes this into a single operator experience:

- installs and upgrades required global CLIs,
- merges required plugins into `opencode` config,
- enforces safe runtime defaults,
- supports tenant-oriented Docker operation,
- ships stable and edge Docker channels to GHCR.

## What Otto includes

Otto orchestrates three upstream components without patching their source code:

- `opencode-ai` — coding agent runtime
- `@otto-assistant/bridge` — Discord bridge process
- `mempalace` — persistent memory plugin for long-lived context

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

## Project links

- Repository: https://github.com/otto-assistant/otto
- Docker image: https://github.com/otto-assistant/otto/pkgs/container/otto

---

Otto is optimized for one goal: **ship faster with AI agents, without losing control of runtime quality and memory continuity.**
