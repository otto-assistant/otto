import { describe, expect, it } from "vitest"
import {
  mergePlugins,
  readOttoConfig,
  writeOttoConfig,
  OTTO_DEFAULTS,
  buildSubagentThreadPolicy,
  mergeAgentPrompts,
  ensureSubagentThreadSkill,
  readOpenCodeConfigState,
  type OpenCodeConfig,
  type OttoConfig,
} from "./config.js"
import fs from "node:fs"
import path from "node:path"
import os from "node:os"

describe("config", () => {
  it("adds plugin to empty config", () => {
    const config: OpenCodeConfig = {}
    const result = mergePlugins(config, "mempalace")
    expect(result.plugin).toEqual(["mempalace"])
  })

  it("appends plugin to existing array", () => {
    const config: OpenCodeConfig = { plugin: ["existing-plugin"] }
    const result = mergePlugins(config, "mempalace")
    expect(result.plugin).toEqual(["existing-plugin", "mempalace"])
  })

  it("does not duplicate existing plugin", () => {
    const config: OpenCodeConfig = { plugin: ["mempalace"] }
    const result = mergePlugins(config, "mempalace")
    expect(result.plugin).toEqual(["mempalace"])
  })

  it("preserves other config fields", () => {
    const config: OpenCodeConfig = {
      model: "gpt-4",
      plugin: ["existing"],
      provider: { cursor: { name: "Cursor" } },
    }
    const result = mergePlugins(config, "mempalace")
    expect(result.model).toBe("gpt-4")
    expect(result.provider).toEqual({ cursor: { name: "Cursor" } })
    expect(result.plugin).toEqual(["existing", "mempalace"])
  })

  it("readOttoConfig returns defaults when otto.json missing", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "otto-test-"))
    try {
      const result = readOttoConfig(tmpDir)
      expect(result.subagentThreads).toEqual({
        enabled: true,
        askBeforeDelete: true,
        autoDeleteOnComplete: false,
      })
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  it("writeOttoConfig + readOttoConfig round-trip", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "otto-test-"))
    try {
      const config: OttoConfig = {
        subagentThreads: {
          enabled: false,
          askBeforeDelete: false,
          autoDeleteOnComplete: true,
        },
      }
      const written = writeOttoConfig(config, tmpDir)
      expect(written).toBe(true)

      const read = readOttoConfig(tmpDir)
      expect(read.subagentThreads).toEqual({
        enabled: false,
        askBeforeDelete: false,
        autoDeleteOnComplete: true,
      })

      // Idempotent
      const writtenAgain = writeOttoConfig(config, tmpDir)
      expect(writtenAgain).toBe(false)
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  it("readOttoConfig fills defaults for partial config", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "otto-test-"))
    try {
      fs.mkdirSync(tmpDir, { recursive: true })
      fs.writeFileSync(
        path.join(tmpDir, "otto.json"),
        JSON.stringify({ subagentThreads: { enabled: false } }, null, 2) + "\n",
        "utf-8",
      )
      const result = readOttoConfig(tmpDir)
      expect(result.subagentThreads.enabled).toBe(false)
      expect(result.subagentThreads.askBeforeDelete).toBe(true) // default
      expect(result.subagentThreads.autoDeleteOnComplete).toBe(false) // default
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  it("policy includes kimaki send commands when enabled", () => {
    const ottoConfig: OttoConfig = {
      subagentThreads: { enabled: true, askBeforeDelete: true, autoDeleteOnComplete: false },
    }
    const policy = buildSubagentThreadPolicy(ottoConfig)

    expect(policy).toContain("Otto subagent policy (must follow):")
    expect(policy).toContain("subagent_threads_enabled: true")
    expect(policy).toContain("kimaki send")
    expect(policy).toContain("--channel")
    expect(policy).toContain("--wait")
    expect(policy).toContain("ask the user")
  })

  it("policy is short when threads disabled", () => {
    const ottoConfig: OttoConfig = {
      subagentThreads: { enabled: false, askBeforeDelete: true, autoDeleteOnComplete: false },
    }
    const policy = buildSubagentThreadPolicy(ottoConfig)

    expect(policy).toContain("subagent_threads_enabled: false")
    expect(policy).toContain("without creating Discord threads")
    expect(policy).not.toContain("kimaki send")
  })

  it("policy includes auto-archive when autoDeleteOnComplete is true", () => {
    const ottoConfig: OttoConfig = {
      subagentThreads: { enabled: true, askBeforeDelete: false, autoDeleteOnComplete: true },
    }
    const policy = buildSubagentThreadPolicy(ottoConfig)

    expect(policy).toContain("auto_delete_on_complete: true")
    expect(policy).toContain("kimaki session archive")
    expect(policy).not.toContain("ask the user")
  })

  it("injects policy into existing agent prompt", () => {
    const config: OpenCodeConfig = {
      agent: { build: { prompt: "existing rule" } },
    }

    const ottoConfig: OttoConfig = OTTO_DEFAULTS
    const policy = buildSubagentThreadPolicy(ottoConfig)
    const result = mergeAgentPrompts(config, policy)
    const prompt = (result.agent as Record<string, { prompt?: string }>).build.prompt

    expect(prompt).toContain("existing rule")
    expect(prompt).toContain("Otto subagent policy (must follow):")
    expect(prompt).toContain("subagent_threads_enabled: true")
  })

  it("does not duplicate policy when already present", () => {
    const ottoConfig: OttoConfig = OTTO_DEFAULTS
    const policy = buildSubagentThreadPolicy(ottoConfig)
    const config: OpenCodeConfig = {
      agent: { build: { prompt: policy } },
    }

    const result = mergeAgentPrompts(config, policy)
    const prompt = (result.agent as Record<string, { prompt?: string }>).build.prompt ?? ""
    expect(prompt.match(/Otto subagent policy \(must follow\):/g)?.length).toBe(1)
  })

  it("creates build agent with policy when agent section is empty", () => {
    const ottoConfig: OttoConfig = OTTO_DEFAULTS
    const policy = buildSubagentThreadPolicy(ottoConfig)
    const result = mergeAgentPrompts({}, policy)
    const agents = result.agent as Record<string, { prompt?: string }>

    expect(agents.build?.prompt).toContain("Otto subagent policy (must follow):")
  })

  it("readOpenCodeConfigState returns missing when file absent", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "otto-test-"))
    try {
      const result = readOpenCodeConfigState(tmpDir)
      expect(result.status).toBe("missing")
      expect(result.config).toEqual({})
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  it("readOpenCodeConfigState returns ok for valid JSON", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "otto-test-"))
    try {
      fs.mkdirSync(tmpDir, { recursive: true })
      fs.writeFileSync(path.join(tmpDir, "opencode.json"), "{\"model\":\"x\"}\n", "utf-8")
      const result = readOpenCodeConfigState(tmpDir)
      expect(result.status).toBe("ok")
      expect(result.config).toEqual({ model: "x" })
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  it("readOpenCodeConfigState returns invalid for broken JSON", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "otto-test-"))
    try {
      fs.mkdirSync(tmpDir, { recursive: true })
      fs.writeFileSync(path.join(tmpDir, "opencode.json"), "{not json", "utf-8")
      const result = readOpenCodeConfigState(tmpDir)
      expect(result.status).toBe("invalid")
      expect(result.config).toEqual({})
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  it("ensureSubagentThreadSkill creates skill file", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "otto-test-"))
    try {
      const created = ensureSubagentThreadSkill(tmpDir)
      expect(created).toBe(true)

      const skillPath = path.join(tmpDir, "skills", "otto-subagent-threads", "SKILL.md")
      const content = fs.readFileSync(skillPath, "utf-8")
      expect(content).toContain("name: otto-subagent-threads")
      expect(content).toContain("kimaki send")
      expect(content).toContain("kimaki session archive")

      // Idempotent — second call returns false
      const second = ensureSubagentThreadSkill(tmpDir)
      expect(second).toBe(false)
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })
})
