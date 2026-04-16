# Otto Skills — GitHub API Registry & Search

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace git clone with GitHub Contents API. Otto indexes multiple public skill repos, searches locally by name/description, and installs individual skills by fetching only the needed files over HTTP.

**Architecture:** `src/skills.ts` gains a JSON-based index (`~/.cache/otto/skills-index.json`) populated by querying GitHub Contents API via `gh api` subprocess. Known repos are hardcoded with option to add more. Search filters the local index. Install fetches individual SKILL.md + supporting files from GitHub API and writes to `~/.config/opencode/skills/`. Zero new npm dependencies.

**Tech Stack:** Node.js `execFileSync("gh", ["api", ...])` for GitHub API calls, `fs` for local cache, `vitest` for tests.

---

### Task 1: Replace types and constants

**Files:**
- Modify: `src/skills.ts`

**Step 1: Update types and constants in skills.ts**

Replace the existing constants and types section (lines 1-32) with:

```typescript
import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import { execFileSync } from "node:child_process"
import { OPENCODE_CONFIG_DIR } from "./manifest.js"

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Where the JSON index lives */
export const SKILLS_INDEX_PATH = (): string => {
  const home = os.homedir()
  const cacheDir = path.join(home, ".cache", "otto")
  fs.mkdirSync(cacheDir, { recursive: true })
  return path.join(cacheDir, "skills-index.json")
}

/** Where installed skills go */
export const OPENCODE_SKILLS_DIR = (): string => {
  return path.join(OPENCODE_CONFIG_DIR(), "skills")
}

/** Default skill repos — curated, known to have quality skills */
export const DEFAULT_SKILL_REPOS: string[] = [
  "otto-assistant/skills",
  "anthropics/skills",
  "vercel-labs/agent-skills",
  "microsoft/skills",
  "obra/superpowers",
]

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SkillMeta {
  name: string
  description: string
  metadata?: Record<string, string>
}

/** One entry in the skills index */
export interface SkillIndexEntry {
  name: string
  description: string
  metadata?: Record<string, string>
  source: string    // e.g. "anthropics/skills"
  path: string      // e.g. "skills/frontend-design"
}

/** The full on-disk index */
export interface SkillsIndex {
  version: number
  updated: string   // ISO timestamp
  repos: Record<string, {
    fetched: string // ISO timestamp
    skills: SkillIndexEntry[]
  }>
}

export type RepoSyncResult = "updated" | "cached" | "offline"
```

Remove the old `SKILL_REPO_URL`, `SKILLS_CACHE_DIR`, `RepoSyncResult` type. Keep `SkillMeta` as-is.

**Step 2: Run `pnpm build` to find compile errors from removed exports**

Run: `pnpm build`
Expected: Errors because `SKILLS_CACHE_DIR`, `SKILL_REPO_URL`, `ensureSkillsRepo`, `discoverCachedSkills` no longer exist. This is expected — we'll fix in next tasks.

---

### Task 2: Keep SKILL.md parser and local discovery, remove git functions

**Files:**
- Modify: `src/skills.ts`

**Step 1: Keep parseSkillMd, listInstalledSkills, removeSkill, copyDirRecursive. Remove discoverCachedSkills, installSkill (cache-based), ensureSkillsRepo.**

After the types section, keep these functions unchanged:
- `parseSkillMd` (lines 53-93 in current file) — keep exactly as-is
- `listInstalledSkills` (lines 105-108) — keep exactly as-is
- `removeSkill` (lines 180-188) — keep exactly as-is
- `copyDirRecursive` (lines 191-203) — keep exactly as-is

Remove these functions entirely:
- `discoverCachedSkills` — replaced by index-based search
- `installSkill` (cache-based version) — replaced by API-based install
- `ensureSkillsRepo` — no more git clone

Keep the `discoverSkills` internal helper (used by `listInstalledSkills`).

---

### Task 3: Add GitHub API helpers

**Files:**
- Modify: `src/skills.ts`
- Modify: `src/skills.test.ts`

**Step 1: Write failing test for ghApi**

Add to `src/skills.test.ts`:

```typescript
describe("ghApi", () => {
  it("fetches JSON from GitHub API", async () => {
    // This is an integration test — requires `gh` to be authenticated
    // Skip if gh is not available or not authenticated
    let hasGh = false
    try {
      execFileSync("gh", ["auth", "status"], { encoding: "utf-8", stdio: "pipe" })
      hasGh = true
    } catch {
      // gh not available
    }
    if (!hasGh) return

    const result = await ghApi("repos/anthropics/skills/contents/skills")
    expect(Array.isArray(result)).toBe(true)
    expect(result.length).toBeGreaterThan(0)
    expect(result[0].name).toBeDefined()
    expect(result[0].type).toBeDefined()
  })
})
```

**Step 2: Implement ghApi**

Add to `src/skills.ts`:

```typescript
// ---------------------------------------------------------------------------
// GitHub API (via gh CLI)
// ---------------------------------------------------------------------------

/**
 * Call GitHub API using `gh api`. Returns parsed JSON.
 * Throws on network/auth errors or non-2xx responses.
 */
export function ghApi(endpoint: string): unknown {
  const result = execFileSync("gh", ["api", endpoint], {
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
    timeout: 15_000,
  })
  return JSON.parse(result)
}

/**
 * Fetch directory listing from a GitHub repo path.
 * Returns array of {name, type, path} entries, or empty array on error.
 */
export function fetchRepoDir(ownerRepo: string, dirPath: string): Array<{ name: string; type: string; path: string }> {
  try {
    const result = ghApi(`repos/${ownerRepo}/contents/${dirPath}`)
    if (!Array.isArray(result)) return []
    return result
      .filter((item: any) => typeof item.name === "string" && typeof item.type === "string")
      .map((item: any) => ({ name: item.name, type: item.type, path: item.path }))
  } catch {
    return []
  }
}

/**
 * Fetch a single file content from a GitHub repo.
 * Returns decoded UTF-8 string, or null on error.
 */
export function fetchRepoFile(ownerRepo: string, filePath: string): string | null {
  try {
    const result = ghApi(`repos/${ownerRepo}/contents/${filePath}`) as { content?: string; encoding?: string }
    if (!result.content || result.encoding !== "base64") return null
    return Buffer.from(result.content, "base64").toString("utf-8")
  } catch {
    return null
  }
}
```

**Step 3: Run `pnpm test -- --reporter=verbose skills.test.ts`**

Expected: ghApi integration test passes (if gh is authenticated).

---

### Task 4: Add skills index — load, save, fetch

**Files:**
- Modify: `src/skills.ts`
- Modify: `src/skills.test.ts`

**Step 1: Write failing tests for index operations**

Add to `src/skills.test.ts`:

```typescript
describe("Skills Index", () => {
  let tmpIndexDir: string

  beforeEach(() => {
    tmpIndexDir = makeTmp()
  })

  afterEach(() => {
    fs.rmSync(tmpIndexDir, { recursive: true, force: true })
  })

  it("loadSkillsIndex returns empty index when file missing", () => {
    const indexPath = path.join(tmpIndexDir, "skills-index.json")
    const idx = loadSkillsIndex(indexPath)
    expect(idx.version).toBe(1)
    expect(idx.repos).toEqual({})
  })

  it("saveSkillsIndex + loadSkillsIndex roundtrip", () => {
    const indexPath = path.join(tmpIndexDir, "skills-index.json")
    const idx: SkillsIndex = {
      version: 1,
      updated: new Date().toISOString(),
      repos: {
        "anthropics/skills": {
          fetched: new Date().toISOString(),
          skills: [
            { name: "pdf", description: "Create PDF files", source: "anthropics/skills", path: "skills/pdf" },
          ],
        },
      },
    }
    saveSkillsIndex(idx, indexPath)
    const loaded = loadSkillsIndex(indexPath)
    expect(loaded.repos["anthropics/skills"].skills).toHaveLength(1)
    expect(loaded.repos["anthropics/skills"].skills[0].name).toBe("pdf")
  })

  it("isIndexStale returns true for old timestamps", () => {
    const oldDate = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString() // 25h ago
    expect(isIndexStale(oldDate, 24)).toBe(true)
    expect(isIndexStale(new Date().toISOString(), 24)).toBe(false)
  })
})
```

**Step 2: Implement loadSkillsIndex, saveSkillsIndex, isIndexStale**

Add to `src/skills.ts`:

```typescript
// ---------------------------------------------------------------------------
// Skills Index (JSON cache)
// ---------------------------------------------------------------------------

/** Load index from disk. Returns empty index if file doesn't exist. */
export function loadSkillsIndex(indexPath?: string): SkillsIndex {
  const p = indexPath ?? SKILLS_INDEX_PATH()
  try {
    const raw = fs.readFileSync(p, "utf-8")
    return JSON.parse(raw) as SkillsIndex
  } catch {
    return { version: 1, updated: "", repos: {} }
  }
}

/** Save index to disk. */
export function saveSkillsIndex(index: SkillsIndex, indexPath?: string): void {
  const p = indexPath ?? SKILLS_INDEX_PATH()
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, JSON.stringify(index, null, 2), "utf-8")
}

/** Check if a fetched timestamp is older than maxAgeHours. */
export function isIndexStale(fetchedAt: string, maxAgeHours = 24): boolean {
  if (!fetchedAt) return true
  const fetched = new Date(fetchedAt).getTime()
  return Date.now() - fetched > maxAgeHours * 60 * 60 * 1000
}
```

**Step 3: Run tests**

Run: `pnpm test -- --reporter=verbose skills.test.ts`
Expected: Index load/save/stale tests pass.

---

### Task 5: Add fetchRepoSkillsIndex — index a single repo via GitHub API

**Files:**
- Modify: `src/skills.ts`
- Modify: `src/skills.test.ts`

**Step 1: Write failing test**

Add to `src/skills.test.ts`:

```typescript
describe("fetchRepoSkillsIndex", () => {
  it("indexes skills from anthropics/skills (integration)", () => {
    let hasGh = false
    try {
      execFileSync("gh", ["auth", "status"], { encoding: "utf-8", stdio: "pipe" })
      hasGh = true
    } catch { /* skip */ }
    if (!hasGh) return

    const entries = fetchRepoSkillsIndex("anthropics/skills")
    expect(entries.length).toBeGreaterThan(0)
    // Every entry should have name, description, source, path
    for (const entry of entries) {
      expect(entry.name).toBeTruthy()
      expect(entry.description).toBeTruthy()
      expect(entry.source).toBe("anthropics/skills")
      expect(entry.path).toContain("skills/")
    }
  })
})
```

**Step 2: Implement fetchRepoSkillsIndex**

Add to `src/skills.ts`:

```typescript
/**
 * Index all skills from a single GitHub repo by fetching directory listings + SKILL.md frontmatter.
 * Works with repos that have skills at `skills/<name>/SKILL.md` (flat or nested).
 * Returns array of SkillIndexEntry.
 */
export function fetchRepoSkillsIndex(ownerRepo: string): SkillIndexEntry[] {
  const entries: SkillIndexEntry[] = []

  // Try "skills" directory first (most common pattern)
  const topDirs = fetchRepoDir(ownerRepo, "skills")

  for (const item of topDirs) {
    if (item.type !== "dir") continue

    // Try flat: skills/<name>/SKILL.md
    const skillMd = fetchRepoFile(ownerRepo, `${item.path}/SKILL.md`)
    if (skillMd) {
      const meta = parseSkillMd(skillMd)
      if (meta) {
        entries.push({
          name: meta.name,
          description: meta.description,
          metadata: meta.metadata,
          source: ownerRepo,
          path: item.path,
        })
        continue // found SKILL.md directly — no need to recurse
      }
    }

    // Try nested: skills/<category>/<name>/SKILL.md (microsoft/skills pattern)
    const subDirs = fetchRepoDir(ownerRepo, item.path)
    for (const sub of subDirs) {
      if (sub.type !== "dir") continue
      const subMd = fetchRepoFile(ownerRepo, `${sub.path}/SKILL.md`)
      if (subMd) {
        const meta = parseSkillMd(subMd)
        if (meta) {
          entries.push({
            name: meta.name,
            description: meta.description,
            metadata: meta.metadata,
            source: ownerRepo,
            path: sub.path,
          })
        }
      }
    }
  }

  return entries
}
```

**Step 3: Run integration test**

Run: `pnpm test -- --reporter=verbose skills.test.ts`
Expected: Integration test indexes 16+ skills from anthropics/skills.

**Step 4: Commit**

```bash
git add src/skills.ts src/skills.test.ts
git commit -m "feat(skills): add GitHub API indexer for public skill repos"
```

---

### Task 6: Add ensureSkillsIndex + searchSkills

**Files:**
- Modify: `src/skills.ts`
- Modify: `src/skills.test.ts`

**Step 1: Write failing tests**

Add to `src/skills.test.ts`:

```typescript
describe("searchSkills", () => {
  let tmpIndex: string

  beforeEach(() => {
    tmpIndex = path.join(makeTmp(), "skills-index.json")
  })

  afterEach(() => {
    fs.rmSync(path.dirname(tmpIndex), { recursive: true, force: true })
  })

  it("finds skills by name substring", () => {
    const idx: SkillsIndex = {
      version: 1,
      updated: new Date().toISOString(),
      repos: {
        "anthropics/skills": {
          fetched: new Date().toISOString(),
          skills: [
            { name: "frontend-design", description: "Design web frontends", source: "anthropics/skills", path: "skills/frontend-design" },
            { name: "pdf", description: "Create PDF documents", source: "anthropics/skills", path: "skills/pdf" },
            { name: "react-best", description: "React best practices", source: "vercel-labs/agent-skills", path: "skills/react-best" },
          ],
        },
        "vercel-labs/agent-skills": {
          fetched: new Date().toISOString(),
          skills: [
            { name: "react-best", description: "React best practices", source: "vercel-labs/agent-skills", path: "skills/react-best" },
          ],
        },
      },
    }
    saveSkillsIndex(idx, tmpIndex)
    const results = searchSkills("react", tmpIndex)
    expect(results).toHaveLength(1)
    expect(results[0].name).toBe("react-best")
  })

  it("finds skills by description substring", () => {
    const idx: SkillsIndex = {
      version: 1,
      updated: new Date().toISOString(),
      repos: {
        "anthropics/skills": {
          fetched: new Date().toISOString(),
          skills: [
            { name: "pdf", description: "Create PDF documents from markdown", source: "anthropics/skills", path: "skills/pdf" },
          ],
        },
      },
    }
    saveSkillsIndex(idx, tmpIndex)
    const results = searchSkills("PDF", tmpIndex)
    expect(results).toHaveLength(1)
    expect(results[0].name).toBe("pdf")
  })

  it("returns empty array for no matches", () => {
    const idx: SkillsIndex = {
      version: 1,
      updated: new Date().toISOString(),
      repos: {
        "anthropics/skills": {
          fetched: new Date().toISOString(),
          skills: [
            { name: "pdf", description: "Create PDF documents", source: "anthropics/skills", path: "skills/pdf" },
          ],
        },
      },
    }
    saveSkillsIndex(idx, tmpIndex)
    const results = searchSkills("nonexistent-xyz", tmpIndex)
    expect(results).toHaveLength(0)
  })
})
```

**Step 2: Implement searchSkills and ensureSkillsIndex**

Add to `src/skills.ts`:

```typescript
// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

/**
 * Search indexed skills by query. Matches against name and description (case-insensitive).
 */
export function searchSkills(query: string, indexPath?: string): SkillIndexEntry[] {
  const index = loadSkillsIndex(indexPath)
  const q = query.toLowerCase()
  const results: SkillIndexEntry[] = []

  for (const repoData of Object.values(index.repos)) {
    for (const skill of repoData.skills) {
      if (
        skill.name.toLowerCase().includes(q) ||
        skill.description.toLowerCase().includes(q)
      ) {
        results.push(skill)
      }
    }
  }

  return results
}

/**
 * Get all indexed skills across all repos.
 */
export function getAllIndexedSkills(indexPath?: string): SkillIndexEntry[] {
  const index = loadSkillsIndex(indexPath)
  const all: SkillIndexEntry[] = []
  for (const repoData of Object.values(index.repos)) {
    all.push(...repoData.skills)
  }
  return all
}

// ---------------------------------------------------------------------------
// Index refresh
// ---------------------------------------------------------------------------

/**
 * Get configured repos: DEFAULT_SKILL_REPOS + any user-added repos from otto.json.
 * (For now, just returns DEFAULT_SKILL_REPOS.)
 */
export function getConfiguredRepos(): string[] {
  return [...DEFAULT_SKILL_REPOS]
}

/**
 * Refresh the skills index by fetching all configured repos.
 * Skips repos that were fetched recently (within maxAgeHours).
 * Returns the number of repos refreshed.
 */
export function ensureSkillsIndex(maxAgeHours = 24, indexPath?: string): { refreshed: number; total: number } {
  const index = loadSkillsIndex(indexPath)
  const repos = getConfiguredRepos()
  let refreshed = 0

  for (const repo of repos) {
    const existing = index.repos[repo]
    if (existing && !isIndexStale(existing.fetched, maxAgeHours)) {
      continue // still fresh
    }

    try {
      const skills = fetchRepoSkillsIndex(repo)
      index.repos[repo] = {
        fetched: new Date().toISOString(),
        skills,
      }
      refreshed++
    } catch {
      // Failed to fetch — keep existing data if any, or skip
      if (!existing) {
        index.repos[repo] = { fetched: "", skills: [] }
      }
    }
  }

  index.updated = new Date().toISOString()
  saveSkillsIndex(index, indexPath)
  return { refreshed, total: repos.length }
}
```

**Step 3: Run tests**

Run: `pnpm test -- --reporter=verbose skills.test.ts`
Expected: searchSkills tests pass.

**Step 4: Commit**

```bash
git add src/skills.ts src/skills.test.ts
git commit -m "feat(skills): add searchSkills + ensureSkillsIndex"
```

---

### Task 7: Add API-based installSkillFromIndex

**Files:**
- Modify: `src/skills.ts`
- Modify: `src/skills.test.ts`

**Step 1: Write failing test**

Add to `src/skills.test.ts`:

```typescript
describe("installSkillFromIndex", () => {
  let tmpTarget: string
  let tmpIndex: string

  beforeEach(() => {
    tmpTarget = makeTmp()
    tmpIndex = path.join(makeTmp(), "skills-index.json")
  })

  afterEach(() => {
    fs.rmSync(tmpTarget, { recursive: true, force: true })
    fs.rmSync(path.dirname(tmpIndex), { recursive: true, force: true })
  })

  it("returns false if skill not found in index", () => {
    const idx: SkillsIndex = {
      version: 1,
      updated: new Date().toISOString(),
      repos: {},
    }
    saveSkillsIndex(idx, tmpIndex)

    const result = installSkillFromIndex("nonexistent", tmpTarget, tmpIndex)
    expect(result).toBe(false)
  })

  it("returns entry info when skill is found in index", () => {
    // This is an integration test — requires gh auth
    let hasGh = false
    try {
      execFileSync("gh", ["auth", "status"], { encoding: "utf-8", stdio: "pipe" })
      hasGh = true
    } catch { /* skip */ }
    if (!hasGh) return

    const idx: SkillsIndex = {
      version: 1,
      updated: new Date().toISOString(),
      repos: {
        "otto-assistant/skills": {
          fetched: new Date().toISOString(),
          skills: [
            { name: "otto-subagent-threads", description: "Enforce Discord threads", source: "otto-assistant/skills", path: "skills/otto-subagent-threads" },
          ],
        },
      },
    }
    saveSkillsIndex(idx, tmpIndex)

    const result = installSkillFromIndex("otto-subagent-threads", tmpTarget, tmpIndex)
    expect(result).toBe(true)
    // Check SKILL.md was written
    const skillMd = fs.readFileSync(path.join(tmpTarget, "otto-subagent-threads", "SKILL.md"), "utf-8")
    expect(skillMd).toContain("name: otto-subagent-threads")
  })
})
```

**Step 2: Implement installSkillFromIndex**

Add to `src/skills.ts`:

```typescript
/**
 * Install a skill from the index by fetching its files from GitHub API.
 * Looks up the skill in the index, fetches SKILL.md (and any supporting files),
 * writes them to the target directory.
 *
 * Returns true if installed, false if not found in index or fetch failed.
 */
export function installSkillFromIndex(
  skillName: string,
  targetDir?: string,
  indexPath?: string,
): boolean {
  const target = targetDir ?? OPENCODE_SKILLS_DIR()
  const index = loadSkillsIndex(indexPath)

  // Find skill in index
  let entry: SkillIndexEntry | undefined
  for (const repoData of Object.values(index.repos)) {
    entry = repoData.skills.find((s) => s.name === skillName)
    if (entry) break
  }

  if (!entry) return false

  // Fetch SKILL.md from GitHub
  const skillMd = fetchRepoFile(entry.source, `${entry.path}/SKILL.md`)
  if (!skillMd) return false

  // Validate it parses
  const meta = parseSkillMd(skillMd)
  if (!meta) return false

  // Write SKILL.md
  const destDir = path.join(target, skillName)
  fs.mkdirSync(destDir, { recursive: true })
  fs.writeFileSync(path.join(destDir, "SKILL.md"), skillMd, "utf-8")

  // Fetch any supporting files in the same directory
  const dirContents = fetchRepoDir(entry.source, entry.path)
  for (const item of dirContents) {
    if (item.name === "SKILL.md") continue
    if (item.type === "file") {
      const fileContent = fetchRepoFile(entry.source, item.path)
      if (fileContent) {
        fs.writeFileSync(path.join(destDir, item.name), fileContent, "utf-8")
      }
    } else if (item.type === "dir") {
      // Recursively fetch subdirectories (e.g., references/, templates/)
      fetchDirRecursive(entry.source, item.path, path.join(destDir, item.name))
    }
  }

  return true
}

/**
 * Recursively fetch a directory from GitHub and write to local disk.
 */
function fetchDirRecursive(ownerRepo: string, ghPath: string, localPath: string): void {
  fs.mkdirSync(localPath, { recursive: true })
  const contents = fetchRepoDir(ownerRepo, ghPath)
  for (const item of contents) {
    if (item.type === "file") {
      const content = fetchRepoFile(ownerRepo, item.path)
      if (content) {
        fs.writeFileSync(path.join(localPath, item.name), content, "utf-8")
      }
    } else if (item.type === "dir") {
      fetchDirRecursive(ownerRepo, item.path, path.join(localPath, item.name))
    }
  }
}
```

**Step 3: Run tests**

Run: `pnpm test -- --reporter=verbose skills.test.ts`
Expected: installSkillFromIndex tests pass.

**Step 4: Commit**

```bash
git add src/skills.ts src/skills.test.ts
git commit -m "feat(skills): add installSkillFromIndex with GitHub API fetch"
```

---

### Task 8: Rewrite CLI skills commands

**Files:**
- Modify: `src/cli.ts`

**Step 1: Update imports in cli.ts**

Replace the skills imports with:

```typescript
import {
  searchSkills,
  getAllIndexedSkills,
  listInstalledSkills,
  installSkillFromIndex,
  removeSkill,
  ensureSkillsIndex,
  getConfiguredRepos,
  DEFAULT_SKILL_REPOS,
  type SkillIndexEntry,
  type SkillMeta,
} from "./skills.js"
```

**Step 2: Replace cmdSkills and all sub-functions**

Replace the entire `// otto skills sub-commands` section with:

```typescript
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

  // Make sure index is up to date
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
  console.log(`Index now has ${allSkills.length} skills from ${Object.keys(loadSkillsIndex().repos).length} repos.`)
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
```

**Step 3: Update cmdInstall to use new API**

In `cmdInstall()`, replace step 5 (lines 94-108) with:

```typescript
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
    // Best effort — don't fail install if skills fetch fails
    console.log("⚠ Could not fetch skills from GitHub (offline?). Skipping.")
  }
```

**Step 4: Update cmdStatus skills section**

Replace the skills section in `cmdStatus()` with:

```typescript
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
```

**Step 5: Update cmdDoctor skills section**

Replace the skills section in `cmdDoctor()` with:

```typescript
  console.log("\nChecking skills...")
  const skillsInstalled = listInstalledSkills()
  if (skillsInstalled.length > 0) {
    console.log(`  ✓ ${skillsInstalled.length} skill(s) installed`)
  } else {
    console.log("  ⚠ No skills installed — run `otto skills add --all`")
  }
  try {
    const index = loadSkillsIndex()
    const totalIndexed = getAllIndexedSkills().length
    if (totalIndexed > 0) {
      console.log(`  ✓ Skills index available (${totalIndexed} skills)`)
    } else {
      console.log("  ⚠ Skills index empty — run `otto skills update`")
    }
  } catch {
    console.log("  ⚠ Skills index unavailable")
  }
```

**Step 6: Update main router help text**

Update the default help text to:

```typescript
   otto skills search <q>  Search skills across public repos
   otto skills browse      Browse all available skills
   otto skills list        List installed skills
   otto skills add <name>  Install a skill
   otto skills add --all   Install all otto-assistant/skills
   otto skills update      Refresh skills index
   otto skills remove <n>  Remove an installed skill
   otto skills repos       Show configured repositories
```

**Step 7: Build and verify**

Run: `pnpm build && node dist/cli.js`
Expected: Help text shows new commands.

**Step 8: Commit**

```bash
git add src/cli.ts
git commit -m "feat(skills): rewrite CLI with search, browse, multi-repo support"
```

---

### Task 9: Update exports in index.ts

**Files:**
- Modify: `src/index.ts`

**Step 1: Replace skills exports**

Replace the skills export block with:

```typescript
export {
  OPENCODE_SKILLS_DIR,
  SKILLS_INDEX_PATH,
  DEFAULT_SKILL_REPOS,
  parseSkillMd,
  loadSkillsIndex,
  saveSkillsIndex,
  isIndexStale,
  ensureSkillsIndex,
  searchSkills,
  getAllIndexedSkills,
  fetchRepoSkillsIndex,
  ghApi,
  fetchRepoDir,
  fetchRepoFile,
  listInstalledSkills,
  installSkillFromIndex,
  removeSkill,
  getConfiguredRepos,
} from "./skills.js"
export type { SkillMeta, SkillIndexEntry, SkillsIndex, RepoSyncResult } from "./skills.js"
```

**Step 2: Build**

Run: `pnpm build`
Expected: Clean build.

**Step 3: Commit**

```bash
git add src/index.ts
git commit -m "feat(skills): update package exports for new API"
```

---

### Task 10: End-to-end test

**Step 1: Run all tests**

Run: `pnpm test`
Expected: ALL PASS (existing tests may need minor adjustments for removed functions).

**Step 2: Fix any broken tests**

If old tests reference removed functions (`discoverCachedSkills`, `installSkill`, `ensureSkillsRepo`, `SKILLS_CACHE_DIR`, `SKILL_REPO_URL`), update them to use the new API or remove them.

**Step 3: Build**

Run: `pnpm build`

**Step 4: Manual smoke tests**

```bash
node dist/cli.js skills search react
node dist/cli.js skills browse
node dist/cli.js skills list
node dist/cli.js skills repos
node dist/cli.js status
node dist/cli.js doctor
```

Expected: search returns results from multiple repos, browse shows all, list shows installed.

**Step 5: Test install**

```bash
node dist/cli.js skills add pdf
node dist/cli.js skills list
node dist/cli.js skills remove pdf
```

**Step 6: Commit fixes**

```bash
git add -A
git commit -m "fix: update tests for new skills API"
```

---

### Task 11: Clean up old git-based code

**Files:**
- Modify: `src/skills.ts`

**Step 1: Remove unused git-related code**

Remove any remaining references to:
- `SKILLS_CACHE_DIR`
- `SKILL_REPO_URL`
- `ensureSkillsRepo` (old git version)
- `discoverCachedSkills`
- Old `installSkill` (cache-based)
- `import { execFileSync }` usage for `git` commands (keep for `gh api`)

Remove the old `~/.cache/otto/skills-repo/` cache directory pattern.

**Step 2: Final build + test**

Run: `pnpm build && pnpm test`
Expected: All pass.

**Step 3: Commit**

```bash
git add src/skills.ts
git commit -m "chore: remove old git-clone skills code"
```
