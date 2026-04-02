import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const packageJson = require("../package.json") as { version: string }

export function ottoVersion(): string {
  return packageJson.version
}

export { MANIFEST, OPENCODE_CONFIG_DIR, KIMAKI_DATA_DIR } from "./manifest.js"
export { getInstalledVersion, detectPackage } from "./detect.js"
export type { InstalledPackage } from "./detect.js"
export { mergePlugins, readOpenCodeConfig, writeOpenCodeConfig, ensureAgentMemoryConfig } from "./config.js"
export type { OpenCodeConfig } from "./config.js"
export { installPackage, upgradePackage, installMissingPackages } from "./installer.js"
export type { UpgradeMode } from "./installer.js"
export { hasKimakiBinary, isKimakiRunning, restartKimaki } from "./lifecycle.js"
export { checkPackagePresence, checkConfigHealth, checkDirectoryHealth } from "./health.js"
export type { HealthResult, PackageCheck, ConfigHealth } from "./health.js"
