import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { describe, expect, it } from "vitest"
import {
  deriveComposeProjectName,
  ensureTenantMemoryLayout,
  ensureTenantScaffold,
  resolveTenantImage,
  resolveTenantMode,
} from "./tenant.js"

describe("tenant", () => {
  it("uses otto-<folder_name> default", () => {
    expect(deriveComposeProjectName("/tmp/my-tenant")).toBe("otto-my-tenant")
  })

  it("uses image from compose.yml when env override missing", () => {
    const resolved = resolveTenantImage({
      composeImage: "otto-assistant/otto:stable",
      envImage: undefined,
    })
    expect(resolved).toBe("otto-assistant/otto:stable")
  })

  it("defaults to safe mode when OTTO_MODE is unset", () => {
    expect(resolveTenantMode(undefined)).toBe("safe")
  })

  it("creates required memory files and mempalace dir", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "otto-memory-"))
    const report = ensureTenantMemoryLayout(root)

    expect(report.created).toContain("AGENTS.md")
    expect(report.created).toContain("soul.md")
    expect(report.created).toContain("persona.md")
    expect(report.created).toContain("mempalace/")
  })

  it("creates compose scaffold for tenant", () => {
    const tenantPath = fs.mkdtempSync(path.join(os.tmpdir(), "otto-tenant-"))
    const report = ensureTenantScaffold(tenantPath)

    expect(report.created).toContain("compose.yml")
    expect(fs.existsSync(path.join(tenantPath, "compose.yml"))).toBe(true)
    expect(fs.existsSync(path.join(tenantPath, "memory", "AGENTS.md"))).toBe(true)
    expect(fs.existsSync(path.join(tenantPath, "projects"))).toBe(true)
  })
})
