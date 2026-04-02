import { execSync } from "node:child_process"

export function hasKimakiBinary(): boolean {
  try {
    execSync("which kimaki", { encoding: "utf-8", stdio: "pipe" })
    return true
  } catch {
    return false
  }
}

export function isKimakiRunning(): boolean {
  try {
    const output = execSync("pgrep -f kimaki", { encoding: "utf-8", stdio: "pipe" })
    return output.trim().length > 0
  } catch {
    return false
  }
}

export function restartKimaki(): void {
  if (!hasKimakiBinary()) {
    throw new Error("kimaki is not installed. Install it first with: npm install -g kimaki")
  }
  execSync("kimaki restart", {
    encoding: "utf-8",
    stdio: "pipe",
    timeout: 30_000,
  })
}
