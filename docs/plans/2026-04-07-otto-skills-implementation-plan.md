# Otto Skills Repository — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add `otto skills` CLI commands and a skill resolver that clones/caches the `otto-assistant/skills` GitHub repo, installs SKILL.md-based skills into `~/.config/opencode/skills/`, and integrates with the existing `otto install`/`status`/`doctor` lifecycle.

**Architecture:** New module `src/skills.ts` handles git clone/pull of the skills repo into `~/.cache/otto/skills-repo/`, parses SKILL.md frontmatter, and copies skill directories into the OpenCode skills directory. The CLI gains a `skills` sub-command router. Existing `ensureSubagentThreadSkill()` is migrated to use the resolver (with inline fallback for offline).

**Tech Stack:** Node.js `child_process.execFileSync` for git, `fs` for file ops, gray-matter-like YAML frontmatter parsing (manual, no new deps), vitest for tests.

---

### Task 1: Create `src/skills.ts` — types and constants

**Files:**
- Create: `src/skills.ts`

**Step 1: Write the failing test**

Create `src/skills.test.ts`:

```typescript
import { describe, it, expect } from "vitest"
import {
  SKILL_REPO_URL,
  SKILLS_CACHE_DIR,
  OPENCODE_SKILLS_DIR,
  parseSkillMd,
  type SkillMeta,
} from "./skills.js"
import path from "node:path"

describe("skills constants", () => {
  it("SKILL_REPO_URL points to otto-assistant/skills", () => {
    expect(SKILL_REPO_URL).toBe("https://github.com/otto-assistant/skills.git")
  })

  it("SKILLS_CACHE_DIR is under ~/.cache/otto/", () => {
    expect(SKILLS_CACHE_DIR()).toContain(".cache/otto/skills-repo")
  })

  it("OPENCODE_SKILLS_DIR is under ~/.config/opencode/skills/", () => {
    expect(OPENCODE_SKILLS_DIR()).toContain(".config/opencode/skills")
  })
})

describe("parseSkillMd", () => {
  it("parses valid SKILL.md with required fields", () => {
    const content = `---
name: my-skill
description: Does something useful.
---

# My Skill

Instructions here.
`
    const meta = parseSkillMd(content)
    expect(meta).toEqual({
      name: "my-skill",
      description: "Does something useful.",
      metadata: {},
    })
  })

  it("parses SKILL.md with optional metadata", () => {
    const content = `---
name: otto-subagent-threads
description: Enforce Discord threads.
metadata:
  author: otto-assistant
  version: "1.0"
  category: otto-core
  requires-kimaki: "true"
---

# Instructions
`
    const meta = parseSkillMd(content)
    expect(meta.name).toBe("otto-subagent-threads")
    expect(meta.description).toBe("Enforce Discord threads.")
    expect(meta.metadata?.category).toBe("otto-core")
    expect(meta.metadata?.["requires-kimaki"]).toBe("true")
  })

  it("returns null for content without frontmatter", () => {
    const content = "# Just markdown\nNo frontmatter here."
    expect(parseSkillMd(content)).toBeNull()
  })

  it("returns null for frontmatter missing name", () => {
    const content = `---
description: Has desc but no name.
---

# Oops
`
    expect(parseSkillMd(content)).toBeNull()
  })

  it("returns null for frontmatter missing description", () => {
    const content = `---
name: has-name
---

# No desc
`
    expect(parseSkillMd(content)).toBeNull()
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm test -- --reporter=verbose skills.test.ts`
Expected: FAIL — module `./skills.js` not found

**Step 3: Write minimal implementation**

Create `src/skills.ts`:

```typescript
import fs from "node:fs"
import path from "node:path"
import os from "node:os"

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const SKILL_REPO_URL = "https://github.com/otto-assistant/skills.git"

export const SKILLS_CACHE_DIR = (): string => {
  const home = process.env.HOME || process.env.USERPROFILE || "/root"
  return path.join(home, ".cache", "otto", "skills-repo")
}

export const OPENCODE_SKILLS_DIR = (): string => {
  const home = process.env.HOME || process.env.USERPROFILE || "/root"
  return path.join(home, ".config", "opencode", "skills")
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SkillMeta {
  name: string
  description: string
  metadata?: Record<string, string>
}

// ---------------------------------------------------------------------------
// SKILL.md parser (YAML frontmatter + Markdown body)
// ---------------------------------------------------------------------------

/**
 * Parse a SKILL.md file content. Returns null if:
 * - No YAML frontmatter found
 * - Missing required `name` or `description` fields
 */
export function parseSkillMd(content: string): SkillMeta | null {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!match) return null

  const frontmatter = match[1]
  const nameMatch = frontmatter.match(/^name:\s*(.+)$/m)
  const descMatch = frontmatter.match(/^description:\s*(.+)$/m)

  if (!nameMatch || !descMatch) return null

  const name = nameMatch[1].trim()
  const description = descMatch[1].trim()

  if (!name || !description) return null

  // Parse optional metadata block
  const metadata: Record<string, string> = {}
  const metaMatch = frontmatter.match(/^metadata:\s*$/m)
  if (metaMatch) {
    const metaStart = frontmatter.indexOf(metaMatch[0]) + metaMatch[0].length
    const metaSection = frontmatter.slice(metaStart)
    for (const line of metaSection.split("\n")) {
      const kvMatch = line.match(/^\s{2}(\S+):\s*"?([^"]*)"?\s*$/)
      if (kvMatch) {
        metadata[kvMatch[1]] = kvMatch[2]
      } else if (!line.match(/^\s*$/) && !line.match(/^\s{2}/)) {
        break // End of metadata block
      }
    }
  }

  return { name, description, metadata: Object.keys(metadata).length > 0 ? metadata : undefined }
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm test -- --reporter=verbose skills.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add src/skills.ts src/skills.test.ts
git commit -m "feat(skills): add SKILL.md parser and constants"
```

---

### Task 2: Add git clone/pull cache and skill discovery

**Files:**
- Modify: `src/skills.ts`
- Modify: `src/skills.test.ts`

**Step 1: Write the failing test**

Append to `src/skills.test.ts`:

```typescript
import fs from "node:fs"
import path from "node:path"
import os from "node:os"

// Helper: create a fake skills repo directory structure
function createFakeSkillsRepo(baseDir: string, skills: Record<string, string>): void {
  const skillsDir = path.join(baseDir, "skills")
  for (const [name, content] of Object.entries(skills)) {
    const skillDir = path.join(skillsDir, name)
    fs.mkdirSync(skillDir, { recursive: true })
    fs.writeFileSync(path.join(skillDir, "SKILL.md"), content, "utf-8")
  }
}

describe("discoverCachedSkills", () => {
  it("discovers skills from cache directory", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "otto-test-"))
    createFakeSkillsRepo(tmpDir, {
      "skill-a": "---\nname: skill-a\ndescription: Skill A\n---\n# A",
      "skill-b": "---\nname: skill-b\ndescription: Skill B\n---\n# B",
    })

    const skills = discoverCachedSkills(tmpDir)
    expect(skills).toHaveLength(2)
    expect(skills.map((s) => s.name).sort()).toEqual(["skill-a", "skill-b"])
    expect(skills[0].description).toBeDefined()

    fs.rmSync(tmpDir, { recursive: true })
  })

  it("skips invalid SKILL.md files", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "otto-test-"))
    createFakeSkillsRepo(tmpDir, {
      "valid-skill": "---\nname: valid-skill\ndescription: Valid\n---\n# Valid",
      "bad-skill": "# No frontmatter at all",
    })

    const skills = discoverCachedSkills(tmpDir)
    expect(skills).toHaveLength(1)
    expect(skills[0].name).toBe("valid-skill")

    fs.rmSync(tmpDir, { recursive: true })
  })

  it("returns empty array for non-existent directory", () => {
    const skills = discoverCachedSkills("/nonexistent/path")
    expect(skills).toEqual([])
  })
})

describe("listInstalledSkills", () => {
  it("lists installed skills from OpenCode skills dir", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "otto-test-"))
    const skillsDir = path.join(tmpDir, "skills")
    fs.mkdirSync(path.join(skillsDir, "my-skill"), { recursive: true })
    fs.writeFileSync(
      path.join(skillsDir, "my-skill", "SKILL.md"),
      "---\nname: my-skill\ndescription: Test skill\n---\n# Test",
      "utf-8",
    )

    const skills = listInstalledSkills(tmpDir)
    expect(skills).toHaveLength(1)
    expect(skills[0].name).toBe("my-skill")

    fs.rmSync(tmpDir, { recursive: true })
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm test -- --reporter=verbose skills.test.ts`
Expected: FAIL — `discoverCachedSkills` not exported

**Step 3: Write implementation**

Add to `src/skills.ts`:

```typescript
// ---------------------------------------------------------------------------
// Skill discovery from cache and installed directories
// ---------------------------------------------------------------------------

/**
 * Discover all valid skills in a cached repo directory.
 * Scans `<cacheDir>/skills/*/SKILL.md`.
 */
export function discoverCachedSkills(cacheDir: string): SkillMeta[] {
  const skillsDir = path.join(cacheDir, "skills")
  return discoverSkillsInDir(skillsDir)
}

/**
 * List all Otto-managed skills installed in the OpenCode skills directory.
 * `baseDir` defaults to `~/.config/opencode`.
 */
export function listInstalledSkills(baseDir?: string): SkillMeta[] {
  const configDir = baseDir ?? path.join(os.homedir(), ".config", "opencode")
  const skillsDir = path.join(configDir, "skills")
  return discoverSkillsInDir(skillsDir)
}

function discoverSkillsInDir(skillsDir: string): SkillMeta[] {
  if (!fs.existsSync(skillsDir)) return []

  const results: SkillMeta[] = []
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(skillsDir, { withFileTypes: true })
  } catch {
    return []
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const skillPath = path.join(skillsDir, entry.name, "SKILL.md")
    try {
      const content = fs.readFileSync(skillPath, "utf-8")
      const meta = parseSkillMd(content)
      if (meta) results.push(meta)
    } catch {
      // SKILL.md doesn't exist or unreadable — skip
    }
  }

  return results
}
```

Add imports at the top: ensure `os` is imported.

**Step 4: Run test to verify it passes**

Run: `pnpm test -- --reporter=verbose skills.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add src/skills.ts src/skills.test.ts
git commit -m "feat(skills): add skill discovery from cache and installed dirs"
```

---

### Task 3: Add git clone/pull and install/remove operations

**Files:**
- Modify: `src/skills.ts`
- Modify: `src/skills.test.ts`

**Step 1: Write the failing test**

Append to `src/skills.test.ts`:

```typescript
describe("installSkill / removeSkill", () => {
  let cacheDir: string
  let targetDir: string

  beforeEach(() => {
    cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "otto-cache-"))
    targetDir = fs.mkdtempSync(path.join(os.tmpdir(), "otto-target-"))
    // Create fake cache with one skill
    const skillDir = path.join(cacheDir, "skills", "test-skill")
    fs.mkdirSync(skillDir, { recursive: true })
    fs.writeFileSync(
      path.join(skillDir, "SKILL.md"),
      "---\nname: test-skill\ndescription: A test skill\n---\n# Test",
      "utf-8",
    )
  })

  afterEach(() => {
    fs.rmSync(cacheDir, { recursive: true, force: true })
    fs.rmSync(targetDir, { recursive: true, force: true })
  })

  it("installSkill copies skill from cache to target", () => {
    const result = installSkill("test-skill", cacheDir, targetDir)
    expect(result).toBe(true)

    const installed = fs.readFileSync(
      path.join(targetDir, "skills", "test-skill", "SKILL.md"),
      "utf-8",
    )
    expect(installed).toContain("name: test-skill")
  })

  it("installSkill returns false if skill not in cache", () => {
    const result = installSkill("nonexistent", cacheDir, targetDir)
    expect(result).toBe(false)
  })

  it("installSkill returns false if SKILL.md is invalid", () => {
    const badDir = path.join(cacheDir, "skills", "bad-skill")
    fs.mkdirSync(badDir, { recursive: true })
    fs.writeFileSync(path.join(badDir, "SKILL.md"), "no frontmatter", "utf-8")

    const result = installSkill("bad-skill", cacheDir, targetDir)
    expect(result).toBe(false)
  })

  it("removeSkill deletes skill from target", () => {
    // Install first
    installSkill("test-skill", cacheDir, targetDir)

    const result = removeSkill("test-skill", targetDir)
    expect(result).toBe(true)
    expect(fs.existsSync(path.join(targetDir, "skills", "test-skill"))).toBe(false)
  })

  it("removeSkill returns false if skill not installed", () => {
    const result = removeSkill("nonexistent", targetDir)
    expect(result).toBe(false)
  })
})
```

Add the missing imports at the top of the test file:

```typescript
import { beforeEach, afterEach } from "vitest"
```

**Step 2: Run test to verify it fails**

Run: `pnpm test -- --reporter=verbose skills.test.ts`
Expected: FAIL — `installSkill`/`removeSkill` not exported

**Step 3: Write implementation**

Add to `src/skills.ts`:

```typescript
// ---------------------------------------------------------------------------
// Install / Remove
// ---------------------------------------------------------------------------

/**
 * Install a skill from cache to the OpenCode skills directory.
 * Returns true if installed, false if skill not found in cache or invalid.
 */
export function installSkill(
  name: string,
  cacheDir?: string,
  targetDir?: string,
): boolean {
  const src = cacheDir ?? SKILLS_CACHE_DIR()
  const dst = targetDir ?? path.join(os.homedir(), ".config", "opencode")

  const sourceSkillDir = path.join(src, "skills", name)
  const sourceSkillMd = path.join(sourceSkillDir, "SKILL.md")

  // Validate source
  if (!fs.existsSync(sourceSkillMd)) return false
  const content = fs.readFileSync(sourceSkillMd, "utf-8")
  const meta = parseSkillMd(content)
  if (!meta) return false

  // Copy entire skill directory
  const targetSkillDir = path.join(dst, "skills", name)
  fs.mkdirSync(targetSkillDir, { recursive: true })
  copyDirRecursive(sourceSkillDir, targetSkillDir)

  return true
}

/**
 * Remove an installed skill from the OpenCode skills directory.
 * Returns true if removed, false if not found.
 */
export function removeSkill(
  name: string,
  targetDir?: string,
): boolean {
  const dst = targetDir ?? path.join(os.homedir(), ".config", "opencode")
  const skillDir = path.join(dst, "skills", name)

  if (!fs.existsSync(skillDir)) return false

  fs.rmSync(skillDir, { recursive: true, force: true })
  return true
}

/**
 * Recursively copy a directory.
 */
function copyDirRecursive(src: string, dst: string): void {
  fs.mkdirSync(dst, { recursive: true })
  const entries = fs.readdirSync(src, { withFileTypes: true })
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name)
    const dstPath = path.join(dst, entry.name)
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, dstPath)
    } else {
      fs.copyFileSync(srcPath, dstPath)
    }
  }
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm test -- --reporter=verbose skills.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add src/skills.ts src/skills.test.ts
git commit -m "feat(skills): add installSkill and removeSkill"
```

---

### Task 4: Add ensureSkillsRepo (git clone/pull) and updateSkills

**Files:**
- Modify: `src/skills.ts`
- Modify: `src/skills.test.ts`

**Step 1: Write the failing test**

Append to `src/skills.test.ts`:

```typescript
import { execFileSync } from "node:child_process"

describe("ensureSkillsRepo", () => {
  it("clones repo when cache is empty", () => {
    // This is an integration test — it actually calls git clone.
    // For unit testing we test the logic path, not git itself.
    // We'll test with a local "remote" repo.
    const tmpCache = fs.mkdtempSync(path.join(os.tmpdir(), "otto-cache-"))
    const fakeRemote = fs.mkdtempSync(path.join(os.tmpdir(), "otto-remote-"))

    // Create a bare git repo as fake remote
    execFileSync("git", ["init", "--bare", fakeRemote], { encoding: "utf-8" })

    // Clone should work
    const result = ensureSkillsRepo(tmpCache, fakeRemote)
    expect(result).toBe("cloned")

    fs.rmSync(tmpCache, { recursive: true, force: true })
    fs.rmSync(fakeRemote, { recursive: true, force: true })
  })

  it("pulls when cache already exists", () => {
    const tmpCache = fs.mkdtempSync(path.join(os.tmpdir(), "otto-cache-"))
    const fakeRemote = fs.mkdtempSync(path.join(os.tmpdir(), "otto-remote-"))

    // Create a bare git repo
    execFileSync("git", ["init", "--bare", fakeRemote], { encoding: "utf-8" })
    // Clone first
    ensureSkillsRepo(tmpCache, fakeRemote)
    // Pull again
    const result = ensureSkillsRepo(tmpCache, fakeRemote)
    expect(result).toBe("pulled")

    fs.rmSync(tmpCache, { recursive: true, force: true })
    fs.rmSync(fakeRemote, { recursive: true, force: true })
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm test -- --reporter=verbose skills.test.ts`
Expected: FAIL — `ensureSkillsRepo` not exported

**Step 3: Write implementation**

Add to `src/skills.ts`:

```typescript
import { execFileSync } from "node:child_process"

// ---------------------------------------------------------------------------
// Git cache management
// ---------------------------------------------------------------------------

export type RepoSyncResult = "cloned" | "pulled" | "offline"

/**
 * Ensure the skills repo is cloned and up to date.
 * Returns "cloned" if freshly cloned, "pulled" if updated, "offline" if no network.
 */
export function ensureSkillsRepo(
  cacheDir?: string,
  repoUrl?: string,
): RepoSyncResult {
  const cache = cacheDir ?? SKILLS_CACHE_DIR()
  const url = repoUrl ?? SKILL_REPO_URL

  if (!fs.existsSync(path.join(cache, ".git"))) {
    try {
      execFileSync("git", ["clone", "--depth", "1", url, cache], {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
        timeout: 30_000,
      })
      return "cloned"
    } catch {
      return "offline"
    }
  }

  try {
    execFileSync("git", ["-C", cache, "pull", "--ff-only"], {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 15_000,
    })
    return "pulled"
  } catch {
    return "offline"
  }
}
```

Ensure `execFileSync` import is at the top.

**Step 4: Run test to verify it passes**

Run: `pnpm test -- --reporter=verbose skills.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add src/skills.ts src/skills.test.ts
git commit -m "feat(skills): add ensureSkillsRepo with git clone/pull"
```

---

### Task 5: Add `otto skills` CLI commands

**Files:**
- Modify: `src/cli.ts`

**Step 1: Add skills sub-command router**

In `src/cli.ts`, add import at the top:

```typescript
import {
  ensureSkillsRepo,
  discoverCachedSkills,
  listInstalledSkills,
  installSkill,
  removeSkill,
  type SkillMeta,
} from "./skills.js"
```

Add a new case in the `main()` switch block, before `default`:

```typescript
    case "skills":
      await cmdSkills(args.slice(1))
      break
```

Add the `cmdSkills` function before `main()`:

```typescript
async function cmdSkills(subArgs: string[]): Promise<void> {
  const skillCommand = subArgs[0] ?? ""

  switch (skillCommand) {
    case "list": {
      await cmdSkillsList()
      break
    }
    case "add": {
      const name = subArgs[1]
      if (!name || name === "--all") {
        await cmdSkillsAddAll()
      } else {
        await cmdSkillsAddOne(name)
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
    case "update": {
      await cmdSkillsUpdate()
      break
    }
    default:
      console.log(`Otto skills — manage agent skills from otto-assistant/skills

Usage:
  otto skills list              List installed and available skills
  otto skills add <name>        Install a specific skill
  otto skills add --all         Install all available skills
  otto skills update            Update installed skills from GitHub
  otto skills remove <name>     Remove an installed skill
`)
      break
  }
}

async function cmdSkillsList(): Promise<void> {
  console.log("Otto skills\n")

  // Installed
  const installed = listInstalledSkills()
  if (installed.length > 0) {
    console.log("Installed:")
    for (const s of installed) {
      console.log(`  ✓ ${s.name} — ${s.description}`)
    }
  } else {
    console.log("Installed: (none)")
  }

  // Available (from cache)
  const syncResult = ensureSkillsRepo()
  if (syncResult === "offline") {
    console.log("\n⚠ Could not reach otto-assistant/skills (offline). Showing cached only.")
  }

  const cached = discoverCachedSkills()
  const installedNames = new Set(installed.map((s) => s.name))
  const available = cached.filter((s) => !installedNames.has(s.name))

  if (available.length > 0) {
    console.log("\nAvailable:")
    for (const s of available) {
      console.log(`  • ${s.name} — ${s.description}`)
    }
    console.log("\nRun `otto skills add <name>` to install.")
  } else if (cached.length > 0) {
    console.log("\nAll available skills are installed.")
  }
}

async function cmdSkillsAddOne(name: string): Promise<void> {
  console.log(`Installing skill: ${name}\n`)

  const syncResult = ensureSkillsRepo()
  if (syncResult === "offline" && !discoverCachedSkills().find((s) => s.name === name)) {
    console.error(`Error: skill "${name}" not found in cache and cannot reach GitHub.`)
    process.exit(1)
  }

  const success = installSkill(name)
  if (!success) {
    console.error(`Error: skill "${name}" not found in otto-assistant/skills.`)
    process.exit(1)
  }

  console.log(`Installed ${name} → ~/.config/opencode/skills/${name}/`)

  // Warn about kimaki restart if skill requires it
  const cached = discoverCachedSkills()
  const meta = cached.find((s) => s.name === name)
  if (meta?.metadata?.["requires-kimaki"] === "true") {
    if (process.env.KIMAKI) {
      console.log("⚠ This skill requires kimaki restart. Run `kimaki restart` when ready.")
    }
  }

  console.log("Done!")
}

async function cmdSkillsAddAll(): Promise<void> {
  console.log("Installing all skills from otto-assistant/skills...\n")

  const syncResult = ensureSkillsRepo()
  if (syncResult === "offline") {
    console.log("⚠ Working offline — using cached repo.")
  }

  const cached = discoverCachedSkills()
  const installed = listInstalledSkills()
  const installedNames = new Set(installed.map((s) => s.name))

  let added = 0
  for (const skill of cached) {
    if (installedNames.has(skill.name)) {
      console.log(`  ✓ ${skill.name} (already installed)`)
      continue
    }
    const success = installSkill(skill.name)
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

async function cmdSkillsUpdate(): Promise<void> {
  console.log("Updating skills from otto-assistant/skills...\n")

  const syncResult = ensureSkillsRepo()
  if (syncResult === "offline") {
    console.log("⚠ Could not reach GitHub. Using existing cache.")
  } else if (syncResult === "cloned") {
    console.log("Cloned skills repo.")
  } else {
    console.log("Updated skills cache.")
  }

  // Reinstall all currently installed skills from updated cache
  const installed = listInstalledSkills()
  if (installed.length === 0) {
    console.log("No skills installed. Run `otto skills add --all` to get started.")
    return
  }

  let updated = 0
  for (const skill of installed) {
    const success = installSkill(skill.name)
    if (success) {
      console.log(`  ✓ ${skill.name} (updated)`)
      updated++
    } else {
      console.log(`  ⚠ ${skill.name} (not found in repo, keeping installed)`)
    }
  }

  console.log(`\n${updated} skill(s) updated.`)
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
```

Update the help text in the `default` case to include `otto skills`:

```typescript
   otto skills list          List installed and available skills
   otto skills add <name>    Install a skill from otto-assistant/skills
   otto skills add --all     Install all available skills
   otto skills update        Update skills from GitHub
   otto skills remove <name> Remove an installed skill
```

**Step 2: Build and verify CLI help**

Run: `pnpm build && node dist/cli.js`
Expected: Help text includes `otto skills` commands

**Step 3: Commit**

```bash
git add src/cli.ts
git commit -m "feat(skills): add otto skills CLI commands (list/add/update/remove)"
```

---

### Task 6: Integrate skills into `otto install` lifecycle

**Files:**
- Modify: `src/cli.ts`
- Modify: `src/config.ts`

**Step 1: Update `cmdInstall()` to install otto-core skills**

In `cmdInstall()`, after step 4 (ensureSubagentThreadSkill), add step 5:

```typescript
  // 5. Install Otto-core skills from skills repo (best-effort)
  const skillsSyncResult = ensureSkillsRepo()
  if (skillsSyncResult !== "offline") {
    const cached = discoverCachedSkills()
    const installedNames = new Set(listInstalledSkills().map((s) => s.name))
    const coreSkills = cached.filter(
      (s) => s.metadata?.category === "otto-core" && !installedNames.has(s.name),
    )
    if (coreSkills.length > 0) {
      for (const skill of coreSkills) {
        const success = installSkill(skill.name)
        if (success) {
          console.log(`Installed skill: ${skill.name}`)
        }
      }
    }
  }
```

Note: The step numbers after this need to be renumbered (kimaki restart becomes step 6).

**Step 2: Build and verify**

Run: `pnpm build && node dist/cli.js install`
Expected: Normal install flow + attempts to clone skills repo

**Step 3: Commit**

```bash
git add src/cli.ts
git commit -m "feat(skills): auto-install otto-core skills during otto install"
```

---

### Task 7: Update `otto status` and `otto doctor` for skills

**Files:**
- Modify: `src/cli.ts`

**Step 1: Add skills info to `cmdStatus()`**

After the "Config:" section in `cmdStatus()`, add:

```typescript
  console.log("\nSkills:")
  const skillsInstalled = listInstalledSkills()
  console.log(`  installed: ${skillsInstalled.length > 0 ? skillsInstalled.map((s) => s.name).join(", ") : "(none)"}`)
  const skillsCached = discoverCachedSkills()
  console.log(`  available in repo: ${skillsCached.length}`)
```

**Step 2: Add skills check to `cmdDoctor()`**

After the config checks section in `cmdDoctor()`, add:

```typescript
  console.log("\nChecking skills...")
  const skillsInstalled = listInstalledSkills()
  const skillsCached = discoverCachedSkills()
  if (skillsInstalled.length > 0) {
    console.log(`  ✓ ${skillsInstalled.length} skill(s) installed`)
  } else {
    console.log("  ⚠ No skills installed — run `otto skills add --all`")
  }
  if (skillsCached.length > 0) {
    console.log(`  ✓ Skills cache available (${skillsCached.length} skills)`)
  } else {
    console.log("  ⚠ Skills cache empty — run `otto skills update`")
  }
```

**Step 3: Build and verify**

Run: `pnpm build && node dist/cli.js status && node dist/cli.js doctor`
Expected: Both show skills info

**Step 4: Commit**

```bash
git add src/cli.ts
git commit -m "feat(skills): show skills in otto status and doctor"
```

---

### Task 8: Export skills module from index.ts

**Files:**
- Modify: `src/index.ts`

**Step 1: Add exports**

```typescript
export {
  SKILL_REPO_URL,
  SKILLS_CACHE_DIR,
  OPENCODE_SKILLS_DIR,
  parseSkillMd,
  ensureSkillsRepo,
  discoverCachedSkills,
  listInstalledSkills,
  installSkill,
  removeSkill,
} from "./skills.js"
export type { SkillMeta, RepoSyncResult } from "./skills.js"
```

**Step 2: Verify build**

Run: `pnpm build`
Expected: No errors

**Step 3: Commit**

```bash
git add src/index.ts
git commit -m "feat(skills): export skills module from package index"
```

---

### Task 9: Run full test suite and verify

**Step 1: Run all tests**

Run: `pnpm test`
Expected: ALL PASS (existing + new skills tests)

**Step 2: Run full build**

Run: `pnpm build`
Expected: Clean build, no errors

**Step 3: Test CLI end-to-end**

```bash
node dist/cli.js
node dist/cli.js skills
node dist/cli.js skills list
node dist/cli.js status
node dist/cli.js doctor
```

Expected: All commands work, skills commands show help or results

**Step 4: Commit any fixes**

```bash
git add -A
git commit -m "chore: fix any test/build issues from skills integration"
```
