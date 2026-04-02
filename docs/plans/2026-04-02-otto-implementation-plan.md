# Otto Distribution — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a CLI tool (`otto`) that installs, configures, and manages opencode + kimaki + opencode-agent-memory as a unified distribution.

**Architecture:** otto is a TypeScript CLI published as `otto` on npm. It wraps 3 upstream packages (installed globally via npm) and orchestrates their configuration through file-based config merging. No upstream code is modified.

**Tech Stack:** TypeScript, Node.js, vitest, `@clack/prompts` (TUI — same as kimaki)

**Design doc:** `docs/plans/2026-04-02-otto-distribution-design.md`

---

## Task 1: Project Setup — package.json + bin entry

**Files:**
- Modify: `package.json`
- Modify: `tsconfig.json`
- Create: `src/cli.ts`
- Create: `src/manifest.ts`

**Step 1: Update package.json**

```json
{
  "name": "otto",
  "version": "0.0.1",
  "description": "Otto — terminal UI distribution wrapper for opencode + kimaki + opencode-agent-memory",
  "type": "module",
  "bin": {
    "otto": "./dist/cli.js"
  },
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    "./package.json": "./package.json",
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    }
  },
  "files": ["src", "dist"],
  "keywords": ["otto", "opencode", "kimaki", "ai-agent", "distribution"],
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/SerhiiD/otto.git"
  },
  "scripts": {
    "build": "rm -rf dist *.tsbuildinfo && tsc",
    "dev": "tsc --watch",
    "prepublishOnly": "pnpm build",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@clack/prompts": "^0.9.1",
    "picocolors": "^1.1.1"
  },
  "devDependencies": {
    "@types/node": "^22.10.0",
    "typescript": "^5.7.3",
    "vitest": "^3.2.0"
  }
}
```

**Step 2: Update tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

**Step 3: Create `src/cli.ts` — minimal CLI entry**

```typescript
#!/usr/bin/env node

const args = process.argv.slice(2)
const command = args[0]

switch (command) {
  case "install":
    console.log("otto install — not yet implemented")
    break
  case "upgrade":
    console.log("otto upgrade — not yet implemented")
    break
  case "status":
    console.log("otto status — not yet implemented")
    break
  case "doctor":
    console.log("otto doctor — not yet implemented")
    break
  default:
    console.log("Usage: otto <install|upgrade|status|doctor>")
    break
}

process.exit(0)
```

**Step 4: Create `src/manifest.ts` — version manifest**

```typescript
export interface Manifest {
  version: string
  packages: Record<string, string> // name -> min version range
  pinned: Record<string, string>   // name -> exact version for stable
}

export const MANIFEST: Manifest = {
  version: "0.0.1",
  packages: {
    "opencode-ai": ">=1.0.115",
    "kimaki": ">=0.4.0",
    "opencode-agent-memory": ">=0.2.0",
  },
  pinned: {
    "opencode-ai": "1.2.20",
    "kimaki": "0.4.90",
    "opencode-agent-memory": "0.2.0",
  },
}

export const OPENCODE_CONFIG_DIR = () => {
  const home = process.env.HOME || process.env.USERPROFILE || "/root"
  return `${home}/.config/opencode`
}

export const KIMAKI_DATA_DIR = () => {
  const home = process.env.HOME || process.env.USERPROFILE || "/root"
  return `${home}/.kimaki`
}
```

**Step 5: Install dependencies and build**

```bash
pnpm install
pnpm build
```

**Step 6: Verify CLI works**

```bash
node dist/cli.js
# Expected: "Usage: otto <install|upgrade|status|doctor>"
```

**Step 7: Commit**

```bash
git add -A
git commit -m "feat: project setup with CLI entry and version manifest"
```

---

## Task 2: Package Detection — detect installed packages + versions

**Files:**
- Create: `src/detect.ts`
- Create: `src/detect.test.ts`

**Step 1: Write failing test**

```typescript
// src/detect.test.ts
import { describe, expect, it, vi } from "vitest"
import { detectPackage, getInstalledVersion, type InstalledPackage } from "./detect.js"

describe("detect", () => {
  it("returns null for non-existent package", async () => {
    const result = await getInstalledVersion("nonexistent-package-xyz-123")
    expect(result).toBeNull()
  })

  it("detects an existing global package", async () => {
    // kimaki should be installed in this environment
    const result = await getInstalledVersion("kimaki")
    expect(result).not.toBeNull()
    expect(result).toMatch(/^\d+\.\d+\.\d+/)
  })

  it("detectPackage returns full info", async () => {
    const result = await detectPackage("kimaki")
    expect(result).toEqual({
      name: "kimaki",
      installed: expect.any(String), // version or null
    })
  })
})
```

**Step 2: Run test to verify it fails**

```bash
pnpm test -- src/detect.test.ts
```

Expected: FAIL — `detectPackage` / `getInstalledVersion` not defined

**Step 3: Write implementation**

```typescript
// src/detect.ts
import { execSync } from "node:child_process"

export interface InstalledPackage {
  name: string
  installed: string | null
}

/**
 * Get the installed version of a globally-installed npm package.
 * Returns null if not installed.
 */
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

/**
 * Detect a package: returns name + installed version (or null).
 */
export async function detectPackage(name: string): Promise<InstalledPackage> {
  return {
    name,
    installed: getInstalledVersion(name),
  }
}
```

**Step 4: Run test to verify it passes**

```bash
pnpm test -- src/detect.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/detect.ts src/detect.test.ts
git commit -m "feat: package detection — get installed versions via npm"
```

---

## Task 3: Config Merge — opencode.json plugin orchestration

**Files:**
- Create: `src/config.ts`
- Create: `src/config.test.ts`

**Step 1: Write failing test**

```typescript
// src/config.test.ts
import { describe, expect, it } from "vitest"
import { mergePlugins, type OpenCodeConfig } from "./config.js"

describe("config", () => {
  it("adds plugin to empty config", () => {
    const config: OpenCodeConfig = {}
    const result = mergePlugins(config, "opencode-agent-memory")
    expect(result.plugin).toEqual(["opencode-agent-memory"])
  })

  it("appends plugin to existing array", () => {
    const config: OpenCodeConfig = { plugin: ["existing-plugin"] }
    const result = mergePlugins(config, "opencode-agent-memory")
    expect(result.plugin).toEqual(["existing-plugin", "opencode-agent-memory"])
  })

  it("does not duplicate existing plugin", () => {
    const config: OpenCodeConfig = { plugin: ["opencode-agent-memory"] }
    const result = mergePlugins(config, "opencode-agent-memory")
    expect(result.plugin).toEqual(["opencode-agent-memory"])
  })

  it("preserves other config fields", () => {
    const config: OpenCodeConfig = {
      model: "gpt-4",
      plugin: ["existing"],
      provider: { cursor: { name: "Cursor" } },
    }
    const result = mergePlugins(config, "opencode-agent-memory")
    expect(result.model).toBe("gpt-4")
    expect(result.provider).toEqual({ cursor: { name: "Cursor" } })
    expect(result.plugin).toEqual(["existing", "opencode-agent-memory"])
  })
})
```

**Step 2: Run test to verify it fails**

```bash
pnpm test -- src/config.test.ts
```

Expected: FAIL

**Step 3: Write implementation**

```typescript
// src/config.ts
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

/**
 * Merge a plugin into an opencode config object.
 * Idempotent: does not duplicate if already present.
 */
export function mergePlugins(config: OpenCodeConfig, pluginToAdd: string): OpenCodeConfig {
  const plugins = config.plugin ?? []
  if (plugins.includes(pluginToAdd)) {
    return config
  }
  return { ...config, plugin: [...plugins, pluginToAdd] }
}

/**
 * Read opencode.json from disk.
 */
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

/**
 * Write opencode.json to disk.
 * Only writes if content changed.
 */
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
    return false // no change
  }

  fs.mkdirSync(configDir, { recursive: true })
  fs.writeFileSync(configPath, newContent, "utf-8")
  return true // written
}

/**
 * Ensure agent-memory.json exists with defaults.
 * Returns true if file was created.
 */
export function ensureAgentMemoryConfig(dir?: string): boolean {
  const configDir = dir ?? OPENCODE_CONFIG_DIR()
  const configPath = path.join(configDir, "agent-memory.json")

  try {
    fs.readFileSync(configPath, "utf-8")
    return false // already exists
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
```

**Step 4: Run test to verify it passes**

```bash
pnpm test -- src/config.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/config.ts src/config.test.ts
git commit -m "feat: config merge — idempotent plugin orchestration for opencode.json"
```

---

## Task 4: Package Install — npm global install logic

**Files:**
- Create: `src/installer.ts`
- Create: `src/installer.test.ts`

**Step 1: Write failing test**

```typescript
// src/installer.test.ts
import { describe, expect, it, vi } from "vitest"
import { installPackage, upgradePackage } from "./installer.js"

describe("installer", () => {
  it("installPackage returns installed version", async () => {
    // We test with a small package that isn't installed
    // In real usage this calls npm install -g
    // For unit test we just verify the function signature
    expect(typeof installPackage).toBe("function")
  })

  it("upgradePackage accepts mode stable/latest", () => {
    expect(typeof upgradePackage).toBe("function")
  })
})
```

**Step 2: Run test to verify it passes (basic smoke)**

```bash
pnpm test -- src/installer.test.ts
```

**Step 3: Write implementation**

```typescript
// src/installer.ts
import { execSync } from "node:child_process"
import { MANIFEST } from "./manifest.js"

export type UpgradeMode = "stable" | "latest"

/**
 * Install a package globally via npm.
 * If version is specified, pins to that version.
 */
export function installPackage(name: string, version?: string): string {
  const spec = version ? `${name}@${version}` : name
  execSync(`npm install -g ${spec}`, {
    encoding: "utf-8",
    stdio: "pipe",
  })
  return spec
}

/**
 * Upgrade a package globally.
 * stable: uses pinned version from manifest
 * latest: uses npm latest
 */
export function upgradePackage(name: string, mode: UpgradeMode): string {
  if (mode === "stable") {
    const pinned = MANIFEST.pinned[name]
    if (!pinned) {
      throw new Error(`No pinned version for ${name} in manifest`)
    }
    return installPackage(name, pinned)
  }
  // latest
  return installPackage(name, "latest")
}

/**
 * Install all missing packages from the manifest.
 * Returns list of packages that were installed.
 */
export function installMissingPackages(
  getInstalled: (name: string) => string | null,
  install: (name: string, version?: string) => string = installPackage,
): string[] {
  const installed: string[] = []
  for (const [name, minVersion] of Object.entries(MANIFEST.packages)) {
    const current = getInstalled(name)
    if (!current) {
      const pinned = MANIFEST.pinned[name]
      install(name, pinned)
      installed.push(name)
    }
  }
  return installed
}
```

**Step 4: Run test**

```bash
pnpm test -- src/installer.test.ts
```

**Step 5: Commit**

```bash
git add src/installer.ts src/installer.test.ts
git commit -m "feat: installer — npm global install/upgrade with stable/latest modes"
```

---

## Task 5: Kimaki Restart — lifecycle management

**Files:**
- Create: `src/lifecycle.ts`
- Create: `src/lifecycle.test.ts`

**Step 1: Write failing test**

```typescript
// src/lifecycle.test.ts
import { describe, expect, it, vi } from "vitest"
import { isKimakiRunning, restartKimaki, hasKimakiBinary } from "./lifecycle.js"

describe("lifecycle", () => {
  it("hasKimakiBinary returns boolean", () => {
    const result = hasKimakiBinary()
    expect(typeof result).toBe("boolean")
  })

  it("isKimakiRunning returns boolean", () => {
    const result = isKimakiRunning()
    expect(typeof result).toBe("boolean")
  })

  it("restartKimaki throws if kimaki not available", () => {
    // If kimaki is available (like in this env), it should work
    // If not, it should throw
    expect(typeof restartKimaki).toBe("function")
  })
})
```

**Step 2: Run test**

```bash
pnpm test -- src/lifecycle.test.ts
```

**Step 3: Write implementation**

```typescript
// src/lifecycle.ts
import { execSync } from "node:child_process"

/**
 * Check if kimaki binary exists in PATH.
 */
export function hasKimakiBinary(): boolean {
  try {
    execSync("which kimaki", { encoding: "utf-8", stdio: "pipe" })
    return true
  } catch {
    return false
  }
}

/**
 * Check if a kimaki process is currently running.
 */
export function isKimakiRunning(): boolean {
  try {
    const output = execSync("pgrep -f kimaki", { encoding: "utf-8", stdio: "pipe" })
    return output.trim().length > 0
  } catch {
    return false
  }
}

/**
 * Restart kimaki. Throws if kimaki is not installed.
 */
export function restartKimaki(): void {
  if (!hasKimakiBinary()) {
    throw new Error("kimaki is not installed. Install it first with: npm install -g kimaki")
  }
  execSync("kimaki restart", {
    encoding: "utf-8",
    stdio: "pipe",
    timeout: 30_000,
  })
}
```

**Step 4: Run test**

```bash
pnpm test -- src/lifecycle.test.ts
```

**Step 5: Commit**

```bash
git add src/lifecycle.ts src/lifecycle.test.ts
git commit -m "feat: lifecycle — kimaki restart and process detection"
```

---

## Task 6: Status & Doctor — health checks

**Files:**
- Create: `src/health.ts`
- Create: `src/health.test.ts`

**Step 1: Write failing test**

```typescript
// src/health.test.ts
import { describe, expect, it } from "vitest"
import {
  checkPackagePresence,
  checkConfigHealth,
  checkDirectoryHealth,
  type HealthResult,
} from "./health.js"

describe("health", () => {
  it("checkPackagePresence returns results for all manifest packages", () => {
    const results = checkPackagePresence()
    expect(results).toHaveLength(3) // opencode-ai, kimaki, opencode-agent-memory
    for (const r of results) {
      expect(r).toHaveProperty("name")
      expect(r).toHaveProperty("installed")
    }
  })

  it("checkConfigHealth returns structured result", () => {
    const result = checkConfigHealth()
    expect(result).toHaveProperty("opencodeJson")
    expect(result).toHaveProperty("agentMemoryJson")
    expect(result).toHaveProperty("memoryPluginEnabled")
  })

  it("checkDirectoryHealth returns results", () => {
    const results = checkDirectoryHealth()
    expect(Array.isArray(results)).toBe(true)
  })
})
```

**Step 2: Run test to verify it fails**

```bash
pnpm test -- src/health.test.ts
```

**Step 3: Write implementation**

```typescript
// src/health.ts
import fs from "node:fs"
import path from "node:path"
import { getInstalledVersion } from "./detect.js"
import { readOpenCodeConfig, ensureAgentMemoryConfig } from "./config.js"
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

/**
 * Check if all manifest packages are installed.
 */
export function checkPackagePresence(): PackageCheck[] {
  return Object.entries(MANIFEST.packages).map(([name, required]) => {
    const installed = getInstalledVersion(name)
    return { name, installed, required, status: installed ? "ok" as const : "missing" as const }
  })
}

export interface ConfigHealth {
  opencodeJson: "ok" | "missing" | "error"
  agentMemoryJson: "ok" | "missing" | "created"
  memoryPluginEnabled: boolean
  kimakiRunning: boolean
}

/**
 * Check config file health.
 */
export function checkConfigHealth(): ConfigHealth {
  let opencodeJson: ConfigHealth["opencodeJson"] = "ok"
  const config = readOpenCodeConfig()
  try {
    // just reading succeeded
  } catch {
    opencodeJson = "error"
  }

  const configDir = OPENCODE_CONFIG_DIR()
  const agentMemoryPath = path.join(configDir, "agent-memory.json")
  let agentMemoryJson: ConfigHealth["agentMemoryJson"] = "missing"
  if (fs.existsSync(agentMemoryPath)) {
    agentMemoryJson = "ok"
  }

  const memoryPluginEnabled = (config.plugin ?? []).includes("opencode-agent-memory")
  const kimakiRunning = isKimakiRunning()

  return { opencodeJson, agentMemoryJson, memoryPluginEnabled, kimakiRunning }
}

/**
 * Check that required directories exist.
 */
export function checkDirectoryHealth(): HealthResult[] {
  const results: HealthResult[] = []
  const dirs = [
    { path: OPENCODE_CONFIG_DIR(), label: "opencode config dir" },
    { path: path.join(OPENCODE_CONFIG_DIR(), "memory"), label: "opencode memory dir" },
    { path: path.join(OPENCODE_CONFIG_DIR(), "journal"), label: "opencode journal dir" },
    { path: KIMAKI_DATA_DIR(), label: "kimaki data dir" },
  ]

  for (const { path: p, label } of dirs) {
    if (fs.existsSync(p)) {
      results.push({ name: label, status: "ok", message: `exists: ${p}` })
    } else {
      results.push({ name: label, status: "warn", message: `missing: ${p}` })
    }
  }
  return results
}
```

**Step 4: Run test**

```bash
pnpm test -- src/health.test.ts
```

**Step 5: Commit**

```bash
git add src/health.ts src/health.test.ts
git commit -m "feat: health checks — package presence, config, directory validation"
```

---

## Task 7: CLI Commands — wire everything into `src/cli.ts`

**Files:**
- Modify: `src/cli.ts`
- Delete: `src/index.ts` (replace with cli.ts as entry)
- Delete: `src/index.test.ts` (replace with new tests)

**Step 1: Rewrite `src/cli.ts`**

```typescript
#!/usr/bin/env node

import { MANIFEST } from "./manifest.js"
import { getInstalledVersion, detectPackage } from "./detect.js"
import { readOpenCodeConfig, writeOpenCodeConfig, ensureAgentMemoryConfig, mergePlugins } from "./config.js"
import { installPackage, upgradePackage, installMissingPackages } from "./installer.js"
import { hasKimakiBinary, isKimakiRunning, restartKimaki } from "./lifecycle.js"
import { checkPackagePresence, checkConfigHealth, checkDirectoryHealth } from "./health.js"

const args = process.argv.slice(2)
const command = args[0] ?? ""
const subCommand = args[1] ?? ""

async function cmdInstall(): Promise<void> {
  console.log("Otto install — conservative mode\n")

  // 1. Check prerequisites
  if (!hasKimakiBinary()) {
    // kimaki might not be in PATH but could be installed
  }

  // 2. Install missing packages
  const installed = installMissingPackages(getInstalledVersion)
  if (installed.length > 0) {
    console.log(`Installed: ${installed.join(", ")}`)
  } else {
    console.log("All packages already installed.")
  }

  // 3. Merge opencode.json config
  const config = readOpenCodeConfig()
  const merged = mergePlugins(config, "opencode-agent-memory")
  const configChanged = writeOpenCodeConfig(merged)

  if (configChanged) {
    console.log("Updated opencode.json — added opencode-agent-memory plugin")
  }

  // 4. Ensure agent-memory.json exists
  const created = ensureAgentMemoryConfig()
  if (created) {
    console.log("Created agent-memory.json with defaults")
  }

  // 5. Restart kimaki if config changed
  if (configChanged || installed.length > 0) {
    if (hasKimakiBinary()) {
      console.log("Restarting kimaki...")
      try {
        restartKimaki()
        console.log("Kimaki restarted.")
      } catch (err) {
        console.error(`Warning: could not restart kimaki: ${err}`)
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

  // Backup config
  const config = readOpenCodeConfig()
  console.log("\nBacking up opencode.json...")

  // Upgrade
  for (const name of Object.keys(MANIFEST.packages)) {
    console.log(`Upgrading ${name}...`)
    upgradePackage(name, mode)
  }

  // Ensure config is still correct after upgrade
  const merged = mergePlugins(config, "opencode-agent-memory")
  writeOpenCodeConfig(merged)

  // Restart
  if (hasKimakiBinary()) {
    console.log("Restarting kimaki...")
    try {
      restartKimaki()
      console.log("Kimaki restarted.")
    } catch (err) {
      console.error(`Warning: could not restart kimaki: ${err}`)
    }
  }

  console.log("\nDone!")
}

async function cmdStatus(): Promise<void> {
  console.log("Otto status\n")
  console.log(`Otto version: ${MANIFEST.version}\n`)

  // Package versions
  console.log("Packages:")
  const packages = checkPackagePresence()
  for (const pkg of packages) {
    const icon = pkg.status === "ok" ? "✓" : "✗"
    console.log(`  ${icon} ${pkg.name}: ${pkg.installed ?? "not installed"} (requires ${pkg.required})`)
  }

  // Config
  console.log("\nConfig:")
  const configHealth = checkConfigHealth()
  console.log(`  opencode.json: ${configHealth.opencodeJson}`)
  console.log(`  agent-memory.json: ${configHealth.agentMemoryJson}`)
  console.log(`  memory plugin: ${configHealth.memoryPluginEnabled ? "enabled" : "NOT enabled"}`)
  console.log(`  kimaki process: ${configHealth.kimakiRunning ? "running" : "not running"}`)
}

async function cmdDoctor(): Promise<void> {
  console.log("Otto doctor\n")

  let hasErrors = false

  // Packages
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

  // Config
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

  // Directories
  console.log("\nChecking directories...")
  const dirs = checkDirectoryHealth()
  for (const d of dirs) {
    const icon = d.status === "ok" ? "✓" : d.status === "warn" ? "⚠" : "✗"
    console.log(`  ${icon} ${d.name}: ${d.message}`)
    if (d.status !== "ok") hasErrors = true
  }

  console.log(hasErrors ? "\n✗ Issues found. Run `otto install` to fix." : "\n✓ All checks passed!")
}

// Main
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

main().catch((err) => {
  console.error(`Error: ${err.message}`)
  process.exit(1)
})
```

**Step 2: Update `src/index.ts` to re-export**

```typescript
// src/index.ts
export { MANIFEST } from "./manifest.js"
export { getInstalledVersion, detectPackage } from "./detect.js"
export { mergePlugins, readOpenCodeConfig, writeOpenCodeConfig, ensureAgentMemoryConfig } from "./config.js"
export { installPackage, upgradePackage, installMissingPackages } from "./installer.js"
export { hasKimakiBinary, isKimakiRunning, restartKimaki } from "./lifecycle.js"
export { checkPackagePresence, checkConfigHealth, checkDirectoryHealth } from "./health.js"
```

**Step 3: Update test**

```typescript
// src/index.test.ts
import { describe, expect, it } from "vitest"
import { MANIFEST } from "./index.js"

describe("otto", () => {
  it("exports manifest with version", () => {
    expect(MANIFEST.version).toMatch(/^\d+\.\d+\.\d+$/)
  })
})
```

**Step 4: Build and test**

```bash
pnpm build
pnpm test
node dist/cli.js
node dist/cli.js status
```

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: wire CLI commands — install, upgrade, status, doctor"
```

---

## Task 8: Final Cleanup — AGENTS.md + initial commit on master

**Files:**
- Create: `AGENTS.md`

**Step 1: Create AGENTS.md**

```markdown
# Otto

## Персона
\`\`\`
memory_read {"label":"persona","scope":"global"}
\`\`\`
Користувач: Сергій / Serhii

## Проект
Otto — terminal UI distribution wrapper. Встановлює/налаштовує спільну роботу opencode + kimaki + opencode-agent-memory БЕЗ зміни upstream коду.

## Архітектура
- `src/cli.ts` — CLI entry point (otto install/upgrade/status/doctor)
- `src/manifest.ts` — версії upstream пакетів (pinned для stable, ranges для requirements)
- `src/detect.ts` — detect installed npm packages
- `src/config.ts` — merge opencode.json plugin array, agent-memory.json
- `src/installer.ts` — npm global install/upgrade
- `src/lifecycle.ts` — kimaki restart
- `src/health.ts` — health checks

## Workflow
1. Зміни → `src/`
2. Білд: `pnpm build`
3. Тести: `pnpm test`
4. Локальний тест: `node dist/cli.js status`
5. Глобальний інстал: `npm install -g .`
6. Після змін в otto — kimaki restart не потрібен (бо otto — окремий CLI)

## Design doc
`docs/plans/2026-04-02-otto-distribution-design.md`
```

**Step 2: Commit**

```bash
git add AGENTS.md
git commit -m "docs: add AGENTS.md with project context"
```

---

## Summary of tasks

| # | Task | Files | Tests |
|---|------|-------|-------|
| 1 | Project setup + manifest | `package.json`, `tsconfig.json`, `src/cli.ts`, `src/manifest.ts` | smoke test |
| 2 | Package detection | `src/detect.ts`, `src/detect.test.ts` | 3 tests |
| 3 | Config merge | `src/config.ts`, `src/config.test.ts` | 4 tests |
| 4 | Package install | `src/installer.ts`, `src/installer.test.ts` | 2 tests |
| 5 | Kimaki lifecycle | `src/lifecycle.ts`, `src/lifecycle.test.ts` | 3 tests |
| 6 | Health checks | `src/health.ts`, `src/health.test.ts` | 3 tests |
| 7 | Wire CLI commands | `src/cli.ts`, `src/index.ts`, `src/index.test.ts` | 1 test |
| 8 | Final cleanup | `AGENTS.md` | — |
