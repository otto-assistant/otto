import fs from "node:fs"
import path from "node:path"
import { OPENCODE_CONFIG_DIR } from "./manifest.js"

export interface OpenCodeConfig {
  $schema?: string
  model?: string
  plugin?: string[]
  provider?: Record<string, unknown>
  agent?: Record<string, unknown>
  [key: string]: unknown
}

export function mergePlugins(config: OpenCodeConfig, pluginToAdd: string): OpenCodeConfig {
  const plugins = config.plugin ?? []
  if (plugins.includes(pluginToAdd)) {
    return config
  }
  return { ...config, plugin: [...plugins, pluginToAdd] }
}

export function readOpenCodeConfig(dir?: string): OpenCodeConfig {
  const configDir = dir ?? OPENCODE_CONFIG_DIR()
  const configPath = path.join(configDir, "opencode.json")
  try {
    const raw = fs.readFileSync(configPath, "utf-8")
    return JSON.parse(raw) as OpenCodeConfig
  } catch {
    return {}
  }
}

export function writeOpenCodeConfig(config: OpenCodeConfig, dir?: string): boolean {
  const configDir = dir ?? OPENCODE_CONFIG_DIR()
  const configPath = path.join(configDir, "opencode.json")

  let existing: string | null = null
  try {
    existing = fs.readFileSync(configPath, "utf-8")
  } catch {
    // file doesn't exist
  }

  const newContent = JSON.stringify(config, null, 2) + "\n"
  if (existing === newContent) {
    return false
  }

  fs.mkdirSync(configDir, { recursive: true })
  fs.writeFileSync(configPath, newContent, "utf-8")
  return true
}

export function ensureAgentMemoryConfig(dir?: string): boolean {
  const configDir = dir ?? OPENCODE_CONFIG_DIR()
  const configPath = path.join(configDir, "agent-memory.json")

  try {
    fs.readFileSync(configPath, "utf-8")
    return false
  } catch {
    // create with defaults
  }

  const defaults = {
    journal: {
      enabled: true,
      tags: [
        { name: "infra", description: "Infrastructure changes, host/service topology, runtime environment" },
        { name: "debugging", description: "Bug investigations, root-cause analysis, and troubleshooting" },
        { name: "decision", description: "Architecture and implementation decisions with rationale" },
        { name: "incident", description: "Service failures, outages, and recovery actions" },
        { name: "automation", description: "Agent workflows, scripts, and repeatable operational routines" },
      ],
    },
  }

  fs.mkdirSync(configDir, { recursive: true })
  fs.writeFileSync(configPath, JSON.stringify(defaults, null, 2) + "\n", "utf-8")
  return true
}
