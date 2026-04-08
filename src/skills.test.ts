import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import { execFileSync } from "node:child_process"
import {
  SKILL_REPO_URL,
  SKILLS_CACHE_DIR,
  OPENCODE_SKILLS_DIR,
  parseSkillMd,
  discoverCachedSkills,
  listInstalledSkills,
  installSkill,
  removeSkill,
  ensureSkillsRepo,
  type SkillMeta,
  type RepoSyncResult,
} from "./skills.js"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTmp(prefix = "otto-skills-test-"): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix))
}

function writeSkillMd(dir: string, content: string): void {
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, "SKILL.md"), content, "utf-8")
}

const VALID_SKILL_MD = `---
name: my-skill
description: A test skill
---

# My Skill

Body text here.
`

const VALID_SKILL_MD_WITH_META = `---
name: my-skill
description: A test skill with metadata
metadata:
  author: otto
  version: "1.0"
---

# My Skill

Body text here.
`

const NO_FRONTMATTER_MD = `# No frontmatter

Just a regular markdown file.
`

const MISSING_NAME_MD = `---
description: Has description but no name
---

# No name
`

const MISSING_DESC_MD = `---
name: has-name
---

# No description
`

// ---------------------------------------------------------------------------
// Task 1: Types, Constants, Parser
// ---------------------------------------------------------------------------

describe("skills constants", () => {
  it("SKILL_REPO_URL points to otto-assistant/skills", () => {
    expect(SKILL_REPO_URL).toBe("https://github.com/otto-assistant/skills.git")
  })

  it("SKILLS_CACHE_DIR returns ~/.cache/otto/skills-repo", () => {
    const home = process.env.HOME || process.env.USERPROFILE || "/root"
    expect(SKILLS_CACHE_DIR()).toBe(`${home}/.cache/otto/skills-repo`)
  })

  it("OPENCODE_SKILLS_DIR returns ~/.config/opencode/skills", () => {
    const home = process.env.HOME || process.env.USERPROFILE || "/root"
    expect(OPENCODE_SKILLS_DIR()).toBe(`${home}/.config/opencode/skills`)
  })
})

describe("parseSkillMd", () => {
  it("parses valid SKILL.md with required fields only", () => {
    const result = parseSkillMd(VALID_SKILL_MD)
    expect(result).not.toBeNull()
    expect(result!.name).toBe("my-skill")
    expect(result!.description).toBe("A test skill")
    expect(result!.metadata).toBeUndefined()
  })

  it("parses valid SKILL.md with optional metadata", () => {
    const result = parseSkillMd(VALID_SKILL_MD_WITH_META)
    expect(result).not.toBeNull()
    expect(result!.name).toBe("my-skill")
    expect(result!.description).toBe("A test skill with metadata")
    expect(result!.metadata).toEqual({ author: "otto", version: "1.0" })
  })

  it("returns null for missing frontmatter", () => {
    expect(parseSkillMd(NO_FRONTMATTER_MD)).toBeNull()
  })

  it("returns null for missing name", () => {
    expect(parseSkillMd(MISSING_NAME_MD)).toBeNull()
  })

  it("returns null for missing description", () => {
    expect(parseSkillMd(MISSING_DESC_MD)).toBeNull()
  })

  it("returns null for empty string", () => {
    expect(parseSkillMd("")).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Task 2: Skill Discovery
// ---------------------------------------------------------------------------

describe("discoverCachedSkills", () => {
  let tmpCache: string

  beforeEach(() => {
    tmpCache = makeTmp()
  })

  afterEach(() => {
    fs.rmSync(tmpCache, { recursive: true, force: true })
  })

  it("discovers skills from a fake cache dir", () => {
    writeSkillMd(path.join(tmpCache, "skills", "skill-a"), VALID_SKILL_MD)
    writeSkillMd(
      path.join(tmpCache, "skills", "skill-b"),
      VALID_SKILL_MD_WITH_META,
    )

    const skills = discoverCachedSkills(tmpCache)
    expect(skills).toHaveLength(2)
    expect(skills.map((s) => s.name).sort()).toEqual(["my-skill", "my-skill"])
  })

  it("skips invalid SKILL.md files", () => {
    writeSkillMd(path.join(tmpCache, "skills", "good-skill"), VALID_SKILL_MD)
    writeSkillMd(path.join(tmpCache, "skills", "bad-skill"), NO_FRONTMATTER_MD)

    const skills = discoverCachedSkills(tmpCache)
    expect(skills).toHaveLength(1)
    expect(skills[0].name).toBe("my-skill")
  })

  it("returns empty array for non-existent dir", () => {
    const skills = discoverCachedSkills(path.join(tmpCache, "nonexistent"))
    expect(skills).toEqual([])
  })
})

describe("listInstalledSkills", () => {
  let tmpBase: string

  beforeEach(() => {
    tmpBase = makeTmp()
  })

  afterEach(() => {
    fs.rmSync(tmpBase, { recursive: true, force: true })
  })

  it("lists skills from given base dir", () => {
    writeSkillMd(path.join(tmpBase, "installed-skill"), VALID_SKILL_MD)
    const skills = listInstalledSkills(tmpBase)
    expect(skills).toHaveLength(1)
    expect(skills[0].name).toBe("my-skill")
  })
})

// ---------------------------------------------------------------------------
// Task 3: Install / Remove
// ---------------------------------------------------------------------------

describe("installSkill", () => {
  let tmpCache: string
  let tmpTarget: string

  beforeEach(() => {
    tmpCache = makeTmp()
    tmpTarget = makeTmp()
  })

  afterEach(() => {
    fs.rmSync(tmpCache, { recursive: true, force: true })
    fs.rmSync(tmpTarget, { recursive: true, force: true })
  })

  it("copies from cache to target", () => {
    writeSkillMd(path.join(tmpCache, "skills", "test-skill"), VALID_SKILL_MD)
    // Also add an extra file to verify recursive copy
    const extraDir = path.join(tmpCache, "skills", "test-skill", "templates")
    fs.mkdirSync(extraDir, { recursive: true })
    fs.writeFileSync(path.join(extraDir, "prompt.txt"), "hello", "utf-8")

    const result = installSkill("test-skill", tmpCache, tmpTarget)
    expect(result).toBe(true)

    const installedMd = fs.readFileSync(
      path.join(tmpTarget, "test-skill", "SKILL.md"),
      "utf-8",
    )
    expect(installedMd).toContain("name: my-skill")

    const extraFile = fs.readFileSync(
      path.join(tmpTarget, "test-skill", "templates", "prompt.txt"),
      "utf-8",
    )
    expect(extraFile).toBe("hello")
  })

  it("returns false if skill not in cache", () => {
    const result = installSkill("nonexistent-skill", tmpCache, tmpTarget)
    expect(result).toBe(false)
  })

  it("returns false if SKILL.md is invalid", () => {
    writeSkillMd(
      path.join(tmpCache, "skills", "bad-skill"),
      NO_FRONTMATTER_MD,
    )
    const result = installSkill("bad-skill", tmpCache, tmpTarget)
    expect(result).toBe(false)
  })
})

describe("removeSkill", () => {
  let tmpTarget: string

  beforeEach(() => {
    tmpTarget = makeTmp()
  })

  afterEach(() => {
    fs.rmSync(tmpTarget, { recursive: true, force: true })
  })

  it("deletes installed skill", () => {
    writeSkillMd(path.join(tmpTarget, "remove-me"), VALID_SKILL_MD)
    expect(fs.existsSync(path.join(tmpTarget, "remove-me", "SKILL.md"))).toBe(true)

    const result = removeSkill("remove-me", tmpTarget)
    expect(result).toBe(true)
    expect(fs.existsSync(path.join(tmpTarget, "remove-me"))).toBe(false)
  })

  it("returns false if not installed", () => {
    const result = removeSkill("not-there", tmpTarget)
    expect(result).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Task 4: Git Cache Management
// ---------------------------------------------------------------------------

describe("ensureSkillsRepo", () => {
  let tmpCache: string
  let tmpRemote: string

  beforeEach(() => {
    tmpCache = makeTmp()
    tmpRemote = makeTmp()
  })

  afterEach(() => {
    fs.rmSync(tmpCache, { recursive: true, force: true })
    fs.rmSync(tmpRemote, { recursive: true, force: true })
  })

  it("clones repo when cache is empty", () => {
    // Create a bare git repo as fake remote
    const remotePath = path.join(tmpRemote, "skills.git")
    execFileSync("git", ["init", "--bare", remotePath], { encoding: "utf-8" })

    // Need at least one commit for clone to work
    const tmpWork = makeTmp()
    try {
      execFileSync("git", ["clone", remotePath, tmpWork], { encoding: "utf-8" })
      fs.writeFileSync(path.join(tmpWork, "README.md"), "# Skills repo\n", "utf-8")
      execFileSync("git", ["add", "."], { cwd: tmpWork, encoding: "utf-8" })
      execFileSync("git", ["commit", "-m", "init"], {
        cwd: tmpWork,
        encoding: "utf-8",
        env: { ...process.env, GIT_AUTHOR_NAME: "test", GIT_AUTHOR_EMAIL: "test@test.com", GIT_COMMITTER_NAME: "test", GIT_COMMITTER_EMAIL: "test@test.com" },
      })
      execFileSync("git", ["push", "origin", "master"], { cwd: tmpWork, encoding: "utf-8" })
    } finally {
      fs.rmSync(tmpWork, { recursive: true, force: true })
    }

    const result = ensureSkillsRepo(tmpCache, remotePath)
    expect(result).toBe("cloned")
    expect(fs.existsSync(path.join(tmpCache, ".git"))).toBe(true)
    expect(fs.existsSync(path.join(tmpCache, "README.md"))).toBe(true)
  })

  it("pulls when cache exists", () => {
    // Create a bare repo and clone into cache
    const remotePath = path.join(tmpRemote, "skills.git")
    execFileSync("git", ["init", "--bare", remotePath], { encoding: "utf-8" })

    // Initial commit on remote
    const tmpWork = makeTmp()
    try {
      execFileSync("git", ["clone", remotePath, tmpWork], { encoding: "utf-8" })
      fs.writeFileSync(path.join(tmpWork, "README.md"), "# Skills\n", "utf-8")
      execFileSync("git", ["add", "."], { cwd: tmpWork, encoding: "utf-8" })
      execFileSync("git", ["commit", "-m", "init"], {
        cwd: tmpWork,
        encoding: "utf-8",
        env: { ...process.env, GIT_AUTHOR_NAME: "test", GIT_AUTHOR_EMAIL: "test@test.com", GIT_COMMITTER_NAME: "test", GIT_COMMITTER_EMAIL: "test@test.com" },
      })
      execFileSync("git", ["push", "origin", "master"], { cwd: tmpWork, encoding: "utf-8" })
    } finally {
      fs.rmSync(tmpWork, { recursive: true, force: true })
    }

    // Clone into cache first
    execFileSync("git", ["clone", "--depth", "1", remotePath, tmpCache], { encoding: "utf-8" })

    // Now pull should succeed
    const result = ensureSkillsRepo(tmpCache, remotePath)
    expect(result).toBe("pulled")
  })

  it("returns offline on failure", () => {
    const result = ensureSkillsRepo(tmpCache, "https://invalid.example.com/nope.git")
    expect(result).toBe("offline")
  })
})
