export const GENTLEMAN_SKILLS_BASELINE: string[] = [
  "critique",
  "security-review",
  "simplify",
  "opensrc",
  "playwriter",
  "tuistory",
]

export interface SkillsBootstrapReport {
  installed: string[]
  alreadyPresent: string[]
  failed: string[]
}
