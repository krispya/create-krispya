import type {
  CodeInjectionLocation,
  ConfigStrategy,
  EngineSpec,
  Formatter,
  Ide,
  LibraryBundler,
  Linter,
  PackageManagerSpec,
  PackageVersions,
  ProjectType,
  Testing,
  VirtualFileMap,
  FormatterMetaConfig,
  LinterMetaConfig,
} from '../types.js';

export type MetaConfig = {
  formatter: FormatterMetaConfig;
  linter: LinterMetaConfig;
};

export type ToolSelections = {
  linter?: Linter;
  formatter?: Formatter;
  testing?: Testing;
  libraryBundler?: LibraryBundler;
  ide?: Ide;
  packageManager?: PackageManagerSpec;
};

export type ProjectContext = {
  name: string;
  projectType?: ProjectType;
  configStrategy?: ConfigStrategy;
  engine?: EngineSpec;
  versions?: PackageVersions;
  workspaceRoot?: string;
  workspaceDependencies?: string[];
  pnpmManageVersions?: boolean;
};

export type PartialPlan = {
  files?: VirtualFileMap;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
  vscodeSettings?: Record<string, unknown>;
  vscodeExtensions?: string[];
  injections?: Array<{ location: CodeInjectionLocation; code: string }>;
  replacements?: Array<{ search: string; replace: string }>;
  warnings?: string[];
};

export type ProjectPlan = {
  files: VirtualFileMap;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  peerDependencies: Record<string, string>;
  scripts: Record<string, string>;
  vscodeSettings: Record<string, unknown>;
  vscodeExtensions: string[];
  injections: Array<{ location: CodeInjectionLocation; code: string }>;
  replacements: Array<{ search: string; replace: string }>;
  warnings: string[];
};
