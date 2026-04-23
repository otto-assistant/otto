# Otto Production Docker Pipeline Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ship a production-grade Docker distribution for Otto with edge/stable GHCR pipelines, local build mode (no npm publish required), and an operator-friendly onboarding/update workflow.

**Architecture:** Keep Docker image as monolith runtime while separating delivery channels (`edge` from `master`, `stable` from tags). Add dual build-source modes (`published` and `local`) in Docker, formalize operator docs, and include a baseline “gentleman skills set” bootstrap flow for each tenant.

**Tech Stack:** GitHub Actions, GHCR, Docker Buildx, TypeScript, Node.js, Bash wrapper script, existing Otto CLI.

---

### Task 1: Add Docker CI workflow for edge channel

**Files:**
- Create: `.github/workflows/docker-edge.yml`
- Test: manual workflow dry-run + local YAML validation

**Step 1: Write failing validation expectation**

Expectation: No workflow currently builds/pushes GHCR image on `master`.

**Step 2: Verify baseline state**

Run: `glob .github/workflows/*.yml`
Expected: only npm publish workflow exists.

**Step 3: Implement edge workflow**

Workflow behavior:
- Trigger: `push` on `master`
- Run: `pnpm install --frozen-lockfile`, `pnpm build`, `pnpm test`
- Build and push:
  - `ghcr.io/otto-assistant/otto:edge`
  - `ghcr.io/otto-assistant/otto:edge-<sha>`
- Attach OCI labels (revision, source, version metadata)

**Step 4: Validate workflow syntax**

Run: `pnpm build`
Expected: still passes; no schema/syntax issues in CI file.

**Step 5: Commit**

```bash
git add .github/workflows/docker-edge.yml
git commit -m "ci: add GHCR edge image pipeline from master"
```

### Task 2: Add Docker CI workflow for stable channel

**Files:**
- Create: `.github/workflows/docker-stable.yml`

**Step 1: Write failing expectation**

Expectation: no tag-based stable Docker release pipeline exists.

**Step 2: Verify baseline**

Run: `glob .github/workflows/docker-stable.yml`
Expected: file missing.

**Step 3: Implement stable workflow**

Workflow behavior:
- Trigger: `push` tags `v*.*.*`
- Run same gates: install, build, test
- Build and push:
  - `ghcr.io/otto-assistant/otto:stable`
  - `ghcr.io/otto-assistant/otto:<semver>`
- Optional `latest` tagging controlled by workflow input/flag
- Publish summary with image digest

**Step 4: Validate consistency with edge workflow**

Run: `pnpm build`
Expected: repository build unaffected.

**Step 5: Commit**

```bash
git add .github/workflows/docker-stable.yml
git commit -m "ci: add GHCR stable image pipeline from release tags"
```

### Task 3: Extend Dockerfile with dual source modes (`published` / `local`)

**Files:**
- Modify: `Dockerfile`
- Create: `artifacts/.gitkeep`

**Step 1: Write failing design assertion**

Expectation: Dockerfile supports only published npm installs.

**Step 2: Verify baseline**

Run: `read Dockerfile`
Expected: no build arg selecting local artifacts.

**Step 3: Implement dual-mode build**

Add build args:
- `BUILD_SOURCE_MODE=published|local`
- `OPENCODE_VERSION`, `BRIDGE_VERSION` (published mode)

Behavior:
- `published`: current npm global installs
- `local`: install `./artifacts/opencode-ai-*.tgz` and `./artifacts/bridge-*.tgz`

Preserve runtime deps (`curl`, `bun`) and current entrypoint (`bridge start`).

**Step 4: Build validation (published mode)**

Run: `docker build -t ghcr.io/otto-assistant/otto:local-test .`
Expected: successful image build.

**Step 5: Commit**

```bash
git add Dockerfile artifacts/.gitkeep
git commit -m "feat(docker): support published and local artifact build modes"
```

### Task 4: Add local artifacts builder script (no npm publish loop)

**Files:**
- Create: `scripts/build-local-artifacts.sh`
- Modify: `package.json` (script entry)

**Step 1: Write failing expectation**

Expectation: no first-class script to pack local dependencies for Docker local mode.

**Step 2: Verify baseline**

Run: `read package.json`
Expected: no `build:artifacts` script.

**Step 3: Implement script**

Script responsibilities:
- Ensure `artifacts/` exists
- Pack local Otto/bridge/opencode sources when available (or print actionable error)
- Output deterministic artifact filenames

Prefer explicit checks and clear failures over silent partial success.

**Step 4: Verify script executable and wiring**

Run: `bash scripts/build-local-artifacts.sh --help` (or no-op mode)
Expected: usage/help or successful dry run.

**Step 5: Commit**

```bash
git add scripts/build-local-artifacts.sh package.json
git commit -m "feat(dev): add local artifact packaging script for docker builds"
```

### Task 5: Add baseline skills manifest and bootstrap command

**Files:**
- Create: `src/skills-baseline.ts`
- Modify: `src/cli.ts`
- Modify: `src/tenant.ts`
- Test: `src/skills.test.ts` and/or `src/tenant.test.ts`

**Step 1: Write failing test for baseline bootstrap output**

```ts
it("reports baseline skill bootstrap summary", () => {
  // expects installed/already-present/failed counters
})
```

**Step 2: Run focused test**

Run: `pnpm test --run src/skills.test.ts`
Expected: FAIL before implementation.

**Step 3: Implement baseline model + command**

Add:
- `otto tenant skills bootstrap <path>`
- optional `otto tenant init <path> --with-skills`

Behavior:
- install missing baseline skills
- never remove user-installed skills
- summary report with explicit counts

**Step 4: Run focused tests**

Run: `pnpm test --run src/skills.test.ts src/tenant.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/skills-baseline.ts src/cli.ts src/tenant.ts src/skills.test.ts src/tenant.test.ts
git commit -m "feat(skills): add tenant baseline skills bootstrap flow"
```

### Task 6: Improve wrapper script for production ergonomics

**Files:**
- Modify: `otto`

**Step 1: Write failing behavior expectation**

Expectation: wrapper should support channel selection (`OTTO_IMAGE=edge|stable|custom`) and clear error messaging for missing Docker.

**Step 2: Verify baseline**

Run: `read otto`
Expected: basic behavior only.

**Step 3: Implement wrapper improvements**

Add:
- preflight checks (`docker`, `docker compose`)
- clearer guidance for `KIMAKI_BOT_TOKEN` missing
- `OTTO_IMAGE` override examples in help

**Step 4: Wrapper smoke test**

Run:
- `bash ./otto tenant status /tmp/non-existent`
- `bash ./otto tenant init /tmp/otto-wrapper-smoke`

Expected: human-readable errors/status.

**Step 5: Commit**

```bash
git add otto
git commit -m "feat(wrapper): add production preflight and clearer operator UX"
```

### Task 7: Add production operator documentation set

**Files:**
- Create: `docs/PRODUCTION-QUICKSTART.md`
- Create: `docs/PRODUCTION-RUNBOOK.md`
- Create: `docs/RELEASE-AND-UPGRADE-POLICY.md`
- Create: `docs/TROUBLESHOOTING.md`

**Step 1: Write failing docs coverage expectation**

Expectation: production docs set does not exist in repo.

**Step 2: Verify baseline**

Run: `glob docs/PRODUCTION-*.md`
Expected: files missing.

**Step 3: Author docs with concrete commands**

Must include:
- new user onboarding end-to-end
- stable vs edge usage
- local build mode
- rollback commands
- “bot added but not responding” checklist

**Step 4: Validate command accuracy against current CLI**

Run:
- `node dist/cli.js --help`
- `bash ./otto tenant init /tmp/otto-doc-smoke`

Expected: docs commands map to real behavior.

**Step 5: Commit**

```bash
git add docs/PRODUCTION-QUICKSTART.md docs/PRODUCTION-RUNBOOK.md docs/RELEASE-AND-UPGRADE-POLICY.md docs/TROUBLESHOOTING.md
git commit -m "docs: add production quickstart, runbook, release and troubleshooting guides"
```

### Task 8: Add CI smoke test script for container runtime sanity

**Files:**
- Create: `scripts/smoke-docker-runtime.sh`
- Modify: `.github/workflows/docker-edge.yml`
- Modify: `.github/workflows/docker-stable.yml`

**Step 1: Write failing expectation**

Expectation: workflows build/push image but do not run runtime sanity checks.

**Step 2: Verify baseline**

Run: `read .github/workflows/docker-edge.yml` and `docker-stable.yml`
Expected: no smoke script invocation.

**Step 3: Implement smoke script**

Script checks:
- image launches `bridge --help`
- image launches `otto --help`
- image runs tenant init command in temp volume

**Step 4: Wire smoke script into both workflows**

Ensure smoke runs before push step.

**Step 5: Commit**

```bash
git add scripts/smoke-docker-runtime.sh .github/workflows/docker-edge.yml .github/workflows/docker-stable.yml
git commit -m "ci: add docker runtime smoke checks before image publish"
```

### Task 9: Full verification and manual acceptance

**Files:**
- No new files required

**Step 1: Run local verification suite**

Run:
- `pnpm build`
- `pnpm test`

Expected: all relevant tests pass (document known environment-specific exceptions if any remain).

**Step 2: Build and run onboarding smoke flow**

Run:
- `docker build -t ghcr.io/otto-assistant/otto:verify .`
- `bash ./otto tenant init /tmp/otto-prod-smoke`
- configure `.env`
- `bash ./otto tenant up /tmp/otto-prod-smoke`
- `bash ./otto tenant status /tmp/otto-prod-smoke`

Expected: tenant container stays up; logs show Discord and OpenCode ready paths.

**Step 3: Cleanup smoke environment**

Run:
- `bash ./otto tenant down /tmp/otto-prod-smoke`

**Step 4: Final commit**

```bash
git add <all-remaining-files>
git commit -m "feat: productionize otto docker delivery with edge/stable channels and local build mode"
```
