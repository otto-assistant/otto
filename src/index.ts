import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const packageJson = require("../package.json") as { version: string }

export function ottoVersion(): string {
  return packageJson.version
}

export { MANIFEST, OPENCODE_CONFIG_DIR, KIMAKI_DATA_DIR } from "./manifest.js"
