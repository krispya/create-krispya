export { resolveEngine } from './engine.js';
export { resolveProjectFacts, resolveWorkspaceFacts } from './facts.js';
export { resolvePackageManager, resolvePackageManagerProfile } from './package-manager.js';
export {
  resolveMonorepoRootPackageVersions,
  resolvePackageVersions,
  resolveProjectPackageVersions,
} from './package-versions.js';
export * from './registry.js';
export { detectTooling } from './tooling.js';
export type { DetectedTooling } from './tooling.js';
export {
  clearConfig,
  getAiPlatforms,
  getConfigPath,
  getConfigStrategy,
  setAiPlatforms,
  setConfigStrategy,
} from './user-config.js';
export { validateWorkspace } from './workspace-validation.js';
export type { ValidationResult } from './workspace-validation.js';
export type { ResolvedProject, ResolvedWorkspace } from './types.js';
