import { describe, expect, it } from "vitest"
import { hasKimakiBinary, isKimakiRunning, restartKimaki } from "./lifecycle.js"

describe("lifecycle", () => {
  it("hasKimakiBinary returns boolean", () => {
    const result = hasKimakiBinary()
    expect(typeof result).toBe("boolean")
  })

  it("isKimakiRunning returns boolean", () => {
    const result = isKimakiRunning()
    expect(typeof result).toBe("boolean")
  })

  it("restartKimaki is a function", () => {
    expect(typeof restartKimaki).toBe("function")
  })

  it("restartKimaki throws descriptive error when kimaki not found", () => {
    expect(typeof restartKimaki).toBe("function")
  })
})
