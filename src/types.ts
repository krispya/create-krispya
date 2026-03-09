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

// Package versions resolved from the npm registry.
export type PackageVersions = Record<string, string>;
export type VersionRangePrefix = '^' | '~' | '';
export type DependencyVersionOptions = {
    prefix?: VersionRangePrefix;
    version?: string;
};

// File output types
export type File =
    | {
          type: 'text';
          content: string;
      }
    | {
          type: 'remote';
          url: string;
      };

// Linter and formatter choices
export type Linter = 'eslint' | 'oxlint' | 'biome';
export type Formatter = 'prettier' | 'oxfmt' | 'biome';
export type Testing = 'vitest' | 'none';
export type ConfigStrategy = 'stealth' | 'root';

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

// Integration option types
export type GenerateFiberOptions =
    | {
          /** @default true */
          addExample?: boolean;
      }
    | boolean;

export type GenerateDreiOptions = {} | boolean;
export type GenerateHandleOptions = {} | boolean;

export type GenerateKootaOptions =
    | {
          /** @default true */
          addExample?: boolean;
      }
    | boolean;

export type GenerateLevaOptions = {} | boolean;
export type GenerateOffscreenOptions = {} | boolean;
export type GeneratePostprocessingOptions = {} | boolean;
export type GenerateRapierOptions = {} | boolean;
export type GenerateTriplexOptions = {} | boolean;
export type GenerateUikitOptions = {} | boolean;
export type GenerateViverseOptions = {} | boolean;

export type GenerateXrOptions =
    | {
          storeOptions?: unknown;
      }
    | boolean;

export type GenerateZustandOptions =
    | {
          /** @default true */
          addExample?: boolean;
      }
    | boolean;

export type GenerateGithubPagesOptions = {} | boolean;

// AI rules platform options
export type AiPlatform = 'agents' | 'claude';

export type GenerateOptions = {
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
    /** AI platforms to generate pointer files for */
    aiPlatforms?: AiPlatform[];
    versions?: PackageVersions;
    fiber?: GenerateFiberOptions;
    handle?: GenerateHandleOptions;
    drei?: GenerateDreiOptions;
    koota?: GenerateKootaOptions;
    leva?: GenerateLevaOptions;
    offscreen?: GenerateOffscreenOptions;
    postprocessing?: GeneratePostprocessingOptions;
    rapier?: GenerateRapierOptions;
    triplex?: GenerateTriplexOptions;
    viverse?: GenerateViverseOptions;
    uikit?: GenerateUikitOptions;
    xr?: GenerateXrOptions;
    zustand?: GenerateZustandOptions;
    githubPages?: GenerateGithubPagesOptions;
    dependencies?: Record<string, string>;
    files?: Record<string, File>;
    injections?: Array<{ location: CodeInjectionLocation; code: string }>;
    replacements?: Array<{ search: string; replace: string }>;
    packageManager?: PackageManagerSpec;
    pnpmManageVersions?: boolean;
    engine?: EngineSpec;
    workspaceRoot?: string; // relative path to workspace root (e.g., "../..")
    workspaceDependencies?: string[]; // workspace package names to add as dependencies
};

// Generator interface for integrations
export type Generator = {
    get options(): GenerateOptions;
    get versions(): PackageVersions;
    getVersion(name: string): string;
    /** Returns true if using stealth config strategy (configs in .config/) */
    isStealthConfig(): boolean;
    addDependency(name: string, options?: DependencyVersionOptions): void;
    addDevDependency(name: string, options?: DependencyVersionOptions): void;
    addPeerDependency(name: string, semver: string): void;
    addFile(path: string, file: File): void;
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
