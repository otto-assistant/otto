import { describe, expect, it } from "vitest"
import { getInstalledVersion, detectPackage, type InstalledPackage } from "./detect.js"

describe("detect", () => {
  it("returns null for non-existent package", () => {
    const result = getInstalledVersion("nonexistent-package-xyz-123")
    expect(result).toBeNull()
  })

  // These tests require kimaki to be globally installed (skipped on CI)
  const describeIfInstalled = process.env.CI ? describe.skip : describe

  describeIfInstalled("with kimaki installed", () => {
    it("detects an existing global package", () => {
      const result = getInstalledVersion("kimaki")
      expect(result).not.toBeNull()
      expect(result).toMatch(/^\d+\.\d+\.\d+/)
    })

    it("detectPackage returns full info", async () => {
      const result = await detectPackage("kimaki")
      expect(result).toEqual({
        name: "kimaki",
        installed: expect.any(String),
      })
    })
  })
})
