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
  version: "0.1.1",
  packages: {
    "opencode-ai": ">=1.0.115",
    "@otto-assistant/bridge": ">=0.6.0",
  },
  pinned: {
    "opencode-ai": "1.2.20",
    "@otto-assistant/bridge": "0.6.2",
  },
  plugins: [
    "mempalace",
  ],
}

/** Upstream repositories for sync tracking */
export const UPSTREAM_REPOS: Record<string, { repo: string; upstream: string }> = {
  "@otto-assistant/bridge": {
    repo: "otto-assistant/bridge",
    upstream: "remorses/kimaki",
  },
}

export const OPENCODE_CONFIG_DIR = (): string => {
  const home = process.env.HOME || process.env.USERPROFILE || "/root"
  return `${home}/.config/opencode`
}

export const KIMAKI_DATA_DIR = (): string => {
  const home = process.env.HOME || process.env.USERPROFILE || "/root"
  return `${home}/.kimaki`
}
