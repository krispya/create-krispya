// Template types
export type Template = 'vanilla' | 'vanilla-js' | 'react' | 'react-js' | 'r3f' | 'r3f-js';

export type BaseTemplate = 'vanilla' | 'react' | 'r3f';

export type ProjectType = 'app' | 'library' | 'monorepo';
export type LibraryBundler = 'unbuild' | 'tsdown';
export type PackageManagerName = 'pnpm' | 'npm' | 'yarn';
export type PackageManagerSpec = {
  name: PackageManagerName;
  version?: string;
};
export type EngineName = string;
export type EngineSpec = {
  name: EngineName;
  version?: string;
};

export type PackageManagerCapabilities = {
  pnpmWorkspaceVersionPolicy?: 'manage-package-manager-versions' | 'pmOnFail';
  pnpmBuildDependencyPolicy?: 'onlyBuiltDependencies' | 'allowBuilds';
  yarnNodeLinker?: 'node-modules';
};

export type PackageManagerRequirements = {
  node?: string;
};

export type PackageManagerProfile = PackageManagerSpec & {
  major?: number;
  capabilities: PackageManagerCapabilities;
  requirements: PackageManagerRequirements;
};

export type PackageManagerIntent = {
  name: PackageManagerName;
  version?: string;
};

// Package versions resolved from the npm registry.
export type PackageVersions = Record<string, string>;
export type VersionRangePrefix = '^' | '~' | '';
export type DependencyVersionOptions = {
  prefix?: VersionRangePrefix;
  version?: string;
};

// In-memory file output types. These are planned files, not files on disk yet.
export type VirtualFile =
  | {
      type: 'text';
      content: string;
    }
  | {
      type: 'remote';
      url: string;
    };

export type FileRenderer<Input> = (input: Input) => VirtualFile;
export type VirtualFileMap = Record<string, VirtualFile>;

// Linter and formatter choices
export type Linter = 'eslint' | 'oxlint' | 'biome';
export type Formatter = 'prettier' | 'oxfmt' | 'biome';
export type Testing = 'vitest' | 'none';
export type ConfigStrategy = 'stealth' | 'root';
export type Ide = 'vscode' | 'none';

export type FormatterMetaConfig = {
  printWidth: number;
  tabWidth: number;
  useTabs: boolean;
  semi: boolean;
  singleQuote: boolean;
  trailingComma: 'none' | 'es5' | 'all';
  bracketSpacing: boolean;
  arrowParens: 'always' | 'avoid';
  ignorePatterns: string[];
};

export type LinterMetaConfig = {
  ignorePatterns: string[];
  rules: {
    noUnusedVars: {
      level: 'off' | 'warn' | 'error';
      argsIgnorePattern: string;
      varsIgnorePattern: string;
      caughtErrorsIgnorePattern: string;
    };
    noUnusedExpressions: {
      level: 'off' | 'warn' | 'error';
      allowShortCircuit: boolean;
    };
  };
};

export type TypeScriptMetaConfig = {
  configStrategy?: ConfigStrategy;
};

export type EditorMetaConfig = Record<string, never>;
export type TestingMetaConfig = Record<string, never>;
export type LibraryBundlerMetaConfig = Record<string, never>;

export type PackageManagerMetaConfig = {
  version?: string;
  pnpmManageVersions?: boolean;
};

export type ToolConfig<Tool extends string, Config> = {
  tool: Tool;
  config: Config;
};

// Code injection locations for template assembly
export type CodeInjectionLocation =
  | 'vite-config-import'
  | 'import'
  | 'global-start'
  | 'global-end'
  | 'dom-start'
  | 'dom'
  | 'dom-end'
  | 'scene-start'
  | 'scene'
  | 'scene-end'
  | 'readme-start'
  | 'readme-end'
  | 'readme-libraries'
  | 'readme-tools'
  | 'readme-commands'
  | 'vscode-extension-suggestion'
  | 'vscode-setting';

// Adapter option types
export type PlanFiberOptions =
  | {
      /** @default true */
      addExample?: boolean;
    }
  | boolean;

export type PlanDreiOptions = {} | boolean;
export type PlanHandleOptions = {} | boolean;

export type PlanKootaOptions =
  | {
      /** @default true */
      addExample?: boolean;
    }
  | boolean;

export type PlanLevaOptions = {} | boolean;
export type PlanOffscreenOptions = {} | boolean;
export type PlanPostprocessingOptions = {} | boolean;
export type PlanRapierOptions = {} | boolean;
export type PlanTriplexOptions = {} | boolean;
export type PlanUikitOptions = {} | boolean;
export type PlanViverseOptions = {} | boolean;

export type PlanXrOptions =
  | {
      storeOptions?: unknown;
    }
  | boolean;

export type PlanZustandOptions =
  | {
      /** @default true */
      addExample?: boolean;
    }
  | boolean;

export type PlanGithubPagesOptions = {} | boolean;

// AI rules platform options
export type AiPlatform = 'agents' | 'claude';

export type AiAgentsMetaConfig = {
  platforms: AiPlatform[];
};

export type ProjectMetaConfig = {
  githubUserName?: string;
  githubRepoName?: string;
  name: string;
  projectType?: ProjectType;
  template?: Template;
};

export type FeatureSelections = {
  fiber?: PlanFiberOptions;
  handle?: PlanHandleOptions;
  drei?: PlanDreiOptions;
  koota?: PlanKootaOptions;
  leva?: PlanLevaOptions;
  offscreen?: PlanOffscreenOptions;
  postprocessing?: PlanPostprocessingOptions;
  rapier?: PlanRapierOptions;
  triplex?: PlanTriplexOptions;
  viverse?: PlanViverseOptions;
  uikit?: PlanUikitOptions;
  xr?: PlanXrOptions;
  zustand?: PlanZustandOptions;
  githubPages?: PlanGithubPagesOptions;
};

/**
 * Parameters for generating a monorepo workspace.
 * Note: Monorepos are currently pnpm-only.
 */
export type MonorepoParams = {
  name: string;
  linter: Linter;
  formatter: Formatter;
  /** Currently always "pnpm" - monorepos are pnpm-only */
  packageManager: PackageManagerSpec;
  pnpmManageVersions?: boolean;
  engine?: EngineSpec;
  versions?: PackageVersions;
  ide?: Ide;
  /** AI platforms to generate files for */
  aiPlatforms?: AiPlatform[];
};

export type ProjectPlanContext = {
  dependencies?: Record<string, string>;
  engine?: EngineSpec;
  files?: VirtualFileMap;
  injections?: Array<{ location: CodeInjectionLocation; code: string }>;
  replacements?: Array<{ search: string; replace: string }>;
  versions?: PackageVersions;
  workspaceRoot?: string;
  workspaceDependencies?: string[];
};

export type ProjectPlanInput = {
  project: ProjectMetaConfig;
  aiAgents: ToolConfig<'ai-agents', AiAgentsMetaConfig>;
  formatter: ToolConfig<Formatter, FormatterMetaConfig>;
  linter: ToolConfig<Linter, LinterMetaConfig>;
  testing: ToolConfig<Testing, TestingMetaConfig>;
  typescript: ToolConfig<'typescript', TypeScriptMetaConfig>;
  ide: ToolConfig<Ide, EditorMetaConfig>;
  packageManager: ToolConfig<PackageManagerName, PackageManagerMetaConfig>;
  libraryBundler: ToolConfig<LibraryBundler, LibraryBundlerMetaConfig>;
  features: FeatureSelections;
  context: ProjectPlanContext;
};

export type WorkspacePlanContext = {
  engine?: EngineSpec;
  pnpmManageVersions?: boolean;
  versions?: PackageVersions;
};

export type WorkspacePlanInput = {
  project: Pick<ProjectMetaConfig, 'name'>;
  aiAgents: ToolConfig<'ai-agents', AiAgentsMetaConfig>;
  formatter: ToolConfig<Formatter, FormatterMetaConfig>;
  linter: ToolConfig<Linter, LinterMetaConfig>;
  ide: ToolConfig<Ide, EditorMetaConfig>;
  packageManager: ToolConfig<PackageManagerName, PackageManagerMetaConfig>;
  context: WorkspacePlanContext;
};

export type ProjectOptions = {
  githubUserName?: string;
  githubRepoName?: string;
  name: string;
  projectType?: ProjectType;
  libraryBundler?: LibraryBundler;
  template?: Template;
  linter?: Linter;
  formatter?: Formatter;
  testing?: Testing;
  configStrategy?: ConfigStrategy;
  ide?: Ide;
  /** AI platforms to generate pointer files for */
  aiPlatforms?: AiPlatform[];
  versions?: PackageVersions;
  fiber?: PlanFiberOptions;
  handle?: PlanHandleOptions;
  drei?: PlanDreiOptions;
  koota?: PlanKootaOptions;
  leva?: PlanLevaOptions;
  offscreen?: PlanOffscreenOptions;
  postprocessing?: PlanPostprocessingOptions;
  rapier?: PlanRapierOptions;
  triplex?: PlanTriplexOptions;
  viverse?: PlanViverseOptions;
  uikit?: PlanUikitOptions;
  xr?: PlanXrOptions;
  zustand?: PlanZustandOptions;
  githubPages?: PlanGithubPagesOptions;
  dependencies?: Record<string, string>;
  files?: VirtualFileMap;
  injections?: Array<{ location: CodeInjectionLocation; code: string }>;
  replacements?: Array<{ search: string; replace: string }>;
  packageManager?: PackageManagerSpec;
  pnpmManageVersions?: boolean;
  engine?: EngineSpec;
  workspaceRoot?: string; // relative path to workspace root (e.g., "../..")
  workspaceDependencies?: string[]; // workspace package names to add as dependencies
};

// Mutable plan builder used internally while adapters are being composed.
export type PlanBuilder = {
  get options(): ProjectOptions;
  get versions(): PackageVersions;
  getVersion(name: string): string;
  /** Returns true if using stealth config strategy (configs in .config/) */
  isStealthConfig(): boolean;
  addDependency(name: string, options?: DependencyVersionOptions): void;
  addDevDependency(name: string, options?: DependencyVersionOptions): void;
  addPeerDependency(name: string, semver: string): void;
  addFile(path: string, file: VirtualFile): void;
  addScripts(scripts: Record<string, string>): void;
  addScript(name: string, command: string): void;
  inject(location: CodeInjectionLocation, code: string): void;
  replace(search: string, replace: string): void;
  configureVite(object: unknown): void;
  addVscodeSetting(key: string, value: unknown): void;
};

// Template helper functions
export function getLanguageFromTemplate(template: Template): 'javascript' | 'typescript' {
  return template.endsWith('-js') ? 'javascript' : 'typescript';
}

export function getBaseTemplate(template: Template): BaseTemplate {
  return template.replace('-js', '') as BaseTemplate;
}

export function shouldEnableReactCompiler(
  options: Pick<ProjectOptions, 'projectType' | 'template'>
): boolean {
  const template = options.template ?? 'vanilla';
  return getBaseTemplate(template) === 'react' && (options.projectType ?? 'app') === 'app';
}
