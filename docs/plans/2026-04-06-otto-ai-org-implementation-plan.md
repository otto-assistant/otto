# Otto AI Organization — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Set up GitHub org `otto-ai`, fork kimaki as `otto-ai/bridge`, configure auto-sync from upstream, add extension points, update Otto CLI manifest.

**Architecture:** Multi-repo org pattern — each upstream package forked into `otto-ai/` with GitHub Actions auto-sync. Custom code lives in isolated `src/otto/` folder within each fork. Otto CLI references scoped `@otto-ai/bridge` instead of upstream `kimaki`.

**Tech Stack:** GitHub (org, forks, Actions), Node.js/TypeScript, npm scoped packages, git

---

## Prerequisites

Before starting, verify:
- [ ] GitHub CLI (`gh`) is authenticated: `gh auth status`
- [ ] User has permissions to create org `otto-ai`
- [ ] Node.js 20+ and npm available

---

### Task 1: Create GitHub Organization `otto-ai`

**Files:**
- No code changes — GitHub web setup

**Step 1: Create the organization**

Go to https://github.com/organizations/new and create:
- **Name:** `otto-ai`
- **Billing:** Free (public repos only, or upgrade if private needed)
- **Owner:** SerhiiD

**Step 2: Verify org exists via CLI**

Run: `gh org list 2>/dev/null || gh api user/orgs --jq '.[].login'`
Expected: `otto-ai` in the list

**Step 3: Configure org settings**

- Add profile picture (Otto branding)
- Set description: "Otto — AI agent distribution"
- Enable GitHub Actions for the org

**Step 4: Note completion**

No commit needed — this is GitHub infrastructure setup.

---

### Task 2: Transfer Otto repo to org

**Files:**
- No code changes — repo transfer

**Step 1: Transfer `SerhiiD/otto` → `otto-ai/otto`**

Via GitHub: Settings → General → Danger Zone → Transfer ownership
Or via CLI:

```bash
gh repo transfer SerhiiD/otto --target-otakus otto-ai
```

**Step 2: Update local git remote**

```bash
cd /data/projects/otto
git remote set-url origin https://github.com/otto-ai/otto.git
git remote -v
```

Expected: `origin  https://github.com/otto-ai/otto.git`

**Step 3: Verify push works**

```bash
git push origin master
```

Expected: success

**Step 4: Update `package.json` repository URL**

In `package.json`, change:
```json
"repository": {
  "type": "git",
  "url": "git+https://github.com/otto-ai/otto.git"
}
```

**Step 5: Commit**

```bash
git add package.json
git commit -m "chore: update repo URL to otto-ai org"
```

---

### Task 3: Fork kimaki → otto-ai/bridge

**Files:**
- No code changes in otto repo — fork setup

**Step 1: Create the fork via GitHub**

Option A — GitHub web UI:
1. Go to https://github.com/remorses/kimaki
2. Click "Fork"
3. Owner: `otto-ai`, Repository name: `bridge`
4. Uncheck "Copy the master/main branch only" (keep all branches)

Option B — GitHub CLI:
```bash
gh repo fork remorses/kimaki --org otto-ai --clone=false
# Then rename:
gh repo rename bridge --repo otto-ai/kimaki
```

**Step 2: Verify fork exists**

```bash
gh repo view otto-ai/bridge --json name,url
```

Expected: repo `otto-ai/bridge` exists

**Step 3: Configure upstream remote tracking**

The fork automatically tracks `remorses/kimaki` as parent. Verify:

```bash
gh api repos/otto-ai/bridge --jq '.parent.full_name'
```

Expected: `remorses/kimaki`

---

### Task 4: Add auto-sync workflow to fork

**Files:**
- Create: `.github/workflows/sync-upstream.yml` in `otto-ai/bridge`

**Step 1: Clone the fork temporarily**

```bash
git clone https://github.com/otto-ai/bridge.git /tmp/otto-bridge
cd /tmp/otto-bridge
```

**Step 2: Create workflow file**

Create `.github/workflows/sync-upstream.yml`:

```yaml
name: Sync Upstream

on:
  schedule:
    # Every 4 hours
    - cron: '0 */4 * * *'
  workflow_dispatch:
    inputs:
      force:
        description: 'Force sync even if no new commits'
        required: false
        default: 'false'

permissions:
  contents: write
  issues: write

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          ref: main
          fetch-depth: 0
          token: ${{ secrets.GITHUB_TOKEN }}

      - name: Add upstream remote
        run: |
          git remote add upstream https://github.com/remorses/kimaki.git
          git fetch upstream main

      - name: Check for new commits
        id: check
        run: |
          LOCAL=$(git rev-parse HEAD)
          UPSTREAM=$(git rev-parse upstream/main)
          echo "local=$LOCAL" >> $GITHUB_OUTPUT
          echo "upstream=$UPSTREAM" >> $GITHUB_OUTPUT
          if [ "$LOCAL" = "$UPSTREAM" ]; then
            echo "has_new=false" >> $GITHUB_OUTPUT
          else
            echo "has_new=true" >> $GITHUB_OUTPUT
          fi

      - name: Merge upstream/main
        if: steps.check.outputs.has_new == 'true' || github.event.inputs.force == 'true'
        run: |
          git config user.name "otto-bot"
          git config user.email "bot@otto-ai.dev"
          git merge upstream/main --no-edit

      - name: Push changes
        if: steps.check.outputs.has_new == 'true' || github.event.inputs.force == 'true'
        run: git push origin main

      - name: Create issue on conflict
        if: failure()
        uses: actions/github-script@v7
        with:
          script: |
            const { data: issues } = await github.rest.issues.listForRepo({
              owner: context.repo.owner,
              repo: context.repo.repo,
              labels: 'upstream-sync',
              state: 'open'
            });
            // Don't duplicate conflict issues
            if (issues.length === 0) {
              await github.rest.issues.create({
                owner: context.repo.owner,
                repo: context.repo.repo,
                title: '⚠️ Upstream sync conflict',
                body: `Auto-merge from upstream \`remorses/kimaki\` failed.\n\n**Local:** \`${{ steps.check.outputs.local }}\`\n**Upstream:** \`${{ steps.check.outputs.upstream }}\`\n\nManual resolution needed. After fixing, close this issue and re-run the workflow.`,
                labels: ['upstream-sync', 'conflict']
              });
            }
```

**Step 3: Commit and push**

```bash
git add .github/workflows/sync-upstream.yml
git commit -m "ci: add upstream auto-sync workflow"
git push origin main
```

**Step 4: Verify workflow runs**

```bash
gh workflow run sync-upstream.yml --repo otto-ai/bridge
# Check status:
gh run list --repo otto-ai/bridge --limit 1
```

**Step 5: Clean up temp clone**

```bash
cd /data/projects/otto
rm -rf /tmp/otto-bridge
```

---

### Task 5: Add extension point infrastructure to fork

**Files (in otto-ai/bridge repo):**
- Create: `src/otto/index.ts`
- Create: `src/otto/branding.ts`
- Modify: `src/index.ts` (add one import line at end)

**Step 1: Clone fork and explore entry point**

```bash
git clone https://github.com/otto-ai/bridge.git /tmp/otto-bridge
cd /tmp/otto-bridge
```

Find the main entry point by checking `package.json` → `"main"` or `"bin"` fields. Typically `src/index.ts` or `src/cli.ts`.

**Step 2: Create otto extension folder**

```bash
mkdir -p src/otto
```

Create `src/otto/index.ts`:
```ts
/**
 * Otto extensions — custom branding and features
 * This module is loaded by the upstream entry point via otto.patch.ts
 */
export { OTTO_BRANDING } from "./branding.js"
```

Create `src/otto/branding.ts`:
```ts
/**
 * Otto branding overrides
 * These can be used to customize the CLI appearance
 */
export const OTTO_BRANDING = {
  distributionName: "Otto",
  description: "AI agent distribution by otto-ai",
  homepage: "https://github.com/otto-ai/otto",
} as const
```

**Step 3: Add import to upstream entry point**

At the **end** of the main entry file (e.g., `src/index.ts`), add:

```ts
// Otto distribution extensions
import "./otto/index.js"
```

> **Important:** This is the ONLY line modified in upstream code.
> Place it at the very end to minimize merge conflict risk.

**Step 4: Commit and push**

```bash
git add src/otto/ src/index.ts
git commit -m "feat: add otto extension point infrastructure"
git push origin main
```

**Step 5: Verify build works**

```bash
# If kimaki has a build step:
npm install && npm run build
```

Expected: build succeeds with no errors

**Step 6: Clean up**

```bash
cd /data/projects/otto
rm -rf /tmp/otto-bridge
```

---

### Task 6: Update Otto CLI manifest for forked package

**Files:**
- Modify: `src/manifest.ts`
- Modify: `src/installer.ts` (if npm scope handling needed)
- Modify: `src/detect.ts` (version detection for scoped package)

**Step 1: Update manifest**

Edit `src/manifest.ts`:

```ts
export const MANIFEST: Manifest = {
  version: "0.1.0",
  packages: {
    "opencode-ai": ">=1.0.115",
    "@otto-ai/bridge": ">=0.5.0",  // was: "kimaki": ">=0.4.0"
  },
  pinned: {
    "opencode-ai": "1.2.20",
    "@otto-ai/bridge": "0.5.0",    // was: "kimaki": "0.4.90"
  },
  plugins: [
    "opencode-agent-memory",
  ],
}
```

**Step 2: Verify detect.ts handles scoped packages**

`detect.ts` calls `npm list -g <name> --json`. Scoped packages like `@otto-ai/bridge` should work with `npm list -g @otto-ai/bridge --json`. Verify no changes needed by checking the implementation.

**Step 3: Verify installer.ts handles scoped packages**

`installer.ts` calls `npm install -g <name>@<version>`. Verify `npm install -g @otto-ai/bridge@0.5.0` works. No code changes likely needed.

**Step 4: Run tests**

```bash
cd /data/projects/otto
pnpm test
```

Expected: all tests pass (may need to update test fixtures for new package name)

**Step 5: Update tests if needed**

If tests reference `kimaki` directly, update to `@otto-ai/bridge`.

**Step 6: Commit**

```bash
git add src/manifest.ts src/ src/test/
git commit -m "feat: update manifest to use @otto-ai/bridge fork"
```

---

### Task 7: Add `otto sync` command

**Files:**
- Modify: `src/cli.ts`
- Create: `src/sync.ts`

**Step 1: Create sync module**

Create `src/sync.ts`:

```ts
import { execSync } from "node:child_process"

interface SyncTarget {
  repo: string       // e.g., "otto-ai/bridge"
  upstream: string   // e.g., "remorses/kimaki"
  branch: string     // e.g., "main"
}

const SYNC_TARGETS: SyncTarget[] = [
  {
    repo: "otto-ai/bridge",
    upstream: "remorses/kimaki",
    branch: "main",
  },
]

export async function syncUpstreams(token?: string): Promise<void> {
  const ghToken = token || process.env.GITHUB_TOKEN
  if (!ghToken) {
    console.error("Error: GITHUB_TOKEN required for sync. Set env var or pass --token.")
    process.exit(1)
  }

  for (const target of SYNC_TARGETS) {
    console.log(`Syncing ${target.repo} ← ${target.upstream}...`)
    try {
      // Trigger the sync workflow via GitHub API
      execSync(
        `gh workflow run sync-upstream.yml --repo ${target.repo} --ref ${target.branch}`,
        { stdio: "inherit" }
      )
      console.log(`  ✓ Triggered sync for ${target.repo}`)
    } catch (err) {
      console.error(`  ✗ Failed to sync ${target.repo}:`, err)
    }
  }
}

export { SYNC_TARGETS }
```

**Step 2: Register command in CLI**

Edit `src/cli.ts` — add sync command:

```ts
import { syncUpstreams } from "./sync.js"

// In the CLI registration:
program
  .command("sync")
  .description("Trigger upstream sync for all forked packages")
  .action(async () => {
    await syncUpstreams()
  })
```

**Step 3: Write test for sync module**

Create `src/sync.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest"
import { SYNC_TARGETS } from "./sync.js"

describe("sync", () => {
  it("has correct sync targets", () => {
    expect(SYNC_TARGETS).toHaveLength(1)
    expect(SYNC_TARGETS[0].repo).toBe("otto-ai/bridge")
    expect(SYNC_TARGETS[0].upstream).toBe("remorses/kimaki")
  })
})
```

**Step 4: Run tests**

```bash
pnpm test
```

Expected: all tests pass

**Step 5: Commit**

```bash
git add src/sync.ts src/sync.test.ts src/cli.ts
git commit -m "feat: add otto sync command for upstream sync trigger"
```

---

### Task 8: Verify end-to-end

**Step 1: Build**

```bash
cd /data/projects/otto
pnpm build
```

Expected: build succeeds

**Step 2: Test status command**

```bash
node dist/cli.js status
```

Expected: shows Otto version 0.1.0, package list includes `@otto-ai/bridge`

**Step 3: Test sync command (dry)**

```bash
node dist/cli.js sync
```

Expected: attempts to trigger sync (may fail without GITHUB_TOKEN — that's ok)

**Step 4: Run full test suite**

```bash
pnpm test
```

Expected: all tests pass

**Step 5: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: resolve e2e verification issues"
```

---

## Execution Order

Tasks 1-3 are sequential (org → transfer → fork).
Tasks 4-5 are sequential (workflow → extension points in fork).
Task 6 depends on Task 3 (fork exists).
Task 7 depends on Task 6 (manifest updated).
Task 8 is final verification.

```
Task 1 (org) → Task 2 (transfer) → Task 3 (fork)
                                         ↓
                                   Task 4 (sync workflow)
                                         ↓
                                   Task 5 (extension points)
                                         ↓
                                   Task 6 (manifest update)
                                         ↓
                                   Task 7 (sync command)
                                         ↓
                                   Task 8 (e2e verify)
```
