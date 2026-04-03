export interface Manifest {
  version: string
  /** Packages installed globally via npm (CLI tools) */
  packages: Record<string, string>
  /** Pinned versions for `otto upgrade stable` (global npm packages only) */
  pinned: Record<string, string>
  /** Plugins enabled via opencode.json plugin[] — opencode resolves them itself */
  plugins: string[]
}

export const MANIFEST: Manifest = {
  version: "0.0.2",
  packages: {
    "opencode-ai": ">=1.0.115",
    "kimaki": ">=0.4.0",
  },
  pinned: {
    "opencode-ai": "1.2.20",
    "kimaki": "0.4.90",
  },
  plugins: [
    "opencode-agent-memory",
  ],
}

export const OPENCODE_CONFIG_DIR = (): string => {
  const home = process.env.HOME || process.env.USERPROFILE || "/root"
  return `${home}/.config/opencode`
}

export const KIMAKI_DATA_DIR = (): string => {
  const home = process.env.HOME || process.env.USERPROFILE || "/root"
  return `${home}/.kimaki`
}
