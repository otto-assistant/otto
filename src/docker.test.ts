import { describe, expect, it } from "vitest"
import { buildComposeCommand } from "./docker.js"

describe("docker", () => {
  it("builds docker compose command with tenant path", () => {
    const cmd = buildComposeCommand("/tmp/tenant-a", ["up", "-d"])
    expect(cmd).toEqual({
      command: "docker",
      args: ["compose", "-f", "/tmp/tenant-a/compose.yml", "up", "-d"],
    })
  })
})
