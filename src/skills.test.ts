import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import { execFileSync } from "node:child_process"
import {
  SKILLS_INDEX_PATH,
  OPENCODE_SKILLS_DIR,
  DEFAULT_SKILL_REPOS,
  parseSkillMd,
  listInstalledSkills,
  removeSkill,
  loadSkillsIndex,
  saveSkillsIndex,
  isIndexStale,
  searchSkills,
  getAllIndexedSkills,
  getConfiguredRepos,
  installSkillFromIndex,
  installSkillsBaseline,
  fetchRepoSkillsIndex,
  type SkillIndexEntry,
  type SkillsIndex,
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
// Constants
// ---------------------------------------------------------------------------

describe("skills constants", () => {
  it("DEFAULT_SKILL_REPOS includes key repos", () => {
    expect(DEFAULT_SKILL_REPOS).toContain("otto-assistant/skills")
    expect(DEFAULT_SKILL_REPOS).toContain("anthropics/skills")
    expect(DEFAULT_SKILL_REPOS).toContain("vercel-labs/agent-skills")
    expect(DEFAULT_SKILL_REPOS.length).toBeGreaterThanOrEqual(3)
  })

  it("SKILLS_INDEX_PATH returns ~/.cache/otto/skills-index.json", () => {
    const home = process.env.HOME || process.env.USERPROFILE || "/root"
    expect(SKILLS_INDEX_PATH()).toContain(".cache/otto/skills-index.json")
  })

  it("OPENCODE_SKILLS_DIR returns ~/.config/opencode/skills", () => {
    expect(OPENCODE_SKILLS_DIR()).toContain(".config/opencode/skills")
  })
})

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

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
// Local skill discovery
// ---------------------------------------------------------------------------

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

  it("returns empty array for non-existent dir", () => {
    const skills = listInstalledSkills(path.join(tmpBase, "nonexistent"))
    expect(skills).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Remove skill
// ---------------------------------------------------------------------------

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
// Skills Index — load, save, stale check
// ---------------------------------------------------------------------------

describe("Skills Index", () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = makeTmp()
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it("loadSkillsIndex returns empty index when file missing", () => {
    const indexPath = path.join(tmpDir, "skills-index.json")
    const idx = loadSkillsIndex(indexPath)
    expect(idx.version).toBe(1)
    expect(idx.repos).toEqual({})
  })

  it("saveSkillsIndex + loadSkillsIndex roundtrip", () => {
    const indexPath = path.join(tmpDir, "skills-index.json")
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
    const oldDate = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString()
    expect(isIndexStale(oldDate, 24)).toBe(true)
    expect(isIndexStale(new Date().toISOString(), 24)).toBe(false)
    expect(isIndexStale("", 24)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

describe("searchSkills", () => {
  let tmpIndex: string

  beforeEach(() => {
    tmpIndex = path.join(makeTmp(), "skills-index.json")
  })

  afterEach(() => {
    fs.rmSync(path.dirname(tmpIndex), { recursive: true, force: true })
  })

  function makeTestIndex(): SkillsIndex {
    return {
      version: 1,
      updated: new Date().toISOString(),
      repos: {
        "anthropics/skills": {
          fetched: new Date().toISOString(),
          skills: [
            { name: "frontend-design", description: "Design web frontends", source: "anthropics/skills", path: "skills/frontend-design" },
            { name: "pdf", description: "Create PDF documents", source: "anthropics/skills", path: "skills/pdf" },
          ],
        },
        "vercel-labs/agent-skills": {
          fetched: new Date().toISOString(),
          skills: [
            { name: "react-best-practices", description: "React and Next.js performance patterns", source: "vercel-labs/agent-skills", path: "skills/react-best-practices" },
          ],
        },
      },
    }
  }

  it("finds skills by name substring", () => {
    saveSkillsIndex(makeTestIndex(), tmpIndex)
    const results = searchSkills("react", tmpIndex)
    expect(results).toHaveLength(1)
    expect(results[0].name).toBe("react-best-practices")
  })

  it("finds skills by description substring", () => {
    saveSkillsIndex(makeTestIndex(), tmpIndex)
    const results = searchSkills("PDF", tmpIndex)
    expect(results).toHaveLength(1)
    expect(results[0].name).toBe("pdf")
  })

  it("returns empty array for no matches", () => {
    saveSkillsIndex(makeTestIndex(), tmpIndex)
    const results = searchSkills("nonexistent-xyz", tmpIndex)
    expect(results).toHaveLength(0)
  })

  it("finds skills across multiple repos", () => {
    saveSkillsIndex(makeTestIndex(), tmpIndex)
    const results = searchSkills("design", tmpIndex)
    expect(results.length).toBeGreaterThanOrEqual(1)
  })
})

// ---------------------------------------------------------------------------
// getAllIndexedSkills
// ---------------------------------------------------------------------------

describe("getAllIndexedSkills", () => {
  let tmpIndex: string

  beforeEach(() => {
    tmpIndex = path.join(makeTmp(), "skills-index.json")
  })

  afterEach(() => {
    fs.rmSync(path.dirname(tmpIndex), { recursive: true, force: true })
  })

  it("returns all skills from all repos", () => {
    const idx: SkillsIndex = {
      version: 1,
      updated: new Date().toISOString(),
      repos: {
        "anthropics/skills": {
          fetched: new Date().toISOString(),
          skills: [
            { name: "pdf", description: "Create PDFs", source: "anthropics/skills", path: "skills/pdf" },
          ],
        },
        "vercel-labs/agent-skills": {
          fetched: new Date().toISOString(),
          skills: [
            { name: "react-best", description: "React patterns", source: "vercel-labs/agent-skills", path: "skills/react-best" },
          ],
        },
      },
    }
    saveSkillsIndex(idx, tmpIndex)
    const all = getAllIndexedSkills(tmpIndex)
    expect(all).toHaveLength(2)
  })
})

// ---------------------------------------------------------------------------
// installSkillFromIndex (unit tests — no network)
// ---------------------------------------------------------------------------

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
    const idx: SkillsIndex = { version: 1, updated: "", repos: {} }
    saveSkillsIndex(idx, tmpIndex)

    const result = installSkillFromIndex("nonexistent", tmpTarget, tmpIndex)
    expect(result).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// installSkillsBaseline
// ---------------------------------------------------------------------------

describe("installSkillsBaseline", () => {
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

  it("reports installed, already present, and failed skills", () => {
    // preinstall one skill
    writeSkillMd(
      path.join(tmpTarget, "existing-skill"),
      `---\nname: existing-skill\ndescription: Existing\n---\n`,
    )

    const idx: SkillsIndex = {
      version: 1,
      updated: new Date().toISOString(),
      repos: {
        "otto-assistant/skills": {
          fetched: new Date().toISOString(),
          skills: [
            {
              name: "otto-subagent-threads",
              description: "Enforce Discord threads",
              source: "otto-assistant/skills",
              path: "skills/otto-subagent-threads",
            },
          ],
        },
      },
    }
    saveSkillsIndex(idx, tmpIndex)

    const result = installSkillsBaseline([
      "existing-skill",
      "otto-subagent-threads",
      "missing-skill",
    ], tmpTarget, tmpIndex)

    expect(result.alreadyPresent).toContain("existing-skill")
    expect(result.installed).toContain("otto-subagent-threads")
    expect(result.failed).toContain("missing-skill")
  }, 20_000)
})

// ---------------------------------------------------------------------------
// Integration tests (require gh auth)
// ---------------------------------------------------------------------------

function hasGhAuth(): boolean {
  try {
    execFileSync("gh", ["auth", "status"], { encoding: "utf-8", stdio: "pipe" })
    return true
  } catch {
    return false
  }
}

describe("GitHub API integration", () => {
  it("fetchRepoSkillsIndex indexes skills from otto-assistant/skills", () => {
    if (!hasGhAuth()) return
    const entries = fetchRepoSkillsIndex("otto-assistant/skills")
    expect(entries.length).toBeGreaterThanOrEqual(3)
    for (const entry of entries) {
      expect(entry.name).toBeTruthy()
      expect(entry.description).toBeTruthy()
      expect(entry.source).toBe("otto-assistant/skills")
    }
  }, 15_000)

  it("fetchRepoSkillsIndex indexes skills from anthropics/skills", () => {
    if (!hasGhAuth()) return
    const entries = fetchRepoSkillsIndex("anthropics/skills")
    expect(entries.length).toBeGreaterThanOrEqual(5)
    for (const entry of entries) {
      expect(entry.name).toBeTruthy()
      expect(entry.description).toBeTruthy()
    }
  }, 30_000)

  it("installSkillFromIndex installs a real skill", () => {
    if (!hasGhAuth()) return
    const tmpTarget = makeTmp()
    const tmpIdx = path.join(makeTmp(), "skills-index.json")
    try {
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
      saveSkillsIndex(idx, tmpIdx)

      const result = installSkillFromIndex("otto-subagent-threads", tmpTarget, tmpIdx)
      expect(result).toBe(true)
      const skillMd = fs.readFileSync(path.join(tmpTarget, "otto-subagent-threads", "SKILL.md"), "utf-8")
      expect(skillMd).toContain("name: otto-subagent-threads")
    } finally {
      fs.rmSync(tmpTarget, { recursive: true, force: true })
      fs.rmSync(path.dirname(tmpIdx), { recursive: true, force: true })
    }
  }, 15_000)
})
