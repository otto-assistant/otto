import fs from "node:fs"
import path from "node:path"

export type TenantMode = "safe" | "admin"

export interface TenantInitResult {
  created: string[]
}

function getLeafName(inputPath: string): string {
  const normalized = path.resolve(inputPath)
  const base = path.basename(normalized)
  return base || "tenant"
}

export function deriveComposeProjectName(tenantPath: string): string {
  return `otto-${getLeafName(tenantPath)}`
}

export function resolveTenantImage(input: { composeImage: string; envImage?: string }): string {
  return input.envImage?.trim() || input.composeImage
}

export function resolveTenantMode(mode?: string): TenantMode {
  return mode?.trim().toLowerCase() === "admin" ? "admin" : "safe"
}

function ensureDir(dirPath: string): boolean {
  if (fs.existsSync(dirPath)) return false
  fs.mkdirSync(dirPath, { recursive: true })
  return true
}

function ensureFile(filePath: string): boolean {
  if (fs.existsSync(filePath)) return false
  fs.writeFileSync(filePath, "", "utf-8")
  return true
}

export function ensureTenantMemoryLayout(memoryPath: string): TenantInitResult {
  const created: string[] = []
  ensureDir(memoryPath)

  const mempalacePath = path.join(memoryPath, "mempalace")
  if (ensureDir(mempalacePath)) created.push("mempalace/")

  const kimakiPath = path.join(memoryPath, "kimaki")
  if (ensureDir(kimakiPath)) created.push("kimaki/")

  const opencodePath = path.join(memoryPath, "opencode")
  if (ensureDir(opencodePath)) created.push("opencode/")

  for (const fileName of ["AGENTS.md", "soul.md", "persona.md"]) {
    const filePath = path.join(memoryPath, fileName)
    if (ensureFile(filePath)) created.push(fileName)
  }

  return { created }
}

export function ensureTenantScaffold(tenantPath: string): TenantInitResult {
  const created: string[] = []
  ensureDir(tenantPath)

  const projectsPath = path.join(tenantPath, "projects")
  if (ensureDir(projectsPath)) created.push("projects/")

  const memoryPath = path.join(tenantPath, "memory")
  if (ensureDir(memoryPath)) created.push("memory/")
  const memoryResult = ensureTenantMemoryLayout(memoryPath)
  created.push(...memoryResult.created)

  const composePath = path.join(tenantPath, "compose.yml")
  if (ensureFile(composePath)) {
    const projectName = deriveComposeProjectName(tenantPath)
    const compose = [
      "services:",
      "  otto:",
      "    image: ghcr.io/otto-assistant/otto:stable",
      "    env_file:",
      "      - .env",
      "    volumes:",
      "      - ./projects:/workspace/projects",
      "      - ./memory:/workspace/memory",
      "      - ./memory/kimaki:/root/.kimaki",
      "      - ./memory/opencode:/root/.config/opencode",
      "    working_dir: /workspace",
      "    restart: unless-stopped",
      "",
    ].join("\n")
    fs.writeFileSync(composePath, compose, "utf-8")
    created.push("compose.yml")

    const envPath = path.join(tenantPath, ".env")
    const envContent = [
      `COMPOSE_PROJECT_NAME=${projectName}`,
      "",
      "# ===== Required =====",
      "# Discord bot token — https://discord.com/developers/applications",
      "# Kimaki reads this env var in non-interactive/headless mode",
      "KIMAKI_BOT_TOKEN=",
      "",
      "# AI provider (choose one)",
      "# OPENAI_API_KEY=sk-...",
      "# ANTHROPIC_API_KEY=sk-ant-...",
      "# GOOGLE_API_KEY=...",
      "",
      "# ===== Optional =====",
      "# Runtime mode: safe (default) or admin (elevated host access)",
      "OTTO_MODE=safe",
      "",
    ].join("\n")
    if (ensureFile(envPath)) {
      fs.writeFileSync(envPath, envContent, "utf-8")
      created.push(".env")
    }
  }

  return { created }
}
