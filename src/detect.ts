import { execFileSync } from "node:child_process"

export interface InstalledPackage {
  name: string
  installed: string | null
}

let globalVersionCache: Map<string, string> | null = null

function loadGlobalPackageVersions(): Map<string, string> {
  if (globalVersionCache) {
    return globalVersionCache
  }
  const map = new Map<string, string>()
  try {
    const output = execFileSync(
      process.platform === "win32" ? "npm.cmd" : "npm",
      ["list", "-g", "--json", "--depth=0"],
      {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      },
    )
    const parsed = JSON.parse(output) as { dependencies?: Record<string, { version?: string }> }
    const deps = parsed.dependencies ?? {}
    for (const [name, info] of Object.entries(deps)) {
      if (info?.version) {
        map.set(name, info.version)
      }
    }
  } catch {
    // leave map empty — callers treat missing entries as not installed
  }
  globalVersionCache = map
  return map
}

/** For tests: reset cached `npm list -g` result between cases. */
export function clearGlobalNpmListCache(): void {
  globalVersionCache = null
}

export function getInstalledVersion(packageName: string): string | null {
  return loadGlobalPackageVersions().get(packageName) ?? null
}

export async function detectPackage(name: string): Promise<InstalledPackage> {
  return {
    name,
    installed: getInstalledVersion(name),
  }
}
