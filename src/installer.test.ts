import { describe, expect, it } from "vitest"
import { installMissingPackages } from "./installer.js"

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
    // opencode-agent-memory is a plugin, not a global npm package
    expect(result).not.toContain("opencode-agent-memory")
  })
})
