import { describe, expect, it } from "vitest"
import { hasKimakiBinary, isKimakiRunning, restartKimaki, detectBinary } from "./lifecycle.js"

describe("lifecycle", () => {
  it("detectBinary returns string or null", () => {
    const result = detectBinary()
    expect(result === null || typeof result === "string").toBe(true)
  })

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
})
