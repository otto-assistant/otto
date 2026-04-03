import { execSync } from "node:child_process"
import { MANIFEST } from "./manifest.js"

export type UpgradeMode = "stable" | "latest"

export function installPackage(name: string, version?: string): string {
  const spec = version ? `${name}@${version}` : name
  execSync(`npm install -g ${spec}`, {
    encoding: "utf-8",
    stdio: "pipe",
  })
  return spec
}

export function upgradePackage(name: string, mode: UpgradeMode): string {
  if (mode === "stable") {
    const pinned = MANIFEST.pinned[name]
    if (!pinned) {
      throw new Error(`No pinned version for ${name} in manifest`)
    }
    return installPackage(name, pinned)
  }
  return installPackage(name, "latest")
}

export function planStableUpgrades(
  packageNames: string[],
  getInstalled: (name: string) => string | null,
  pinned: Record<string, string>,
): { name: string; current: string | null; target: string }[] {
  const upgrades: { name: string; current: string | null; target: string }[] = []
  for (const name of packageNames) {
    const target = pinned[name]
    if (!target) {
      throw new Error(`No pinned version for ${name} in manifest`)
    }
    const current = getInstalled(name)
    if (current !== target) {
      upgrades.push({ name, current, target })
    }
  }
  return upgrades
}

export function installMissingPackages(
  getInstalled: (name: string) => string | null,
  install: (name: string, version?: string) => string = installPackage,
): string[] {
  const installed: string[] = []
  for (const name of Object.keys(MANIFEST.packages)) {
    const current = getInstalled(name)
    if (!current) {
      const pinned = MANIFEST.pinned[name]
      if (!pinned) {
        throw new Error(`No pinned version for ${name} in manifest`)
      }
      install(name, pinned)
      installed.push(name)
    }
  }
  return installed
}
