import { MANIFEST } from "./manifest.js"

export function ottoVersion(): string {
  return MANIFEST.version
}

export { MANIFEST, OPENCODE_CONFIG_DIR, KIMAKI_DATA_DIR } from "./manifest.js"
export { getInstalledVersion, detectPackage } from "./detect.js"
export type { InstalledPackage } from "./detect.js"
export {
  mergePlugins,
  readOttoConfig,
  writeOttoConfig,
  OTTO_DEFAULTS,
  buildSubagentThreadPolicy,
  mergeAgentPrompts,
  ensureSubagentThreadSkill,
  readOpenCodeConfig,
  readOpenCodeConfigState,
  writeOpenCodeConfig,
  ensureAgentMemoryConfig,
} from "./config.js"
export type { OpenCodeConfig, OttoConfig, OttoSubagentThreads, OttoConfigReadStatus, OpenCodeConfigReadStatus } from "./config.js"
export { installPackage, upgradePackage, installMissingPackages, planStableUpgrades } from "./installer.js"
export type { UpgradeMode } from "./installer.js"
export { hasKimakiBinary, isKimakiRunning, restartKimaki } from "./lifecycle.js"
export { checkPackagePresence, checkConfigHealth, checkDirectoryHealth } from "./health.js"
export type { HealthResult, PackageCheck, ConfigHealth } from "./health.js"
export {
  OPENCODE_SKILLS_DIR,
  SKILLS_INDEX_PATH,
  DEFAULT_SKILL_REPOS,
  parseSkillMd,
  loadSkillsIndex,
  saveSkillsIndex,
  isIndexStale,
  ensureSkillsIndex,
  searchSkills,
  getAllIndexedSkills,
  fetchRepoSkillsIndex,
  ghApi,
  fetchRepoDir,
  fetchRepoFile,
  listInstalledSkills,
  installSkillFromIndex,
  removeSkill,
  getConfiguredRepos,
} from "./skills.js"
export type { SkillMeta, SkillIndexEntry, SkillsIndex, RepoSyncResult } from "./skills.js"
