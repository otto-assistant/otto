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
export { hasKimakiBinary, isKimakiRunning, restartKimaki, detectBinary } from "./lifecycle.js"
export { checkPackagePresence, checkConfigHealth, checkDirectoryHealth, checkTenantHealth } from "./health.js"
export type { HealthResult, PackageCheck, ConfigHealth, TenantHealthInput } from "./health.js"
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
  installSkillsBaseline,
  removeSkill,
  getConfiguredRepos,
} from "./skills.js"
export type { SkillMeta, SkillIndexEntry, SkillsIndex, RepoSyncResult } from "./skills.js"
export { GENTLEMAN_SKILLS_BASELINE } from "./skills-baseline.js"
export type { SkillsBootstrapReport } from "./skills-baseline.js"
export {
  deriveComposeProjectName,
  resolveTenantImage,
  resolveTenantMode,
  ensureTenantMemoryLayout,
  ensureTenantScaffold,
} from "./tenant.js"
export type { TenantMode, TenantInitResult } from "./tenant.js"
export { buildComposeCommand, runCompose } from "./docker.js"
export type { DockerComposeCommand } from "./docker.js"
