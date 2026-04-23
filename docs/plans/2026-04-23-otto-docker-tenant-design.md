# Otto Docker Tenant Design

## Goal
Build a Docker-first Otto runtime that supports multiple isolated tenants on one host, each pinned to its own Otto image version. The v1 success criterion is stable parallel operation of 2-3 tenants with no cross-tenant conflicts.

## Constraints
The system must be compose-first and location-agnostic: tenant files can live anywhere. Required host artifacts are `compose.yml`, `.env`, `projects/` bind mount, and `memory/` bind mount.

## Chosen Path
Adopt an A→C rollout:
1. A: compose-per-tenant monolith image for fast, reliable delivery.
2. C: add `otto tenant ...` commands over the same runtime model.

## Tenant Identity
Tenant identity is based on compose working directory and runtime config, not a central registry. If `COMPOSE_PROJECT_NAME` is not set, default to `otto-<folder_name>`.

## Image and Channel Model
`compose.yml` defines the default image and tag. `.env` can override image/tag when needed.

Release channels:
- `stable`: manually promoted tested tags.
- `edge`: auto-updated in staging only.

## Runtime Mount Model
Required bind mounts:
- `./projects` → tenant workspace root in container.
- `./memory` → tenant memory root in container.

`memory/` contains:
- `AGENTS.md`
- `soul.md`
- `persona.md`
- mempalace data
- future runtime metadata used by entrypoint mapping

Container startup auto-creates missing required files/directories in `memory/` without overwriting existing user content.

## Access Profiles
Default profile is `safe` with only required mounts and no elevated privileges. Optional `admin` mode is explicit opt-in for broader host access and additional privileges.

## Networking
Current baseline is outbound-first runtime (Discord and external providers). Design must keep an ingress-ready extension point for future UI/admin gateway.

## v1 CLI Surface
Phase C commands, built over compose-per-tenant:
- `otto tenant init <path>`
- `otto tenant up <path>`
- `otto tenant down <path>`
- `otto tenant status <path>`
- `otto tenant logs <path> [--follow]`

All commands are path-driven and idempotent.

## Error Handling and Safety
Preflight checks before `up`:
- Docker daemon reachable.
- Required mounts exist or can be created.
- Effective compose project name resolved.
- Memory root writable.

`admin` mode must print explicit warning in logs and status output.

## Testing Strategy
v1 verification focuses on real tenant isolation and operational stability:
1. Start three tenants simultaneously with different image tags.
2. Verify no container/network/mount collisions.
3. Verify restart resilience (`down`/`up`) and state persistence in bind mounts.
4. Verify mempalace and generated memory files exist per tenant.

## Out of Scope for v1
- Central tenant registry.
- Multi-image decomposition.
- Full observability stack (Prometheus/Grafana).
- Backup automation.

## Decision Summary
Use monolith image + compose-per-tenant now to achieve fast, low-risk delivery of multi-tenant isolation. Add Otto tenant management commands next without changing runtime fundamentals.
