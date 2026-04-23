# Otto Docker Tenant Runtime Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Deliver a Docker-first, compose-per-tenant runtime that can run 2-3 isolated Otto tenants on one host with different image versions.

**Architecture:** Keep current npm-global flows intact for backward compatibility, then add a new `otto tenant` command group that operates on tenant paths and shells out to `docker compose`. Tenant identity is path-based with derived defaults; runtime state is bind-mounted (`projects/` and `memory/`) and memory bootstrap is handled by tenant init plus container startup checks.

**Tech Stack:** TypeScript, Node.js, Docker Compose, Vitest, existing Otto CLI architecture.

---

### Task 1: Add tenant domain model and path helpers

**Files:**
- Create: `src/tenant.ts`
- Test: `src/tenant.test.ts`

**Step 1: Write the failing test for derived compose project name**

```ts
import { describe, expect, it } from "vitest"
import { deriveComposeProjectName } from "./tenant.js"

describe("deriveComposeProjectName", () => {
  it("uses otto-<folder_name> default", () => {
    expect(deriveComposeProjectName("/tmp/my-tenant")).toBe("otto-my-tenant")
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm test --run src/tenant.test.ts -t "uses otto-<folder_name> default"`
Expected: FAIL because helper does not exist.

**Step 3: Write minimal implementation**

```ts
export function deriveComposeProjectName(tenantPath: string): string {
  const name = tenantPath.split(/[\\/]/).filter(Boolean).pop() ?? "tenant"
  return `otto-${name}`
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm test --run src/tenant.test.ts -t "uses otto-<folder_name> default"`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/tenant.ts src/tenant.test.ts
git commit -m "feat: add tenant naming helper for compose defaults"
```

### Task 2: Parse tenant runtime config from `.env` + compose defaults

**Files:**
- Modify: `src/tenant.ts`
- Test: `src/tenant.test.ts`

**Step 1: Write failing test for compose/env resolution**

```ts
it("uses image from compose.yml when env override missing", () => {
  const resolved = resolveTenantImage({
    composeImage: "otto-assistant/otto:stable",
    envImage: undefined,
  })
  expect(resolved).toBe("otto-assistant/otto:stable")
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm test --run src/tenant.test.ts -t "uses image from compose.yml when env override missing"`
Expected: FAIL because resolver does not exist.

**Step 3: Implement minimal resolver**

```ts
export function resolveTenantImage(input: { composeImage: string; envImage?: string }): string {
  return input.envImage?.trim() || input.composeImage
}
```

**Step 4: Run focused test**

Run: `pnpm test --run src/tenant.test.ts -t "uses image from compose.yml when env override missing"`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/tenant.ts src/tenant.test.ts
git commit -m "feat: resolve tenant image with compose-first default"
```

### Task 3: Add memory bootstrap helpers (`AGENTS.md`, `soul.md`, `persona.md`, mempalace dir)

**Files:**
- Modify: `src/tenant.ts`
- Test: `src/tenant.test.ts`

**Step 1: Write failing test for memory bootstrap**

```ts
it("creates required memory files and mempalace dir", () => {
  const report = ensureTenantMemoryLayout(tmpMemoryPath)
  expect(report.created).toContain("AGENTS.md")
  expect(report.created).toContain("soul.md")
  expect(report.created).toContain("persona.md")
  expect(report.created).toContain("mempalace/")
})
```

**Step 2: Run test to verify failure**

Run: `pnpm test --run src/tenant.test.ts -t "creates required memory files and mempalace dir"`
Expected: FAIL due to missing helper.

**Step 3: Implement helper with idempotent writes**

```ts
export function ensureTenantMemoryLayout(memoryPath: string): { created: string[] } {
  // mkdir -p memoryPath + mempalace
  // create empty markdown files only if absent
  return { created }
}
```

**Step 4: Run tests**

Run: `pnpm test --run src/tenant.test.ts`
Expected: PASS for tenant memory cases.

**Step 5: Commit**

```bash
git add src/tenant.ts src/tenant.test.ts
git commit -m "feat: bootstrap tenant memory layout for required files"
```

### Task 4: Add compose command runner abstraction

**Files:**
- Create: `src/docker.ts`
- Create: `src/docker.test.ts`

**Step 1: Write failing test for command assembly**

```ts
it("builds docker compose command with tenant path", () => {
  const cmd = buildComposeCommand("/tmp/tenant-a", ["up", "-d"])
  expect(cmd).toEqual({
    command: "docker",
    args: ["compose", "-f", "/tmp/tenant-a/compose.yml", "up", "-d"],
  })
})
```

**Step 2: Run test**

Run: `pnpm test --run src/docker.test.ts -t "builds docker compose command with tenant path"`
Expected: FAIL.

**Step 3: Implement minimal builder and executor wrapper**

```ts
export function buildComposeCommand(tenantPath: string, subArgs: string[]) { /* ... */ }
export function runCompose(tenantPath: string, subArgs: string[]): void { /* execSync */ }
```

**Step 4: Run tests**

Run: `pnpm test --run src/docker.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/docker.ts src/docker.test.ts
git commit -m "feat: add docker compose command abstraction for tenants"
```

### Task 5: Implement `otto tenant init <path>`

**Files:**
- Modify: `src/cli.ts`
- Modify: `src/tenant.ts`
- Test: `src/index.test.ts`

**Step 1: Write failing CLI test**

```ts
it("creates compose.yml, .env.example, projects and memory on tenant init", async () => {
  // invoke CLI with: tenant init /tmp/tenant-a
  // assert files/directories exist
})
```

**Step 2: Run test**

Run: `pnpm test --run src/index.test.ts -t "creates compose.yml, .env.example, projects and memory on tenant init"`
Expected: FAIL.

**Step 3: Implement command routing and init logic**

```ts
case "tenant":
  await cmdTenant(args.slice(1))
```

```ts
async function cmdTenant(subArgs: string[]): Promise<void> {
  // handle init/up/down/status/logs
}
```

**Step 4: Run targeted test**

Run: `pnpm test --run src/index.test.ts -t "creates compose.yml, .env.example, projects and memory on tenant init"`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/cli.ts src/tenant.ts src/index.test.ts
git commit -m "feat: add tenant init command with compose-first scaffold"
```

### Task 6: Implement `otto tenant up/down/logs` compose wrappers

**Files:**
- Modify: `src/cli.ts`
- Modify: `src/docker.ts`
- Test: `src/index.test.ts`

**Step 1: Write failing tests for up/down/logs routing**

```ts
it("runs docker compose up -d for tenant path", async () => {
  // assert runCompose called with ["up", "-d"]
})
```

**Step 2: Run tests**

Run: `pnpm test --run src/index.test.ts -t "runs docker compose up -d for tenant path"`
Expected: FAIL.

**Step 3: Implement subcommands**

```ts
tenant up <path>
tenant down <path>
tenant logs <path> [--follow]
```

**Step 4: Run tests**

Run: `pnpm test --run src/index.test.ts`
Expected: PASS for tenant routing cases.

**Step 5: Commit**

```bash
git add src/cli.ts src/docker.ts src/index.test.ts
git commit -m "feat: add tenant lifecycle wrappers for compose"
```

### Task 7: Implement `otto tenant status <path>` with preflight checks

**Files:**
- Modify: `src/cli.ts`
- Modify: `src/tenant.ts`
- Modify: `src/health.ts`
- Test: `src/health.test.ts`

**Step 1: Write failing test for tenant preflight**

```ts
it("reports missing memory bind root as error", () => {
  const report = checkTenantHealth({ tenantPath })
  expect(report.some((x) => x.status === "error")).toBe(true)
})
```

**Step 2: Run test**

Run: `pnpm test --run src/health.test.ts -t "reports missing memory bind root as error"`
Expected: FAIL.

**Step 3: Implement tenant health checks**

```ts
check docker availability
check compose.yml exists
check memory path writable
check projects mount path exists
```

**Step 4: Run tests**

Run: `pnpm test --run src/health.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/cli.ts src/tenant.ts src/health.ts src/health.test.ts
git commit -m "feat: add tenant status and preflight validation"
```

### Task 8: Add safe/admin runtime mode handling

**Files:**
- Modify: `src/tenant.ts`
- Modify: `src/cli.ts`
- Test: `src/tenant.test.ts`

**Step 1: Write failing test for default safe mode**

```ts
it("defaults to safe mode when OTTO_MODE is unset", () => {
  expect(resolveTenantMode(undefined)).toBe("safe")
})
```

**Step 2: Run test**

Run: `pnpm test --run src/tenant.test.ts -t "defaults to safe mode when OTTO_MODE is unset"`
Expected: FAIL.

**Step 3: Implement mode resolution and warning output**

```ts
export function resolveTenantMode(mode?: string): "safe" | "admin" {
  return mode === "admin" ? "admin" : "safe"
}
```

Print explicit warning when mode is admin.

**Step 4: Run tests**

Run: `pnpm test --run src/tenant.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/tenant.ts src/cli.ts src/tenant.test.ts
git commit -m "feat: add tenant safe/admin mode policy"
```

### Task 9: Add Docker-first help text and keep legacy commands available

**Files:**
- Modify: `src/cli.ts`
- Test: `src/index.test.ts`

**Step 1: Write failing test for help output containing tenant commands**

```ts
it("prints tenant commands in root usage", async () => {
  // assert help text contains `otto tenant init <path>`
})
```

**Step 2: Run test**

Run: `pnpm test --run src/index.test.ts -t "prints tenant commands in root usage"`
Expected: FAIL.

**Step 3: Update usage text**

Include all tenant commands and mark npm-global install/upgrade as legacy path.

**Step 4: Run tests**

Run: `pnpm test --run src/index.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/cli.ts src/index.test.ts
git commit -m "feat: expose docker-first tenant commands in CLI help"
```

### Task 10: End-to-end verification for v1 success criterion

**Files:**
- Create: `src/tenant.e2e.test.ts`
- Modify: `package.json`

**Step 1: Write failing e2e skeleton**

```ts
it("runs three isolated tenants with different compose names and image tags", async () => {
  // create temp tenant dirs
  // call tenant init
  // validate derived defaults and file isolation
})
```

**Step 2: Run test**

Run: `pnpm test --run src/tenant.e2e.test.ts`
Expected: FAIL until helpers are wired.

**Step 3: Implement minimal e2e harness using mocked compose runner**

Use dependency injection for compose execution so e2e can validate commands without real Docker in CI.

**Step 4: Run full suite**

Run: `pnpm test`
Expected: PASS.

**Step 5: Build verification**

Run: `pnpm build`
Expected: PASS and `dist/cli.js` updated.

**Step 6: Commit**

```bash
git add src/tenant.e2e.test.ts package.json
git commit -m "test: add tenant isolation e2e verification"
```

### Task 11: Runtime validation on host (manual acceptance)

**Files:**
- No code changes required

**Step 1: Prepare three tenant dirs**

```bash
node dist/cli.js tenant init /tmp/otto-a
node dist/cli.js tenant init /tmp/otto-b
node dist/cli.js tenant init /tmp/otto-c
```

**Step 2: Set different image tags**

Update each tenant `compose.yml` image tag (`stable`, `stable-previous`, `edge`).

**Step 3: Start tenants**

```bash
node dist/cli.js tenant up /tmp/otto-a
node dist/cli.js tenant up /tmp/otto-b
node dist/cli.js tenant up /tmp/otto-c
```

**Step 4: Validate isolation**

```bash
docker compose -f /tmp/otto-a/compose.yml ps
docker compose -f /tmp/otto-b/compose.yml ps
docker compose -f /tmp/otto-c/compose.yml ps
```

Expected: all running, no name/network conflicts, each has separate `memory/` + `projects/` state.

**Step 5: Final commit (if any acceptance fixes were needed)**

```bash
git add <changed-files>
git commit -m "chore: finalize docker tenant runtime acceptance fixes"
```
