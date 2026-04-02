import { describe, expect, it } from "vitest"
import { mergePlugins, type OpenCodeConfig } from "./config.js"

describe("config", () => {
  it("adds plugin to empty config", () => {
    const config: OpenCodeConfig = {}
    const result = mergePlugins(config, "opencode-agent-memory")
    expect(result.plugin).toEqual(["opencode-agent-memory"])
  })

  it("appends plugin to existing array", () => {
    const config: OpenCodeConfig = { plugin: ["existing-plugin"] }
    const result = mergePlugins(config, "opencode-agent-memory")
    expect(result.plugin).toEqual(["existing-plugin", "opencode-agent-memory"])
  })

  it("does not duplicate existing plugin", () => {
    const config: OpenCodeConfig = { plugin: ["opencode-agent-memory"] }
    const result = mergePlugins(config, "opencode-agent-memory")
    expect(result.plugin).toEqual(["opencode-agent-memory"])
  })

  it("preserves other config fields", () => {
    const config: OpenCodeConfig = {
      model: "gpt-4",
      plugin: ["existing"],
      provider: { cursor: { name: "Cursor" } },
    }
    const result = mergePlugins(config, "opencode-agent-memory")
    expect(result.model).toBe("gpt-4")
    expect(result.provider).toEqual({ cursor: { name: "Cursor" } })
    expect(result.plugin).toEqual(["existing", "opencode-agent-memory"])
  })
})
