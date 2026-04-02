import { describe, expect, it } from "vitest"
import {
  checkPackagePresence,
  checkConfigHealth,
  checkDirectoryHealth,
} from "./health.js"

describe("health", () => {
  it("checkPackagePresence returns results for all manifest packages", { timeout: 30_000 }, () => {
    const results = checkPackagePresence()
    expect(results).toHaveLength(3)
    for (const r of results) {
      expect(r).toHaveProperty("name")
      expect(r).toHaveProperty("installed")
      expect(r).toHaveProperty("status")
    }
  })

  it("checkConfigHealth returns structured result", () => {
    const result = checkConfigHealth()
    expect(result).toHaveProperty("opencodeJson")
    expect(result).toHaveProperty("agentMemoryJson")
    expect(result).toHaveProperty("memoryPluginEnabled")
    expect(result).toHaveProperty("kimakiRunning")
  })

  it("checkDirectoryHealth returns results", () => {
    const results = checkDirectoryHealth()
    expect(Array.isArray(results)).toBe(true)
    expect(results.length).toBeGreaterThan(0)
  })
})
