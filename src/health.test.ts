import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { describe, expect, it } from "vitest"
import {
  checkPackagePresence,
  checkConfigHealth,
  checkDirectoryHealth,
  checkTenantHealth,
} from "./health.js"

describe("health", () => {
  it("checkPackagePresence returns results for all manifest packages", { timeout: 30_000 }, () => {
    const results = checkPackagePresence()
    expect(results).toHaveLength(2) // opencode-ai + kimaki (not mempalace — it's a plugin)
    for (const r of results) {
      expect(r).toHaveProperty("name")
      expect(r).toHaveProperty("installed")
      expect(r).toHaveProperty("status")
    }
  })

  it("checkConfigHealth returns structured result", () => {
    const result = checkConfigHealth()
    expect(result).toHaveProperty("opencodeJson")
    expect(result).toHaveProperty("ottoJson")
    expect(result).toHaveProperty("agentMemoryJson")
    expect(result).toHaveProperty("memoryPluginEnabled")
    expect(result).toHaveProperty("subagentPolicyInjected")
    expect(result).toHaveProperty("subagentThreadsEnabled")
    expect(result).toHaveProperty("subagentThreadsAskBeforeDelete")
    expect(result).toHaveProperty("subagentThreadsAutoDelete")
    expect(result).toHaveProperty("plugins")
    expect(result).toHaveProperty("kimakiRunning")
    expect(Array.isArray(result.plugins)).toBe(true)
  })

  it("checkDirectoryHealth returns results", () => {
    const results = checkDirectoryHealth()
    expect(Array.isArray(results)).toBe(true)
    expect(results.length).toBeGreaterThan(0)
  })

  it("checkTenantHealth reports missing memory bind root as error", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "otto-health-"))
    const health = checkTenantHealth({ tenantPath: tmpDir })
    const memoryItem = health.find((h) => h.name === "memory root")
    expect(memoryItem).toBeDefined()
    expect(memoryItem!.status).toBe("error")
  })

  it("checkTenantHealth reports ok when all paths present", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "otto-health-"))
    fs.mkdirSync(path.join(tmpDir, "memory"))
    fs.mkdirSync(path.join(tmpDir, "projects"))
    fs.writeFileSync(path.join(tmpDir, "compose.yml"), "services:", "utf-8")
    const health = checkTenantHealth({ tenantPath: tmpDir })
    const errors = health.filter((h) => h.status === "error")
    expect(errors).toHaveLength(0)
  })
})
