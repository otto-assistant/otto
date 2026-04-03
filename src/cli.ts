#!/usr/bin/env node

import { MANIFEST } from "./manifest.js"
import { getInstalledVersion } from "./detect.js"
import {
  readOpenCodeConfigState,
  writeOpenCodeConfig,
  ensureAgentMemoryConfig,
  ensureSubagentThreadSkill,
  mergePlugins,
  readOttoConfig,
  writeOttoConfig,
  buildSubagentThreadPolicy,
  mergeAgentPrompts,
  type OpenCodeConfig,
} from "./config.js"
import { installMissingPackages, upgradePackage, planStableUpgrades } from "./installer.js"
import { hasKimakiBinary, restartKimaki } from "./lifecycle.js"
import { checkPackagePresence, checkConfigHealth, checkDirectoryHealth } from "./health.js"

const args = process.argv.slice(2)
const command = args[0] ?? ""
const subCommand = args[1] ?? ""

function mergeOttoManagedConfig(config: OpenCodeConfig): OpenCodeConfig {
  let merged = config

  for (const plugin of MANIFEST.plugins) {
    merged = mergePlugins(merged, plugin)
  }

  // Read Otto's own config from otto.json (NOT from opencode.json)
  const ottoConfig = readOttoConfig()
  merged = mergeAgentPrompts(merged, buildSubagentThreadPolicy(ottoConfig))
  return merged
}

async function cmdInstall(): Promise<void> {
  console.log("Otto install — conservative mode\n")

  // 1. Install missing global npm packages (CLI tools only)
  const installed = installMissingPackages(getInstalledVersion)
  if (installed.length > 0) {
    console.log(`Installed: ${installed.join(", ")}`)
  } else {
    console.log("All packages already installed.")
  }

  // 2. Merge plugins + Otto policy into opencode.json
  let configChanged = false
  const { config, status } = readOpenCodeConfigState()
  if (status === "invalid") {
    console.error("Error: opencode.json exists but is not valid JSON. Fix the file, then run otto again.")
    process.exit(1)
  }

  // 2a. Ensure otto.json exists with defaults
  const ottoConfig = readOttoConfig()
  const ottoConfigChanged = writeOttoConfig(ottoConfig)

  // 2b. Merge plugins + policy into opencode.json (NO otto key!)
  const merged = mergeOttoManagedConfig(config)
  configChanged = writeOpenCodeConfig(merged) || configChanged

  if (configChanged) {
    console.log(`Updated opencode.json — added plugins: ${MANIFEST.plugins.join(", ")} + otto subagent policy`)
  }
  if (ottoConfigChanged) {
    console.log("Created otto.json with defaults")
  }

  // 3. Ensure agent-memory.json exists
  const created = ensureAgentMemoryConfig()
  if (created) {
    console.log("Created agent-memory.json with defaults")
  }

  // 4. Ensure otto-subagent-threads skill exists
  const skillCreated = ensureSubagentThreadSkill()
  if (skillCreated) {
    console.log("Created otto-subagent-threads skill")
  }

  // 5. Restart kimaki if needed — but NOT if running inside kimaki
  //    (kimaki restart kills the current opencode session)
  const runningInsideKimaki = !!process.env.KIMAKI
  if (configChanged || installed.length > 0) {
    if (runningInsideKimaki) {
      console.log("\n⚠ Changes require kimaki restart. Run `kimaki restart` manually when ready.")
    } else if (hasKimakiBinary()) {
      console.log("Restarting kimaki...")
      try {
        restartKimaki()
        console.log("Kimaki restarted.")
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error(`Warning: could not restart kimaki: ${msg}`)
      }
    }
  }

  console.log("\nDone!")
}

async function cmdUpgrade(mode: "stable" | "latest"): Promise<void> {
  console.log(`Otto upgrade — mode: ${mode}\n`)

  const packageNames = Object.keys(MANIFEST.packages)

  let didUpgradePackages = false

  if (mode === "stable") {
    const upgradePlan = planStableUpgrades(packageNames, getInstalledVersion, MANIFEST.pinned)
    if (upgradePlan.length === 0) {
      console.log("Nothing to upgrade — already at pinned stable versions.")
    } else {
      console.log("Will upgrade:")
      for (const { name, current, target } of upgradePlan) {
        console.log(`  ${name}: ${current ?? "not installed"} → ${target}`)
      }
      for (const { name } of upgradePlan) {
        console.log(`Upgrading ${name}...`)
        upgradePackage(name, mode)
      }
    }
    didUpgradePackages = upgradePlan.length > 0
  } else {
    console.log("Will upgrade:")
    for (const name of packageNames) {
      const current = getInstalledVersion(name)
      console.log(`  ${name}: ${current ?? "not installed"} → latest`)
    }
    for (const name of packageNames) {
      console.log(`Upgrading ${name}...`)
      upgradePackage(name, mode)
    }
    didUpgradePackages = packageNames.length > 0
  }

  // Ensure plugins + Otto policy are in config
  const { config, status } = readOpenCodeConfigState()
  if (status === "invalid") {
    console.error("Error: opencode.json exists but is not valid JSON. Fix the file, then run otto again.")
    process.exit(1)
  }

  // Ensure otto.json exists
  const ottoConfig = readOttoConfig()
  writeOttoConfig(ottoConfig)

  const merged = mergeOttoManagedConfig(config)
  const configChanged = writeOpenCodeConfig(merged)

  // Ensure skill file is up to date
  ensureSubagentThreadSkill()

  // Restart — but NOT inside kimaki session
  // Only restart if anything actually changed.
  const runningInsideKimaki = !!process.env.KIMAKI
  if (didUpgradePackages || configChanged) {
    if (runningInsideKimaki) {
      console.log("\n⚠ Changes require kimaki restart. Run `kimaki restart` manually when ready.")
    } else if (hasKimakiBinary()) {
      console.log("Restarting kimaki...")
      try {
        restartKimaki()
        console.log("Kimaki restarted.")
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error(`Warning: could not restart kimaki: ${msg}`)
      }
    }
  }

  console.log("\nDone!")
}

async function cmdStatus(): Promise<void> {
  console.log("Otto status\n")
  console.log(`Otto version: ${MANIFEST.version}\n`)

  console.log("Packages:")
  const packages = checkPackagePresence()
  for (const pkg of packages) {
    const icon = pkg.status === "ok" ? "✓" : "✗"
    console.log(`  ${icon} ${pkg.name}: ${pkg.installed ?? "not installed"} (requires ${pkg.required})`)
  }

  console.log("\nConfig:")
  const configHealth = checkConfigHealth()
  console.log(`  opencode.json: ${configHealth.opencodeJson}`)
  console.log(`  agent-memory.json: ${configHealth.agentMemoryJson}`)
  console.log(`  otto.json: ${configHealth.ottoJson}`)
  console.log(`  plugins: ${configHealth.plugins.length > 0 ? configHealth.plugins.join(", ") : "(none)"}`)
  console.log(`  memory plugin: ${configHealth.memoryPluginEnabled ? "enabled" : "NOT enabled"}`)
  console.log(`  subagent threads: ${configHealth.subagentThreadsEnabled ? "enabled" : "disabled"}`)
  console.log(`  ask before thread delete: ${configHealth.subagentThreadsAskBeforeDelete ? "yes" : "no"}`)
  console.log(`  auto delete thread on complete: ${configHealth.subagentThreadsAutoDelete ? "yes" : "no"}`)
  console.log(`  kimaki process: ${configHealth.kimakiRunning ? "running" : "not running"}`)
}

async function cmdDoctor(): Promise<void> {
  console.log("Otto doctor\n")

  let hasErrors = false

  console.log("Checking packages...")
  const packages = checkPackagePresence()
  for (const pkg of packages) {
    if (pkg.status === "missing") {
      console.log(`  ✗ ${pkg.name} — not installed (requires ${pkg.required})`)
      hasErrors = true
    } else {
      console.log(`  ✓ ${pkg.name}: ${pkg.installed}`)
    }
  }

  console.log("\nChecking config...")
  const configHealth = checkConfigHealth()
  if (configHealth.opencodeJson === "error") {
    console.log("  ✗ opencode.json is not valid JSON — fix syntax, then run `otto install`")
    hasErrors = true
  }
  if (configHealth.memoryPluginEnabled) {
    console.log("  ✓ opencode-agent-memory plugin enabled")
  } else {
    console.log("  ✗ opencode-agent-memory plugin NOT enabled — run `otto install`")
    hasErrors = true
  }
  if (configHealth.subagentPolicyInjected) {
    console.log("  ✓ otto subagent thread policy injected")
  } else {
    console.log("  ✗ otto subagent thread policy missing — run `otto install`")
    hasErrors = true
  }
  if (configHealth.kimakiRunning) {
    console.log("  ✓ kimaki is running")
  } else {
    console.log("  ⚠ kimaki is not running")
  }

  console.log("\nChecking directories...")
  const dirs = checkDirectoryHealth()
  for (const d of dirs) {
    const icon = d.status === "ok" ? "✓" : d.status === "warn" ? "⚠" : "✗"
    console.log(`  ${icon} ${d.name}: ${d.message}`)
    if (d.status === "error") hasErrors = true
  }

  console.log(hasErrors ? "\n✗ Issues found. Run `otto install` to fix." : "\n✓ All checks passed!")
}

async function main(): Promise<void> {
  switch (command) {
    case "install":
      await cmdInstall()
      break
    case "upgrade":
      await cmdUpgrade(subCommand === "latest" ? "latest" : "stable")
      break
    case "status":
      await cmdStatus()
      break
    case "doctor":
      await cmdDoctor()
      break
    default:
      console.log(`Otto — terminal UI distribution for opencode + kimaki + opencode-agent-memory

Usage:
  otto install            Install missing packages + configure
  otto upgrade            Upgrade to stable (manifest-pinned) versions
  otto upgrade stable     Upgrade to manifest-pinned versions
  otto upgrade latest     Upgrade to npm latest versions
  otto status             Show installed versions + config health
  otto doctor             Validate all integration points
`)
      break
  }
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err)
  console.error(`Error: ${msg}`)
  process.exit(1)
})
