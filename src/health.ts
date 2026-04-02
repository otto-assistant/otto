import fs from "node:fs"
import path from "node:path"
import { getInstalledVersion } from "./detect.js"
import { readOpenCodeConfig } from "./config.js"
import { MANIFEST, OPENCODE_CONFIG_DIR, KIMAKI_DATA_DIR } from "./manifest.js"
import { isKimakiRunning } from "./lifecycle.js"

export interface HealthResult {
  name: string
  status: "ok" | "warn" | "error"
  message: string
}

export interface PackageCheck {
  name: string
  installed: string | null
  required: string
  status: "ok" | "missing"
}

export function checkPackagePresence(): PackageCheck[] {
  return Object.entries(MANIFEST.packages).map(([name, required]) => {
    const installed = getInstalledVersion(name)
    return { name, installed, required, status: installed ? ("ok" as const) : ("missing" as const) }
  })
}

export interface ConfigHealth {
  opencodeJson: "ok" | "missing" | "error"
  agentMemoryJson: "ok" | "missing"
  memoryPluginEnabled: boolean
  plugins: string[]
  kimakiRunning: boolean
}

export function checkConfigHealth(): ConfigHealth {
  const configDir = OPENCODE_CONFIG_DIR()
  const opencodeJsonPath = path.join(configDir, "opencode.json")
  const agentMemoryPath = path.join(configDir, "agent-memory.json")

  const opencodeJson: ConfigHealth["opencodeJson"] = fs.existsSync(opencodeJsonPath) ? "ok" : "missing"
  const agentMemoryJson: ConfigHealth["agentMemoryJson"] = fs.existsSync(agentMemoryPath) ? "ok" : "missing"

  const config = readOpenCodeConfig()
  const configuredPlugins = config.plugin ?? []
  const memoryPluginEnabled = configuredPlugins.includes("opencode-agent-memory")
  const kimakiRunning = isKimakiRunning()

  return { opencodeJson, agentMemoryJson, memoryPluginEnabled, plugins: configuredPlugins, kimakiRunning }
}

export function checkDirectoryHealth(): HealthResult[] {
  const results: HealthResult[] = []
  const dirs = [
    { p: OPENCODE_CONFIG_DIR(), label: "opencode config dir" },
    { p: path.join(OPENCODE_CONFIG_DIR(), "memory"), label: "opencode memory dir" },
    { p: path.join(OPENCODE_CONFIG_DIR(), "journal"), label: "opencode journal dir" },
    { p: KIMAKI_DATA_DIR(), label: "kimaki data dir" },
  ]

  for (const { p, label } of dirs) {
    if (fs.existsSync(p)) {
      results.push({ name: label, status: "ok", message: `exists: ${p}` })
    } else {
      results.push({ name: label, status: "warn", message: `missing: ${p}` })
    }
  }
  return results
}
