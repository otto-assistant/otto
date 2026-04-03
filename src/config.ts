import fs from "node:fs"
import path from "node:path"
import { OPENCODE_CONFIG_DIR } from "./manifest.js"

export interface OttoSubagentThreads {
  enabled?: boolean
  askBeforeDelete?: boolean
  autoDeleteOnComplete?: boolean
}

export interface OttoConfig {
  subagentThreads: {
    enabled: boolean
    askBeforeDelete: boolean
    autoDeleteOnComplete: boolean
  }
}

/** Defaults used when otto.json is missing or partial. */
export const OTTO_DEFAULTS: OttoConfig = {
  subagentThreads: {
    enabled: true,
    askBeforeDelete: true,
    autoDeleteOnComplete: false,
  },
}

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

// ---------------------------------------------------------------------------
// Otto's own config (stored in ~/.config/opencode/otto.json, NOT opencode.json)
// opencode rejects unknown keys in its config — Otto must not pollute it.
// ---------------------------------------------------------------------------

export type OttoConfigReadStatus = "missing" | "ok" | "invalid"

export function readOttoConfig(dir?: string): OttoConfig {
  const configDir = dir ?? OPENCODE_CONFIG_DIR()
  const configPath = path.join(configDir, "otto.json")
  try {
    const raw = fs.readFileSync(configPath, "utf-8")
    const parsed = JSON.parse(raw) as Partial<OttoConfig>
    return {
      subagentThreads: {
        enabled: parsed.subagentThreads?.enabled ?? OTTO_DEFAULTS.subagentThreads.enabled,
        askBeforeDelete: parsed.subagentThreads?.askBeforeDelete ?? OTTO_DEFAULTS.subagentThreads.askBeforeDelete,
        autoDeleteOnComplete: parsed.subagentThreads?.autoDeleteOnComplete ?? OTTO_DEFAULTS.subagentThreads.autoDeleteOnComplete,
      },
    }
  } catch {
    return { ...OTTO_DEFAULTS }
  }
}

export function writeOttoConfig(config: OttoConfig, dir?: string): boolean {
  const configDir = dir ?? OPENCODE_CONFIG_DIR()
  const configPath = path.join(configDir, "otto.json")

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

export function buildSubagentThreadPolicy(ottoConfig: OttoConfig): string {
  const policy = ottoConfig.subagentThreads
  const enabled = policy.enabled
  const askBeforeDelete = policy.askBeforeDelete
  const autoDeleteOnComplete = policy.autoDeleteOnComplete

  const lines = [
    "Otto subagent policy (must follow):",
    `- subagent_threads_enabled: ${enabled}`,
    `- subagent_threads_ask_before_delete: ${askBeforeDelete}`,
    `- subagent_threads_auto_delete_on_complete: ${autoDeleteOnComplete}`,
  ]

  if (!enabled) {
    lines.push(
      "- subagent_threads_enabled is false — you may spawn subagents normally (Task tool or otherwise) without creating Discord threads.",
    )
    return lines.join("\n")
  }

  lines.push(
    "",
    "## Spawning subagents with Discord threads",
    "",
    "When you need to spawn a subagent (parallel task, background investigation, etc.), do NOT use the Task tool directly.",
    "Instead, create a visible Discord thread using `kimaki send` via Bash:",
    "",
    "```bash",
    'kimaki send --channel <channel_id> --prompt "detailed task description" --user "<username>"',
    "```",
    "",
    "The channel_id and username are in your system prompt (\"Your current Discord channel ID\" / \"Discord\" user field).",
    "",
    "For sequential tasks where you need the result before continuing, use --wait (set Bash timeout to 1_500_000+):",
    "```bash",
    'kimaki send --channel <channel_id> --prompt "task" --user "<username>" --wait',
    "```",
    "",
    "## After subagent completes",
    "",
  )

  if (autoDeleteOnComplete) {
    lines.push(
      "- subagent_threads_auto_delete_on_complete is true → automatically archive the thread after the subagent finishes:",
      "  ```bash",
      '  kimaki session archive --session <session_id>',
      "  ```",
    )
  } else if (askBeforeDelete) {
    lines.push(
      "- subagent_threads_ask_before_delete is true → after the subagent finishes, ask the user:",
      '  "Subagent thread created. Should I archive it or keep it open?"',
      "  If user says archive → `kimaki session archive --session <session_id>`",
    )
  } else {
    lines.push(
      "- Keep the subagent thread open after completion (no auto-archive, no prompt).",
    )
  }

  lines.push(
    "",
    "## Required: load skills before subagent execution",
    "",
    "Before dispatching any subagent, load the skill: `otto-subagent-threads`.",
    "This ensures the subagent follows the same thread creation rules if it spawns further subagents.",
  )

  return lines.join("\n")
}

export function mergeAgentPrompts(config: OpenCodeConfig, policyText: string): OpenCodeConfig {
  const marker = "Otto subagent policy (must follow):"
  const agent = (config.agent ?? {}) as Record<string, unknown>
  const entries = Object.entries(agent)

  if (entries.length === 0) {
    return {
      ...config,
      agent: {
        build: { prompt: policyText },
      },
    }
  }

  const nextAgent: Record<string, unknown> = {}
  for (const [name, value] of entries) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const typed = value as Record<string, unknown>
      const existingPrompt = typeof typed.prompt === "string" ? typed.prompt : ""
      const hasPolicy = existingPrompt.includes(marker)
      nextAgent[name] = {
        ...typed,
        prompt: hasPolicy
          ? existingPrompt
          : (existingPrompt.length > 0 ? `${existingPrompt}\n\n${policyText}` : policyText),
      }
    } else {
      nextAgent[name] = value
    }
  }

  return { ...config, agent: nextAgent }
}

export type OpenCodeConfigReadStatus = "missing" | "ok" | "invalid"

/** Distinguishes a missing file from invalid JSON (both previously surfaced as `{}`). */
export function readOpenCodeConfigState(dir?: string): {
  config: OpenCodeConfig
  status: OpenCodeConfigReadStatus
} {
  const configDir = dir ?? OPENCODE_CONFIG_DIR()
  const configPath = path.join(configDir, "opencode.json")
  if (!fs.existsSync(configPath)) {
    return { config: {}, status: "missing" }
  }
  try {
    const raw = fs.readFileSync(configPath, "utf-8")
    return { config: JSON.parse(raw) as OpenCodeConfig, status: "ok" }
  } catch {
    return { config: {}, status: "invalid" }
  }
}

export function readOpenCodeConfig(dir?: string): OpenCodeConfig {
  return readOpenCodeConfigState(dir).config
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

// ---------------------------------------------------------------------------
// Skill file: otto-subagent-threads
// ---------------------------------------------------------------------------

const SKILL_NAME = "otto-subagent-threads"

const SKILL_MD = `---
name: otto-subagent-threads
description: Enforce visible Discord threads for every subagent spawn. Use before dispatching any subagent via kimaki send.
---

# Otto Subagent Threads

## When to Use

Use this skill EVERY TIME you are about to spawn a subagent (parallel task, background investigation, code review, etc.).

## Rules

### 1. NEVER use Task tool directly for subagents

The Task tool spawns a subagent in "shadow mode" — invisible to the user in Discord.
Instead, create a visible Discord thread.

### 2. Create a Discord thread with kimaki send

\`\`\`bash
kimaki send --channel <channel_id> --prompt "detailed task description" --user "<username>"
\`\`\`

Get channel_id and username from your system prompt:
- "Your current Discord channel ID is: ..."
- Discord user info section

### 3. Wait for result if needed

If you need the subagent's output before continuing, add \`--wait\` and set Bash timeout to 1_500_000+:

\`\`\`bash
kimaki send --channel <channel_id> --prompt "task" --user "<username>" --wait
\`\`\`

### 4. After subagent completes

Check the otto.subagentThreads config:
- **autoDeleteOnComplete = true** → archive the thread:
  \`\`\`bash
  kimaki session archive --session <session_id>
  \`\`\`
- **askBeforeDelete = true** → ask the user:
  "Subagent finished. Should I archive the thread or keep it open?"
- **both false** → keep the thread open.

### 5. Nested subagents

If your subagent itself needs to spawn further subagents, include these same rules in its prompt so it also creates visible threads.

## Quick Reference

| Scenario | Command |
|----------|---------|
| Parallel task (fire & forget) | \`kimaki send -c <ch> -p "task" -u <user>\` |
| Sequential task (need result) | \`kimaki send -c <ch> -p "task" -u <user> --wait\` |
| Archive thread | \`kimaki session archive -s <session_id>\` |
| List sessions | \`kimaki session list\` |
| Read session output | \`kimaki session read <session_id> > ./tmp/session.md 2>/dev/null\` |

## Anti-patterns

- **DO NOT** use the Task tool to spawn subagents (creates invisible shadow sessions).
- **DO NOT** create worktrees (\`--worktree\`) unless the user explicitly asks.
- **DO NOT** forget to include your channel_id in the kimaki send command.
`

export function ensureSubagentThreadSkill(dir?: string): boolean {
  const configDir = dir ?? OPENCODE_CONFIG_DIR()
  const skillDir = path.join(configDir, "skills", SKILL_NAME)
  const skillPath = path.join(skillDir, "SKILL.md")

  try {
    const existing = fs.readFileSync(skillPath, "utf-8")
    if (existing === SKILL_MD) {
      return false // already up to date
    }
  } catch {
    // file doesn't exist — will create
  }

  fs.mkdirSync(skillDir, { recursive: true })
  fs.writeFileSync(skillPath, SKILL_MD, "utf-8")
  return true
}
