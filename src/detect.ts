import { execSync } from "node:child_process"

export interface InstalledPackage {
  name: string
  installed: string | null
}

export function getInstalledVersion(packageName: string): string | null {
  try {
    const output = execSync(`npm list -g ${packageName} --json --depth=0`, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    })
    const parsed = JSON.parse(output)
    const deps = parsed.dependencies ?? {}
    const pkg = deps[packageName]
    if (pkg?.version) {
      return pkg.version
    }
    return null
  } catch {
    return null
  }
}

export async function detectPackage(name: string): Promise<InstalledPackage> {
  return {
    name,
    installed: getInstalledVersion(name),
  }
}
