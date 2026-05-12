// Re-export all CLI modules
export { formatConfigSummary, formatMonorepoConfigSummary } from './format.js';
export {
  promptForOptions,
  promptForPackageOptions,
  promptForCustomization,
  getDefaultOptions,
  getDefaultProjectName,
  promptForInitialPackage,
  getDefaultMonorepoOptions,
  type InheritedWorkspaceSettings,
  type CliPresets,
} from './prompts.js';
