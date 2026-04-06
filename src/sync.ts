import { execSync } from "node:child_process"
import { UPSTREAM_REPOS } from "./manifest.js"

interface SyncTarget {
  repo: string
  upstream: string
  branch: string
}

function getSyncTargets(): SyncTarget[] {
  return Object.entries(UPSTREAM_REPOS).map(([_pkgName, info]) => ({
    repo: info.repo,
    upstream: info.upstream,
    branch: "main",
  }))
}

export async function syncUpstreams(): Promise<void> {
  const targets = getSyncTargets()

  if (targets.length === 0) {
    console.log("No upstream repos configured for sync.")
    return
  }

  // Check gh CLI is available
  try {
    execSync("gh --version", { stdio: "pipe" })
  } catch {
    console.error("Error: gh CLI is required for sync. Install: https://cli.github.com/")
    process.exit(1)
  }

  console.log("Triggering upstream sync for all forked repos:\n")

  for (const target of targets) {
    console.log(`  ${target.repo} ← ${target.upstream}`)
    try {
      execSync(
        `gh workflow run sync-upstream.yml --repo ${target.repo} --ref ${target.branch}`,
        { stdio: "pipe" },
      )
      console.log(`    ✓ Sync triggered`)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`    ✗ Failed: ${msg}`)
    }
  }

  console.log("\nSync workflows triggered. Check status with: gh run list --repo <repo>")
}

export { getSyncTargets, UPSTREAM_REPOS }
