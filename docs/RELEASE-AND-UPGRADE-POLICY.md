# Otto Release and Upgrade Policy

## Channels

- **edge**: built from every push to `master`
- **stable**: built from release tags `vX.Y.Z`

## Docker tags

### Edge pipeline
- `ghcr.io/otto-assistant/otto:edge`
- `ghcr.io/otto-assistant/otto:edge-<sha>`

### Stable pipeline
- `ghcr.io/otto-assistant/otto:stable`
- `ghcr.io/otto-assistant/otto:X.Y.Z`
- `ghcr.io/otto-assistant/otto:latest` (if enabled)

## Upstream version source of truth

Pinned upstream versions remain in:

`src/manifest.ts` → `MANIFEST.pinned`

## Upgrade process

1. Bump pinned versions in `src/manifest.ts`
2. Merge to `master` (edge image updates)
3. Validate edge in staging
4. Create tag `vX.Y.Z` for stable release

## Rollback policy

Rollback by pinning tenant compose image to previous immutable version tag:

```yaml
image: ghcr.io/otto-assistant/otto:0.1.0
```

Then run:

```bash
docker compose -f /path/to/tenant/compose.yml up -d
```
