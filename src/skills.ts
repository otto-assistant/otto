import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import { execFileSync } from "node:child_process"
import { OPENCODE_CONFIG_DIR } from "./manifest.js"

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const SKILL_REPO_URL = "https://github.com/otto-assistant/skills.git"

export const SKILLS_CACHE_DIR = (): string => {
  const home = process.env.HOME || process.env.USERPROFILE || "/root"
  return `${home}/.cache/otto/skills-repo`
}

export const OPENCODE_SKILLS_DIR = (): string => {
  return path.join(OPENCODE_CONFIG_DIR(), "skills")
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SkillMeta {
  name: string
  description: string
  metadata?: Record<string, string>
}

export type RepoSyncResult = "cloned" | "pulled" | "offline"

// ---------------------------------------------------------------------------
// Task 1: SKILL.md Parser
// ---------------------------------------------------------------------------

/**
 * Parses YAML frontmatter from skill markdown content.
 * Returns null if no valid frontmatter or missing required fields (name, description).
 *
 * Supported frontmatter format:
 * ```
 * ---
 * name: skill-name
 * description: Short description
 * metadata:
 *   key1: value1
 *   key2: value2
 * ---
 * ```
 */
export function parseSkillMd(content: string): SkillMeta | null {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!match) return null

  const frontmatter = match[1]

  // Extract name
  const nameMatch = frontmatter.match(/^name:\s*(.+)$/m)
  if (!nameMatch) return null
  const name = nameMatch[1].trim()

  // Extract description
  const descMatch = frontmatter.match(/^description:\s*(.+)$/m)
  if (!descMatch) return null
  const description = descMatch[1].trim()

  // Extract optional metadata block (indented key-value pairs under "metadata:")
  const meta: Record<string, string> = {}
  const metaMatch = frontmatter.match(/^metadata:\s*\r?\n((?:\s{2,}\S.*\r?\n?)*)/m)
  if (metaMatch) {
    const metaBlock = metaMatch[1]
    const lines = metaBlock.split(/\r?\n/).filter((l) => l.trim().length > 0)
    for (const line of lines) {
      const kv = line.trim().match(/^(\S+):\s*(.+)$/)
      if (kv) {
        let val = kv[2].trim()
        // Strip surrounding quotes (single or double)
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
// Task 2: Skill Discovery
// ---------------------------------------------------------------------------

/** Scans cacheDir/skills/* for cached skills. Returns valid SkillMeta entries. */
export function discoverCachedSkills(cacheDir: string): SkillMeta[] {
  return discoverSkills(path.join(cacheDir, "skills"))
}

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
// Task 3: Install / Remove
// ---------------------------------------------------------------------------

/**
 * Copies a skill directory from cache to the target install location.
 * Validates skill metadata exists and is valid before copying.
 * Returns true on success, false if not found or invalid.
 */
export function installSkill(
  name: string,
  cacheDir?: string,
  targetDir?: string,
): boolean {
  const cache = cacheDir ?? SKILLS_CACHE_DIR()
  const target = targetDir ?? OPENCODE_SKILLS_DIR()

  const sourceSkillDir = path.join(cache, "skills", name)
  const sourceSkillMd = path.join(sourceSkillDir, "SKILL.md")

  // Validate source exists
  if (!fs.existsSync(sourceSkillMd)) return false

  // Validate SKILL.md parses correctly
  try {
    const content = fs.readFileSync(sourceSkillMd, "utf-8")
    const meta = parseSkillMd(content)
    if (!meta) return false
  } catch {
    return false
  }

  // Copy to target
  const destSkillDir = path.join(target, name)
  fs.mkdirSync(target, { recursive: true })
  copyDirRecursive(sourceSkillDir, destSkillDir)
  return true
}

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

/** Recursively copy a directory. */
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

// ---------------------------------------------------------------------------
// Task 4: Git Cache Management
// ---------------------------------------------------------------------------

/**
 * Ensures the skills repo is available locally.
 * - If cache dir has no `.git`, clones with `git clone --depth 1`.
 * - Otherwise does `git pull --ff-only`.
 * - Returns "offline" on any failure.
 */
export function ensureSkillsRepo(
  cacheDir?: string,
  repoUrl?: string,
): RepoSyncResult {
  const cache = cacheDir ?? SKILLS_CACHE_DIR()
  const url = repoUrl ?? SKILL_REPO_URL

  const gitDir = path.join(cache, ".git")

  if (!fs.existsSync(gitDir)) {
    // Clone
    try {
      execFileSync("git", ["clone", "--depth", "1", url, cache], {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
        timeout: 60_000,
      })
      return "cloned"
    } catch {
      return "offline"
    }
  } else {
    // Pull
    try {
      execFileSync("git", ["pull", "--ff-only"], {
        encoding: "utf-8",
        cwd: cache,
        stdio: ["pipe", "pipe", "pipe"],
        timeout: 30_000,
      })
      return "pulled"
    } catch {
      return "offline"
    }
  }
}
