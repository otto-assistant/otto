import { execSync } from "node:child_process"

/** Ordered list of binary names to try — bridge is the otto fork, kimaki is upstream. */
const BIN_NAMES = ["bridge", "kimaki"] as const

/**
 * Detect the first available binary name from BIN_NAMES.
 * Returns the binary name ("bridge" | "kimaki") or null if none found.
 */
export function detectBinary(): string | null {
  for (const name of BIN_NAMES) {
    try {
      execSync(`which ${name}`, { encoding: "utf-8", stdio: "pipe" })
      return name
    } catch {
      continue
    }
  }
  return null
}

/** @deprecated Use detectBinary() instead. Returns true if any known binary exists. */
export function hasKimakiBinary(): boolean {
  return detectBinary() !== null
}

export function isKimakiRunning(): boolean {
  // Check for both process names — "bridge" (otto fork) and "kimaki" (upstream)
  try {
    const output = execSync("pgrep -f 'kimaki|bridge'", { encoding: "utf-8", stdio: "pipe" })
    return output.trim().length > 0
  } catch {
    return false
  }
}

export function restartKimaki(): void {
  const bin = detectBinary()
  if (!bin) {
    throw new Error(
      "Neither 'bridge' nor 'kimaki' binary found. Install with: npm install -g @otto-assistant/bridge",
    )
  }
  execSync(`${bin} restart`, {
    encoding: "utf-8",
    stdio: "pipe",
    timeout: 30_000,
  })
}
