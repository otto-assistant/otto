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
import fs from "node:fs"
import path from "node:path"
import { hasKimakiBinary, restartKimaki } from "./lifecycle.js"
import { checkPackagePresence, checkConfigHealth, checkDirectoryHealth, checkTenantHealth } from "./health.js"
import { syncUpstreams } from "./sync.js"
import { runCompose } from "./docker.js"
import { ensureTenantScaffold, resolveTenantMode } from "./tenant.js"
import {
  searchSkills,
  getAllIndexedSkills,
  listInstalledSkills,
  installSkillFromIndex,
  removeSkill,
  ensureSkillsIndex,
  getConfiguredRepos,
  loadSkillsIndex,
  DEFAULT_SKILL_REPOS,
  type SkillIndexEntry,
  type SkillMeta,
} from "./skills.js"

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

  // 5. Install Otto-core skills from skills repo (best-effort)
  try {
    ensureSkillsIndex()
    const allSkills = getAllIndexedSkills()
    const installedSkillNames = new Set(listInstalledSkills().map((s) => s.name))
    const coreSkills = allSkills.filter(
      (s) => s.source === "otto-assistant/skills" && !installedSkillNames.has(s.name),
    )
    for (const skill of coreSkills) {
      const ok = installSkillFromIndex(skill.name)
      if (ok) console.log(`Installed skill: ${skill.name}`)
    }
  } catch {
    console.log("⚠ Could not fetch skills from GitHub (offline?). Skipping.")
  }

  // 6. Restart kimaki if needed — but NOT if running inside kimaki
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

  console.log("\nSkills:")
  const skillsInstalled = listInstalledSkills()
  console.log(`  installed: ${skillsInstalled.length > 0 ? skillsInstalled.map((s) => s.name).join(", ") : "(none)"}`)
  try {
    const index = loadSkillsIndex()
    const repoCount = Object.keys(index.repos).length
    const totalIndexed = getAllIndexedSkills().length
    console.log(`  indexed: ${totalIndexed} skills from ${repoCount} repos`)
  } catch {
    console.log("  indexed: (unavailable)")
  }
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
    console.log("  ✓ mempalace plugin enabled")
  } else {
    console.log("  ✗ mempalace plugin NOT enabled — run `otto install`")
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

  console.log("\nChecking skills...")
  const skillsInstalled = listInstalledSkills()
  if (skillsInstalled.length > 0) {
    console.log(`  ✓ ${skillsInstalled.length} skill(s) installed`)
  } else {
    console.log("  ⚠ No skills installed — run `otto skills add --all`")
  }
  try {
    const totalIndexed = getAllIndexedSkills().length
    if (totalIndexed > 0) {
      console.log(`  ✓ Skills index available (${totalIndexed} skills)`)
    } else {
      console.log("  ⚠ Skills index empty — run `otto skills update`")
    }
  } catch {
    console.log("  ⚠ Skills index unavailable")
  }

  console.log(hasErrors ? "\n✗ Issues found. Run `otto install` to fix." : "\n✓ All checks passed!")
}

// ---------------------------------------------------------------------------
// otto skills sub-commands
// ---------------------------------------------------------------------------

async function cmdSkills(subArgs: string[]): Promise<void> {
  const skillCommand = subArgs[0] ?? ""

  switch (skillCommand) {
    case "list":
      cmdSkillsList()
      break
    case "search": {
      const query = subArgs.slice(1).join(" ")
      if (!query) {
        console.log("Usage: otto skills search <query>")
        process.exit(1)
      }
      cmdSkillsSearch(query)
      break
    }
    case "browse":
      cmdSkillsBrowse()
      break
    case "add": {
      const arg = subArgs[1]
      if (!arg || arg === "--all") {
        await cmdSkillsAddAll()
      } else {
        await cmdSkillsAddOne(arg)
      }
      break
    }
    case "remove": {
      const name = subArgs[1]
      if (!name) {
        console.log("Usage: otto skills remove <name>")
        process.exit(1)
      }
      cmdSkillsRemove(name)
      break
    }
    case "update":
      cmdSkillsUpdate()
      break
    case "repos":
      cmdSkillsRepos()
      break
    default:
      console.log(`Otto skills — discover and install agent skills from public repos

Usage:
  otto skills search <query>     Search skills by name/description
  otto skills browse             Browse all available skills
  otto skills list               List installed skills
  otto skills add <name>         Install a skill
  otto skills add --all          Install all skills from otto-assistant/skills
  otto skills update             Refresh skills index from GitHub
  otto skills remove <name>      Remove an installed skill
  otto skills repos              Show configured skill repositories
`)
      break
  }
}

function cmdSkillsSearch(query: string): void {
  console.log(`Searching: "${query}"\n`)

  const { refreshed } = ensureSkillsIndex()
  if (refreshed > 0) {
    console.log(`Updated index (${refreshed} repo(s) refreshed).\n`)
  }

  const results = searchSkills(query)
  if (results.length === 0) {
    console.log("No skills found.")
    return
  }

  for (const skill of results) {
    console.log(`  ${skill.name} — ${skill.description}`)
    console.log(`    source: ${skill.source}`)
  }

  console.log(`\n${results.length} skill(s) found. Install with: otto skills add <name>`)
}

function cmdSkillsBrowse(): void {
  console.log("Otto skills — browsing all available\n")

  const { refreshed } = ensureSkillsIndex()
  if (refreshed > 0) {
    console.log(`Updated index (${refreshed} repo(s) refreshed).\n`)
  }

  const allSkills = getAllIndexedSkills()
  const installed = new Set(listInstalledSkills().map((s) => s.name))

  // Group by source repo
  const byRepo: Record<string, SkillIndexEntry[]> = {}
  for (const skill of allSkills) {
    if (!byRepo[skill.source]) byRepo[skill.source] = []
    byRepo[skill.source].push(skill)
  }

  for (const [repo, skills] of Object.entries(byRepo)) {
    console.log(`${repo} (${skills.length} skills):`)
    for (const skill of skills) {
      const icon = installed.has(skill.name) ? "✓" : "•"
      console.log(`  ${icon} ${skill.name} — ${skill.description}`)
    }
    console.log()
  }

  const totalAvailable = allSkills.filter((s) => !installed.has(s.name)).length
  console.log(`${allSkills.length} total, ${totalAvailable} available to install.`)
}

function cmdSkillsList(): void {
  console.log("Otto skills\n")

  const installed = listInstalledSkills()
  if (installed.length > 0) {
    console.log("Installed:")
    for (const s of installed) {
      console.log(`  ✓ ${s.name} — ${s.description}`)
    }
  } else {
    console.log("Installed: (none)")
  }

  console.log(`\nUse "otto skills browse" to see all available skills.`)
  console.log(`Use "otto skills search <query>" to search.`)
}

async function cmdSkillsAddOne(name: string): Promise<void> {
  console.log(`Installing skill: ${name}\n`)

  ensureSkillsIndex()

  const success = installSkillFromIndex(name)
  if (!success) {
    console.error(`Error: skill "${name}" not found. Run "otto skills search <query>" to find skills.`)
    process.exit(1)
  }

  console.log(`Installed ${name} → ~/.config/opencode/skills/${name}/`)
  console.log("Done!")
}

async function cmdSkillsAddAll(): Promise<void> {
  console.log("Installing all skills from otto-assistant/skills...\n")

  ensureSkillsIndex()
  const allSkills = getAllIndexedSkills()
  const ottoSkills = allSkills.filter((s) => s.source === "otto-assistant/skills")

  if (ottoSkills.length === 0) {
    console.log("No skills found in otto-assistant/skills. Check your connection.")
    return
  }

  const installed = new Set(listInstalledSkills().map((s) => s.name))
  let added = 0

  for (const skill of ottoSkills) {
    if (installed.has(skill.name)) {
      console.log(`  ✓ ${skill.name} (already installed)`)
      continue
    }
    const success = installSkillFromIndex(skill.name)
    if (success) {
      console.log(`  + ${skill.name}`)
      added++
    } else {
      console.log(`  ✗ ${skill.name} (failed)`)
    }
  }

  if (added === 0) {
    console.log("\nAll skills already installed.")
  } else {
    console.log(`\nInstalled ${added} skill(s).`)
  }
  console.log("Done!")
}

function cmdSkillsUpdate(): void {
  console.log("Refreshing skills index from GitHub...\n")

  const { refreshed, total } = ensureSkillsIndex(0) // force refresh all

  if (refreshed === 0 && total === 0) {
    console.log("No repos configured.")
    return
  }

  console.log(`Refreshed ${refreshed}/${total} repo(s).`)

  const allSkills = getAllIndexedSkills()
  console.log(`Index now has ${allSkills.length} skills.`)
  console.log("Done!")
}

function cmdSkillsRemove(name: string): void {
  console.log(`Removing skill: ${name}\n`)

  const success = removeSkill(name)
  if (!success) {
    console.error(`Error: skill "${name}" is not installed.`)
    process.exit(1)
  }

  console.log(`Removed ${name}.`)
  console.log("Done!")
}

function cmdSkillsRepos(): void {
  console.log("Configured skill repositories:\n")

  const repos = getConfiguredRepos()
  for (const repo of repos) {
    console.log(`  ${repo}`)
  }

  console.log(`\n${repos.length} repo(s) configured.`)
}

async function cmdTenant(subArgs: string[]): Promise<void> {
  const tenantCommand = subArgs[0] ?? ""
  const tenantPathArg = subArgs[1]

  if (!tenantPathArg) {
    console.log("Usage: otto tenant <init|up|down|status|logs> <path>")
    process.exit(1)
  }

  const tenantPath = path.resolve(tenantPathArg)

  switch (tenantCommand) {
    case "init": {
      const result = ensureTenantScaffold(tenantPath)
      if (result.created.length === 0) {
        console.log(`Tenant scaffold already exists: ${tenantPath}`)
      } else {
        console.log(`Tenant scaffold ready: ${tenantPath}`)
        console.log(`Created: ${result.created.join(", ")}`)
      }
      return
    }
    case "up": {
      const mode = resolveTenantMode(process.env.OTTO_MODE)
      if (mode === "admin") {
        console.log("⚠ OTTO_MODE=admin enabled: tenant has elevated runtime profile.")
      }
      runCompose(tenantPath, ["up", "-d"])
      return
    }
    case "down":
      runCompose(tenantPath, ["down"])
      return
    case "logs": {
      const follow = subArgs.includes("--follow") ? ["--follow"] : []
      runCompose(tenantPath, ["logs", ...follow])
      return
    }
    case "status": {
      const health = checkTenantHealth({ tenantPath })
      console.log(`Tenant status: ${tenantPath}`)
      for (const item of health) {
        const icon = item.status === "ok" ? "✓" : item.status === "warn" ? "⚠" : "✗"
        console.log(`  ${icon} ${item.name}: ${item.message}`)
      }
      const composeExists = fs.existsSync(path.join(tenantPath, "compose.yml"))
      if (composeExists) {
        try {
          runCompose(tenantPath, ["ps"])
        } catch {
          console.log("  ⚠ docker compose ps failed")
        }
      }
      return
    }
    default:
      console.log("Usage: otto tenant <init|up|down|status|logs> <path>")
      process.exit(1)
  }
}

// ---------------------------------------------------------------------------
// Main router
// ---------------------------------------------------------------------------

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
    case "sync":
      await syncUpstreams()
      break
    case "skills":
      await cmdSkills(args.slice(1))
      break
    case "tenant":
      await cmdTenant(args.slice(1))
      break
    default:
      console.log(`Otto — terminal UI distribution for opencode + kimaki + mempalace

Usage:
  otto tenant init <path>   Create compose-first tenant scaffold
  otto tenant up <path>     Start tenant with docker compose
  otto tenant down <path>   Stop tenant with docker compose
  otto tenant status <path> Show tenant preflight + compose status
  otto tenant logs <path>   Show tenant logs (add --follow)

  otto install              Legacy: install missing npm packages + configure
  otto upgrade              Legacy: upgrade to stable (manifest-pinned) versions
  otto upgrade stable       Legacy: upgrade to manifest-pinned versions
  otto upgrade latest       Legacy: upgrade to npm latest versions
  otto status               Show installed versions + config health
  otto doctor               Validate all integration points
  otto sync                 Trigger upstream sync for all forked repos
  otto skills search <q>    Search skills across public repos
  otto skills browse        Browse all available skills
  otto skills list          List installed skills
  otto skills add <name>    Install a skill
  otto skills add --all     Install all skills from otto-assistant/skills
  otto skills update        Refresh skills index
  otto skills remove <name> Remove an installed skill
  otto skills repos         Show configured skill repositories
`)
      break
  }
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err)
  console.error(`Error: ${msg}`)
  process.exit(1)
})
