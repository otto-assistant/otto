import { describe, expect, it } from "vitest"
import { installMissingPackages, planStableUpgrades } from "./installer.js"

describe("installer", () => {
  it("installMissingPackages returns empty when all installed", () => {
    const getInstalled = (_name: string) => "1.0.0"
    const installed = installMissingPackages(getInstalled, () => "ok")
    expect(installed).toEqual([])
  })

  it("installMissingPackages returns missing package names", () => {
    const getInstalled = (name: string) => name === "kimaki" ? "1.0.0" : null
    const installedNames: string[] = []
    const install = (name: string) => { installedNames.push(name); return name }

    const result = installMissingPackages(getInstalled, install)

    expect(result).toContain("opencode-ai")
    expect(result).not.toContain("kimaki")
    // mempalace is a plugin, not a global npm package
    expect(result).not.toContain("mempalace")
  })

  it("planStableUpgrades returns empty when all packages match pinned", () => {
    const pinned = { a: "1.0.0", b: "2.0.0" }
    const getInstalled = (name: string) => pinned[name as keyof typeof pinned] ?? null
    const plan = planStableUpgrades(["a", "b"], getInstalled, pinned)
    expect(plan).toEqual([])
  })

  it("planStableUpgrades lists packages whose version differs from pinned", () => {
    const pinned = { "opencode-ai": "1.2.20", kimaki: "0.4.90" }
    const getInstalled = (name: string) => (name === "kimaki" ? "0.4.90" : "1.0.0")
    const plan = planStableUpgrades(["opencode-ai", "kimaki"], getInstalled, pinned)
    expect(plan).toEqual([
      { name: "opencode-ai", current: "1.0.0", target: "1.2.20" },
    ])
  })

  it("planStableUpgrades includes not installed packages", () => {
    const pinned = { x: "1.0.0" }
    const getInstalled = () => null as string | null
    const plan = planStableUpgrades(["x"], getInstalled, pinned)
    expect(plan).toEqual([{ name: "x", current: null, target: "1.0.0" }])
  })

  it("planStableUpgrades throws when pinned entry missing for a package", () => {
    expect(() =>
      planStableUpgrades(["missing"], () => "1.0.0", {}),
    ).toThrow("No pinned version for missing in manifest")
  })
})
