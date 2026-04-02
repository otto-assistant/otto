#!/usr/bin/env node

import { MANIFEST } from "./manifest.js"
import { getInstalledVersion } from "./detect.js"
import { readOpenCodeConfig, writeOpenCodeConfig, ensureAgentMemoryConfig, mergePlugins } from "./config.js"
import { installMissingPackages, upgradePackage } from "./installer.js"
import { hasKimakiBinary, restartKimaki } from "./lifecycle.js"
import { checkPackagePresence, checkConfigHealth, checkDirectoryHealth } from "./health.js"

const args = process.argv.slice(2)
const command = args[0] ?? ""
const subCommand = args[1] ?? ""

async function cmdInstall(): Promise<void> {
  console.log("Otto install — conservative mode\n")

  // 1. Install missing global npm packages (CLI tools only)
  const installed = installMissingPackages(getInstalledVersion)
  if (installed.length > 0) {
    console.log(`Installed: ${installed.join(", ")}`)
  } else {
    console.log("All packages already installed.")
  }

  // 2. Merge plugins into opencode.json (opencode resolves them from npm itself)
  let configChanged = false
  const config = readOpenCodeConfig()
  let merged = config
  for (const plugin of MANIFEST.plugins) {
    merged = mergePlugins(merged, plugin)
  }
  configChanged = writeOpenCodeConfig(merged) || configChanged

  if (configChanged) {
    console.log(`Updated opencode.json — added plugins: ${MANIFEST.plugins.join(", ")}`)
  }

  // 3. Ensure agent-memory.json exists
  const created = ensureAgentMemoryConfig()
  if (created) {
    console.log("Created agent-memory.json with defaults")
  }

  // 4. Restart kimaki if needed — but NOT if running inside kimaki
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

  // Show plan
  console.log("Will upgrade:")
  for (const name of Object.keys(MANIFEST.packages)) {
    const current = getInstalledVersion(name)
    const target = mode === "stable"
      ? MANIFEST.pinned[name]
      : "latest"
    console.log(`  ${name}: ${current ?? "not installed"} → ${target}`)
  }

  // Upgrade
  for (const name of Object.keys(MANIFEST.packages)) {
    console.log(`Upgrading ${name}...`)
    upgradePackage(name, mode)
  }

  // Ensure plugins are in config
  const config = readOpenCodeConfig()
  let merged = config
  for (const plugin of MANIFEST.plugins) {
    merged = mergePlugins(merged, plugin)
  }
  writeOpenCodeConfig(merged)

  // Restart — but NOT inside kimaki session
  const runningInsideKimaki = !!process.env.KIMAKI
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
  console.log(`  plugins: ${configHealth.plugins.length > 0 ? configHealth.plugins.join(", ") : "(none)"}`)
  console.log(`  memory plugin: ${configHealth.memoryPluginEnabled ? "enabled" : "NOT enabled"}`)
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
  if (configHealth.memoryPluginEnabled) {
    console.log("  ✓ opencode-agent-memory plugin enabled")
  } else {
    console.log("  ✗ opencode-agent-memory plugin NOT enabled — run `otto install`")
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
    if (d.status !== "ok") hasErrors = true
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
