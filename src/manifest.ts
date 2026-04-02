export interface Manifest {
  version: string
  packages: Record<string, string>
  pinned: Record<string, string>
}

export const MANIFEST: Manifest = {
  version: "0.0.1",
  packages: {
    "opencode-ai": ">=1.0.115",
    "kimaki": ">=0.4.0",
    "opencode-agent-memory": ">=0.2.0",
  },
  pinned: {
    "opencode-ai": "1.2.20",
    "kimaki": "0.4.90",
    "opencode-agent-memory": "0.2.0",
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
