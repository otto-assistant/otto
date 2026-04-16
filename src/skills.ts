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

// ---------------------------------------------------------------------------
// SKILL.md Parser (unchanged)
// ---------------------------------------------------------------------------

/**
 * Parses YAML frontmatter from skill markdown content.
 * Returns null if no valid frontmatter or missing required fields (name, description).
 */
export function parseSkillMd(content: string): SkillMeta | null {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!match) return null

  const frontmatter = match[1]

  const nameMatch = frontmatter.match(/^name:\s*(.+)$/m)
  if (!nameMatch) return null
  const name = nameMatch[1].trim()

  const descMatch = frontmatter.match(/^description:\s*(.+)$/m)
  if (!descMatch) return null
  const description = descMatch[1].trim()

  const meta: Record<string, string> = {}
  const metaMatch = frontmatter.match(/^metadata:\s*\r?\n((?:\s{2,}\S.*\r?\n?)*)/m)
  if (metaMatch) {
    const metaBlock = metaMatch[1]
    const lines = metaBlock.split(/\r?\n/).filter((l) => l.trim().length > 0)
    for (const line of lines) {
      const kv = line.trim().match(/^(\S+):\s*(.+)$/)
      if (kv) {
        let val = kv[2].trim()
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1)
        }
        meta[kv[1]] = val
      }
    }
  }

  return {
    name,
    description,
    ...(Object.keys(meta).length > 0 ? { metadata: meta } : {}),
  }
}

// ---------------------------------------------------------------------------
// Local skill discovery
// ---------------------------------------------------------------------------

/** Lists installed skills from OPENCODE_SKILLS_DIR. */
export function listInstalledSkills(baseDir?: string): SkillMeta[] {
  const dir = baseDir ?? OPENCODE_SKILLS_DIR()
  return discoverSkills(dir)
}

/** Internal: scan dir subdirectories and parse skill markdown files. */
function discoverSkills(dir: string): SkillMeta[] {
  const results: SkillMeta[] = []

  let entries: string[]
  try {
    entries = fs.readdirSync(dir)
  } catch {
    return results
  }

  for (const entry of entries) {
    const skillMdPath = path.join(dir, entry, "SKILL.md")
    try {
      const content = fs.readFileSync(skillMdPath, "utf-8")
      const meta = parseSkillMd(content)
      if (meta) {
        results.push(meta)
      }
    } catch {
      // skip invalid or missing SKILL.md
    }
  }

  return results
}

// ---------------------------------------------------------------------------
// Remove installed skill
// ---------------------------------------------------------------------------

/**
 * Removes an installed skill directory.
 * Returns true if removed, false if not found.
 */
export function removeSkill(name: string, targetDir?: string): boolean {
  const target = targetDir ?? OPENCODE_SKILLS_DIR()
  const skillDir = path.join(target, name)

  if (!fs.existsSync(skillDir)) return false

  fs.rmSync(skillDir, { recursive: true, force: true })
  return true
}

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

// ---------------------------------------------------------------------------
// Index a single repo via GitHub API
// ---------------------------------------------------------------------------

/**
 * Index all skills from a single GitHub repo by fetching directory listings + SKILL.md frontmatter.
 * Works with repos that have skills at `skills/<name>/SKILL.md` (flat or nested one level).
 * Returns array of SkillIndexEntry.
 */
export function fetchRepoSkillsIndex(ownerRepo: string): SkillIndexEntry[] {
  const entries: SkillIndexEntry[] = []

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
        continue
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
 * Get configured repos: DEFAULT_SKILL_REPOS + any user-added repos.
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
      if (!existing) {
        index.repos[repo] = { fetched: "", skills: [] }
      }
    }
  }

  index.updated = new Date().toISOString()
  saveSkillsIndex(index, indexPath)
  return { refreshed, total: repos.length }
}

// ---------------------------------------------------------------------------
// Install from index (API-based)
// ---------------------------------------------------------------------------

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
