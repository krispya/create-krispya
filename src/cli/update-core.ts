import { readFile, access, writeFile, mkdir, readdir } from 'fs/promises';
import { constants } from 'fs';
import { join, dirname, relative } from 'path';

import type {
  BaseTemplate,
  ConfigStrategy,
  EngineSpec,
  Linter,
  Formatter,
  VirtualFile,
  PackageManagerName,
  PackageManagerSpec,
} from '../types.js';
import {
  renderTypescriptConfigPackage,
  renderOxlintConfigPackage,
  renderEslintConfigPackage,
  renderPrettierConfigPackage,
  renderOxfmtConfigPackage,
} from '../renderers/monorepo.js';
import {
  renderAiFiles,
  ALL_AI_PLATFORMS,
  isManagedAiFilePath,
  mergeAiFileContent,
} from '../renderers/ai-files.js';
import { renderEditorConfig } from '../renderers/editorconfig.js';
import {
  detectGitignoreVariant,
  mergeGitignoreContent,
  renderGitignore,
} from '../renderers/gitignore.js';
import { renderVscodeFiles } from '../renderers/vscode.js';
import {
  formatResolvedPackageVersion,
  getResolvedPackageVersion,
  resolveMonorepoRootPackageVersions,
} from '../workflow/resolve/package-versions.js';
import {
  mergePackageJsonScripts,
  packageJsonScripts,
  resolveDefaultPackageJsonScripts,
} from '../renderers/package-json-scripts.js';
import { toPrettierIgnoreContent } from '../tools/formatter-config.js';
import { renderOxlintConfig } from '../renderers/oxlint-config.js';
import { renderViteConfig } from '../renderers/vite-config.js';
import { renderJson } from '../renderers/json.js';
import { detectTooling } from '../utils/index.js';
import {
  formatPackageManager,
  getPackageManagerProfile,
  parsePackageManagerSpec,
  renderPnpmWorkspaceConfig,
} from '../package-managers/index.js';
import { getSemverMajor, getSemverMajorString } from '../utils/index.js';
import { parseEngine } from '../workflow/resolve/engine.js';

// =============================================================================
// Types
// =============================================================================

export type UpdateCategory =
  | 'ai-files'
  | 'ai-files-install'
  | 'ai-files-update'
  | 'vscode'
  | 'package-json'
  | 'config-packages'
  | 'tooling-config'
  | 'workspace-config'
  | 'root-config';

type ExpectedUpdateCategory = Exclude<UpdateCategory, 'ai-files-install' | 'ai-files-update'>;

export type FileChangeStatus = 'added' | 'modified' | 'unchanged';

export type FileChange = {
  path: string;
  status: FileChangeStatus;
  currentContent?: string;
  newContent: string;
  mergeSafe?: boolean;
};

export type CategoryUpdate = {
  category: UpdateCategory;
  label: string;
  changes: FileChange[];
  hasUserModifications: boolean;
};

export type WorkspaceConfig = {
  name: string;
  linter: Linter;
  formatter: Formatter;
  packageManager: string;
  packageManagerSpec?: PackageManagerSpec;
  targetPackageManagerSpec?: PackageManagerSpec;
  targetNodeVersion?: string;
  engine?: EngineSpec;
  isMonorepo: boolean;
  configStrategy?: ConfigStrategy;
  hasTypecheck?: boolean;
  viteTemplate?: BaseTemplate;
};

type PackageJsonForScripts = {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  packageManager?: string;
  engines?: Record<string, string>;
  exports?: unknown;
  main?: string;
  module?: string;
  files?: unknown;
};

function detectViteTemplate(pkg: PackageJsonForScripts): BaseTemplate | undefined {
  if (!hasPackage(pkg, 'vite')) return undefined;
  if (hasPackage(pkg, '@react-three/fiber')) return 'r3f';
  if (hasPackage(pkg, 'react') || hasPackage(pkg, '@vitejs/plugin-react')) return 'react';
  return 'vanilla';
}

function renderExpectedViteConfig(template: BaseTemplate): VirtualFile {
  const isReact = template === 'react' || template === 'r3f';
  const useReactCompiler = template === 'react';
  const codeSnippets = isReact
    ? {
        'vite-config-import': [
          useReactCompiler
            ? "import react, { reactCompilerPreset } from '@vitejs/plugin-react';"
            : "import react from '@vitejs/plugin-react';",
          ...(useReactCompiler ? ["import babel from '@rolldown/plugin-babel';"] : []),
        ],
      }
    : {};
  const viteConfig: Record<string, unknown> = {
    base: './',
  };

  if (isReact) {
    viteConfig.plugins = useReactCompiler
      ? ['$raw:react()', '$raw:babel({ presets: [reactCompilerPreset()] })']
      : ['$raw:react()'];
  }

  if (template === 'r3f') {
    viteConfig.resolve = { dedupe: ['three'] };
  }

  return renderViteConfig({ viteConfig, codeSnippets });
}

// =============================================================================
// Config Detection
// =============================================================================

/**
 * Detects the current workspace configuration from existing files.
 * Uses scripts → .config/ directories → devDependencies priority.
 */
export async function detectCurrentConfig(root: string, isMonorepo = true): Promise<WorkspaceConfig> {
  // Read name from package.json or directory
  let name = root.split(/[/\\]/).pop() ?? 'workspace';
  let packageManager = 'pnpm';
  let packageManagerSpec: PackageManagerSpec | undefined = { name: 'pnpm' };
  let engine: EngineSpec | undefined;
  let hasTypecheck = false;
  let viteTemplate: BaseTemplate | undefined;
  try {
    const pkgPath = join(root, 'package.json');
    const content = await readFile(pkgPath, 'utf-8');
    const pkgJson = JSON.parse(content) as PackageJsonForScripts & {
      name?: string;
      packageManager?: string;
    };
    if (pkgJson.name) {
      name = pkgJson.name.replace(/^@/, '').replace(/\/.*$/, '');
    }
    if (pkgJson.packageManager) {
      packageManagerSpec = parsePackageManagerSpec(pkgJson.packageManager) ?? packageManagerSpec;
      packageManager = packageManagerSpec.name;
    }
    engine = parseEngine(pkgJson.engines);
    hasTypecheck = pkgJson.scripts?.typecheck != null;
    viteTemplate = detectViteTemplate(pkgJson);
  } catch {
    // Use directory name
  }

  // Detect linter and formatter using standardized detection
  const tooling = await detectTooling(root);
  const configStrategy = isMonorepo ? undefined : await detectSinglePackageConfigStrategy(root);

  return {
    name,
    linter: tooling.linter ?? 'oxlint',
    formatter: tooling.formatter ?? 'prettier',
    packageManager,
    packageManagerSpec,
    engine,
    isMonorepo,
    configStrategy,
    hasTypecheck,
    viteTemplate,
  };
}

async function detectSinglePackageConfigStrategy(root: string): Promise<ConfigStrategy> {
  const hasStealthConfig = await Promise.all([
    fileExists(join(root, '.config/tsconfig.app.json')),
    fileExists(join(root, '.config/tsconfig.node.json')),
    fileExists(join(root, '.config/prettier.json')),
    fileExists(join(root, '.config/oxlint.json')),
  ]).then((matches) => matches.some(Boolean));

  return hasStealthConfig ? 'stealth' : 'root';
}

// =============================================================================
// VirtualFile Generation
// =============================================================================

/**
 * Generates expected files for all update categories.
 */
export async function planExpectedFiles(
  config: WorkspaceConfig
): Promise<Record<ExpectedUpdateCategory, Record<string, VirtualFile>>> {
  const { name, linter, formatter, packageManager, isMonorepo, configStrategy, hasTypecheck } =
    config;
  const versions =
    linter === 'biome' || formatter === 'biome'
      ? await resolveMonorepoRootPackageVersions({ linter, formatter })
      : {};

  // AI Files
  const aiFilesMap: Record<string, VirtualFile> = {};
  renderAiFiles(aiFilesMap, {
    name,
    packageManager,
    linter,
    formatter,
    isMonorepo,
    configStrategy,
    hasTypecheck,
    platforms: ALL_AI_PLATFORMS,
  });

  // VS Code
  const vscodeFiles = renderVscodeFiles({
    linter,
    formatter,
    configStrategy,
    isMonorepo,
    packageManager: isPackageManagerName(packageManager) ? packageManager : undefined,
  });

  // Config Packages
  const configPackages: Record<string, VirtualFile> = {};
  if (isMonorepo) {
    renderTypescriptConfigPackage(configPackages);
    if (linter === 'oxlint') {
      renderOxlintConfigPackage(configPackages);
    } else if (linter === 'eslint') {
      renderEslintConfigPackage(configPackages);
    }
    if (formatter === 'oxfmt') {
      renderOxfmtConfigPackage(configPackages);
    } else if (formatter === 'prettier') {
      renderPrettierConfigPackage(configPackages);
    }
  }

  // Workspace Config (pnpm-workspace.yaml)
  const workspaceConfig: Record<string, VirtualFile> = {};
  // We'll handle this specially with merge logic

  // Root Config
  const rootConfig: Record<string, VirtualFile> = {};
  rootConfig['.editorconfig'] = renderEditorConfig();
  rootConfig['.gitignore'] = renderGitignore(isMonorepo ? 'workspace-root' : 'standalone');
  rootConfig['.gitattributes'] = {
    type: 'text',
    content: `* text=auto eol=lf
*.{cmd,[cC][mM][dD]} text eol=crlf
*.{bat,[bB][aA][tT]} text eol=crlf
`,
  };

  if (!isMonorepo && formatter === 'prettier') {
    rootConfig[configStrategy === 'root' ? '.prettierignore' : '.config/prettierignore'] = {
      type: 'text',
      content: toPrettierIgnoreContent(),
    };
  }

  if (!isMonorepo && config.viteTemplate != null) {
    rootConfig['vite.config.ts'] = renderExpectedViteConfig(config.viteTemplate);
  }

  // Biome config if using biome
  if (linter === 'biome' || formatter === 'biome') {
    const biomeVersion = getResolvedPackageVersion(versions, '@biomejs/biome');
    const biomeConfig = {
      $schema: `https://biomejs.dev/schemas/${biomeVersion}/schema.json`,
      vcs: {
        enabled: true,
        clientKind: 'git',
        useIgnoreFile: true,
      },
      linter: {
        enabled: linter === 'biome',
        rules: {
          recommended: true,
        },
      },
      formatter: {
        enabled: formatter === 'biome',
      },
    };
    rootConfig['biome.json'] = {
      type: 'text',
      content: renderJson(biomeConfig),
    };
  }

  return {
    'ai-files': aiFilesMap,
    vscode: vscodeFiles,
    'package-json': {},
    'config-packages': configPackages,
    'tooling-config': {},
    'workspace-config': workspaceConfig,
    'root-config': rootConfig,
  };
}

// =============================================================================
// Comparison
// =============================================================================

/**
 * Checks if a file exists.
 */
async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function stripJsonComments(content: string): string {
  let output = '';
  let inString = false;
  let inLineComment = false;
  let inBlockComment = false;
  let escaped = false;

  for (let index = 0; index < content.length; index++) {
    const char = content[index]!;
    const next = content[index + 1];

    if (inLineComment) {
      if (char === '\n' || char === '\r') {
        inLineComment = false;
        output += char;
      }
      continue;
    }

    if (inBlockComment) {
      if (char === '*' && next === '/') {
        inBlockComment = false;
        index++;
      }
      continue;
    }

    if (inString) {
      output += char;
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      output += char;
      continue;
    }

    if (char === '/' && next === '/') {
      inLineComment = true;
      index++;
      continue;
    }

    if (char === '/' && next === '*') {
      inBlockComment = true;
      index++;
      continue;
    }

    output += char;
  }

  return output;
}

function stripTrailingJsonCommas(content: string): string {
  let output = '';
  let inString = false;
  let escaped = false;

  for (let index = 0; index < content.length; index++) {
    const char = content[index]!;

    if (inString) {
      output += char;
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      output += char;
      continue;
    }

    if (char === ',') {
      let lookahead = index + 1;
      while (/\s/.test(content[lookahead] ?? '')) lookahead++;
      if (content[lookahead] === '}' || content[lookahead] === ']') {
        continue;
      }
    }

    output += char;
  }

  return output;
}

function parseJsonValue(content: string): unknown {
  return JSON.parse(stripTrailingJsonCommas(stripJsonComments(content)));
}

function stableJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stableJsonValue);
  }

  if (value != null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entryValue]) => [key, stableJsonValue(entryValue)])
    );
  }

  return value;
}

function jsonValuesEqual(currentContent: string, newContent: string): boolean {
  try {
    return (
      JSON.stringify(stableJsonValue(parseJsonValue(currentContent))) ===
      JSON.stringify(stableJsonValue(parseJsonValue(newContent)))
    );
  } catch {
    return false;
  }
}

function shouldCompareJsonValues(filePath: string): boolean {
  return filePath.endsWith('.json') || filePath.endsWith('.jsonc');
}

function fileContentsEqual(filePath: string, currentContent: string, newContent: string): boolean {
  if (shouldCompareJsonValues(filePath) && jsonValuesEqual(currentContent, newContent)) {
    return true;
  }

  return currentContent === newContent;
}

function compareTextFileWithDisk(
  filePath: string,
  currentContent: string,
  expectedContent: string
): FileChange {
  if (filePath === '.gitignore') {
    const merged = mergeGitignoreContent(currentContent, detectGitignoreVariant(expectedContent));
    if (fileContentsEqual(filePath, currentContent, merged.content)) {
      return {
        path: filePath,
        status: 'unchanged',
        currentContent,
        newContent: currentContent,
        mergeSafe: merged.mergeSafe,
      };
    }

    return {
      path: filePath,
      status: 'modified',
      currentContent,
      newContent: merged.content,
      mergeSafe: merged.mergeSafe,
    };
  }

  if (isManagedAiFilePath(filePath)) {
    const merged = mergeAiFileContent(currentContent, expectedContent);
    if (fileContentsEqual(filePath, currentContent, merged.content)) {
      return {
        path: filePath,
        status: 'unchanged',
        currentContent,
        newContent: currentContent,
        mergeSafe: merged.mergeSafe,
      };
    }

    return {
      path: filePath,
      status: 'modified',
      currentContent,
      newContent: merged.content,
      mergeSafe: merged.mergeSafe,
    };
  }

  if (fileContentsEqual(filePath, currentContent, expectedContent)) {
    return {
      path: filePath,
      status: 'unchanged',
      currentContent,
      newContent: currentContent,
    };
  }

  return {
    path: filePath,
    status: 'modified',
    currentContent,
    newContent: expectedContent,
  };
}

/**
 * Compares expected files with disk and categorizes changes.
 */
export async function compareWithDisk(
  expected: Record<ExpectedUpdateCategory, Record<string, VirtualFile>>,
  root: string
): Promise<CategoryUpdate[]> {
  const categoryLabels: Record<UpdateCategory, string> = {
    'ai-files': 'AI Files',
    'ai-files-install': 'Install More AI Files',
    'ai-files-update': 'Update Existing AI Files',
    vscode: 'VS Code',
    'package-json': 'package.json Scripts',
    'config-packages': 'Config Packages',
    'tooling-config': 'Tooling Config',
    'workspace-config': 'Workspace Config',
    'root-config': 'Root Config',
  };

  const categories: CategoryUpdate[] = [];

  for (const [category, files] of Object.entries(expected) as [
    ExpectedUpdateCategory,
    Record<string, VirtualFile>,
  ][]) {
    const changes: FileChange[] = [];

    for (const [filePath, file] of Object.entries(files)) {
      if (file.type !== 'text') continue;

      const fullPath = join(root, filePath);
      const newContent = file.content;

      if (await fileExists(fullPath)) {
        const currentContent = await readFile(fullPath, 'utf-8');
        changes.push(compareTextFileWithDisk(filePath, currentContent, newContent));
      } else {
        changes.push({
          path: filePath,
          status: 'added',
          newContent,
        });
      }
    }

    // Split AI files into separate prompts for installing missing files and updating existing ones.
    if (category === 'ai-files') {
      const newAiFiles = changes.filter((change) => change.status === 'added');
      const modifiedAiFiles = changes.filter((change) => change.status === 'modified');

      if (newAiFiles.length > 0) {
        categories.push({
          category: 'ai-files-install',
          label: categoryLabels['ai-files-install'],
          changes: newAiFiles,
          hasUserModifications: false,
        });
      }

      if (modifiedAiFiles.length > 0) {
        categories.push({
          category: 'ai-files-update',
          label: categoryLabels['ai-files-update'],
          changes: modifiedAiFiles,
          hasUserModifications: modifiedAiFiles.some((change) => !change.mergeSafe),
        });
      }

      continue;
    }

    // Skip empty categories
    if (changes.length === 0) continue;

    // Determine if user has modifications
    // A file is "user modified" if it exists but doesn't match what we'd generate
    const hasUserModifications = changes.some((c) => c.status === 'modified' && !c.mergeSafe);

    categories.push({
      category,
      label: categoryLabels[category],
      changes,
      hasUserModifications,
    });
  }

  return categories;
}

// =============================================================================
// Package Script Merge
// =============================================================================

function isPackageManagerName(value: string): value is PackageManagerName {
  return value === 'pnpm' || value === 'npm' || value === 'yarn';
}

function hasPackage(pkg: PackageJsonForScripts, name: string): boolean {
  return (
    pkg.dependencies?.[name] != null ||
    pkg.devDependencies?.[name] != null ||
    pkg.peerDependencies?.[name] != null
  );
}

function sortPackageMap(packageMap: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(packageMap).sort(([a], [b]) => a.localeCompare(b)));
}

function addMissingDevDependency(
  pkg: PackageJsonForScripts,
  devDependencies: Record<string, string>,
  name: string
) {
  if (!hasPackage(pkg, name)) {
    devDependencies[name] = formatResolvedPackageVersion({}, name);
  }
}

async function detectTypeScriptPackage(root: string, pkg: PackageJsonForScripts): Promise<boolean> {
  if (hasPackage(pkg, 'typescript')) return true;

  return (
    (await fileExists(join(root, 'tsconfig.json'))) ||
    (await fileExists(join(root, 'tsconfig.app.json'))) ||
    (await fileExists(join(root, '.config/tsconfig.app.json')))
  );
}

function detectLibraryPackage(pkg: PackageJsonForScripts): boolean {
  return (
    pkg.exports != null ||
    pkg.main?.includes('dist') === true ||
    pkg.module?.includes('dist') === true ||
    (Array.isArray(pkg.files) && pkg.files.includes('dist'))
  );
}

function getPackageManagerForScripts(config: WorkspaceConfig, pkg: PackageJsonForScripts) {
  const packageManager = parsePackageManagerSpec(pkg.packageManager)?.name ?? config.packageManager;
  return isPackageManagerName(packageManager) ? packageManager : 'pnpm';
}

function getSinglePackageToolScripts(config: WorkspaceConfig) {
  const isStealth = (config.configStrategy ?? 'stealth') === 'stealth';
  const linterScripts =
    config.linter === 'oxlint'
      ? packageJsonScripts.lint.oxlint(isStealth ? '.config/oxlint.json' : undefined)
      : config.linter === 'eslint'
        ? packageJsonScripts.lint.eslint(isStealth ? '.config/eslint.config.js' : undefined)
        : packageJsonScripts.lint.biome(isStealth ? '.config' : undefined);

  const formatterScripts =
    config.formatter === 'prettier'
      ? packageJsonScripts.format.prettier(
          isStealth ? '.config/prettier.json' : undefined,
          isStealth ? '.config/prettierignore' : undefined
        )
      : config.formatter === 'oxfmt'
        ? packageJsonScripts.format.oxfmt(isStealth ? '.config/oxfmt.json' : 'oxfmt.json')
        : packageJsonScripts.format.biome(isStealth ? '.config' : undefined);

  return mergePackageJsonScripts(linterScripts, formatterScripts);
}

function getLibraryBuildScripts(pkg: PackageJsonForScripts) {
  if (!detectLibraryPackage(pkg)) return undefined;

  if (hasPackage(pkg, 'tsdown') || pkg.scripts?.build === 'tsdown') {
    return packageJsonScripts.build.tsdown;
  }

  return packageJsonScripts.build.unbuild();
}

function getTestingScripts(pkg: PackageJsonForScripts) {
  if (hasPackage(pkg, 'vitest') || pkg.scripts?.test === 'vitest') {
    return packageJsonScripts.test.vitest;
  }

  return undefined;
}

function scriptsEqual(left: Record<string, string>, right: Record<string, string>): boolean {
  const leftEntries = Object.entries(left);
  if (leftEntries.length !== Object.keys(right).length) return false;

  return leftEntries.every(([key, value]) => right[key] === value);
}

function packageManagerFieldsEqual(
  pkg: PackageJsonForScripts,
  packageManagerSpec: PackageManagerSpec | undefined,
  targetNodeVersion: string | undefined
): boolean {
  if (packageManagerSpec == null || packageManagerSpec.version == null) {
    return targetNodeVersion == null || pkg.engines?.node === `>=${targetNodeVersion}`;
  }

  const majorVersion = getSemverMajorString(packageManagerSpec.version);
  return (
    pkg.packageManager === formatPackageManager(packageManagerSpec) &&
    pkg.engines?.[packageManagerSpec.name] === `>=${majorVersion}.0.0` &&
    (targetNodeVersion == null || pkg.engines?.node === `>=${targetNodeVersion}`)
  );
}

function applyPackageManagerFields(
  pkg: PackageJsonForScripts,
  packageManagerSpec: PackageManagerSpec | undefined,
  targetNodeVersion: string | undefined
): PackageJsonForScripts {
  if (packageManagerSpec == null || packageManagerSpec.version == null) {
    if (targetNodeVersion == null) return pkg;
    return {
      ...pkg,
      engines: {
        ...pkg.engines,
        node: `>=${targetNodeVersion}`,
      },
    };
  }

  const majorVersion = getSemverMajorString(packageManagerSpec.version);
  return {
    ...pkg,
    packageManager: formatPackageManager(packageManagerSpec),
    engines: {
      ...pkg.engines,
      [packageManagerSpec.name]: `>=${majorVersion}.0.0`,
      ...(targetNodeVersion == null ? {} : { node: `>=${targetNodeVersion}` }),
    },
  };
}

async function getExpectedPackageScripts(
  root: string,
  config: WorkspaceConfig,
  pkg: PackageJsonForScripts
) {
  if (config.isMonorepo) {
    return packageJsonScripts.monorepoRoot(config.linter, config.formatter);
  }

  const language = (await detectTypeScriptPackage(root, pkg)) ? 'typescript' : 'javascript';
  const isLibrary = detectLibraryPackage(pkg);
  const packageManagerName = getPackageManagerForScripts(config, pkg);

  return mergePackageJsonScripts(
    resolveDefaultPackageJsonScripts({
      language,
      isLibrary,
      packageManagerName,
    }),
    getLibraryBuildScripts(pkg),
    getTestingScripts(pkg),
    getSinglePackageToolScripts(config)
  );
}

async function getExpectedPackageDevDependencies(
  root: string,
  config: WorkspaceConfig,
  pkg: PackageJsonForScripts
) {
  const nextDevDependencies = { ...pkg.devDependencies };
  const shouldAddOxlintTypeAwareBackend =
    config.linter === 'oxlint' &&
    (config.isMonorepo || (await detectTypeScriptPackage(root, pkg))) &&
    !hasPackage(pkg, 'oxlint-tsgolint');

  if (shouldAddOxlintTypeAwareBackend) {
    nextDevDependencies['oxlint-tsgolint'] = formatResolvedPackageVersion({}, 'oxlint-tsgolint');
  }

  if (!config.isMonorepo && config.viteTemplate === 'react') {
    addMissingDevDependency(pkg, nextDevDependencies, '@babel/core');
    addMissingDevDependency(pkg, nextDevDependencies, '@rolldown/plugin-babel');
    addMissingDevDependency(pkg, nextDevDependencies, 'babel-plugin-react-compiler');
    if (config.linter === 'oxlint') {
      addMissingDevDependency(pkg, nextDevDependencies, 'eslint-plugin-react-hooks');
    }

    if (await detectTypeScriptPackage(root, pkg)) {
      addMissingDevDependency(pkg, nextDevDependencies, '@types/babel__core');
    }
  }

  return sortPackageMap(nextDevDependencies);
}

/**
 * Generates a package.json additive update while preserving unknown package fields.
 */
export async function getPackageJsonScriptUpdates(
  root: string,
  config: WorkspaceConfig
): Promise<FileChange[]> {
  const packageJsonPath = join(root, 'package.json');

  let currentContent: string;
  try {
    currentContent = await readFile(packageJsonPath, 'utf-8');
  } catch {
    return [];
  }

  const pkg = JSON.parse(currentContent) as PackageJsonForScripts;
  const currentScripts = pkg.scripts ?? {};
  const expectedScripts = await getExpectedPackageScripts(root, config, pkg);
  const nextScripts = mergePackageJsonScripts(currentScripts, expectedScripts);
  const currentDevDependencies = pkg.devDependencies ?? {};
  const nextDevDependencies = await getExpectedPackageDevDependencies(root, config, pkg);
  const targetPackageManagerSpec = config.targetPackageManagerSpec;
  const targetNodeVersion = config.targetNodeVersion;

  if (
    scriptsEqual(currentScripts, nextScripts) &&
    scriptsEqual(currentDevDependencies, nextDevDependencies) &&
    packageManagerFieldsEqual(pkg, targetPackageManagerSpec, targetNodeVersion)
  ) {
    return [
      {
        path: 'package.json',
        status: 'unchanged',
        currentContent,
        newContent: currentContent,
      },
    ];
  }

  const nextPackageJson: PackageJsonForScripts = applyPackageManagerFields(
    {
      ...pkg,
      scripts: nextScripts,
    },
    targetPackageManagerSpec,
    targetNodeVersion
  );
  if (Object.keys(nextDevDependencies).length > 0 || pkg.devDependencies != null) {
    nextPackageJson.devDependencies = nextDevDependencies;
  }
  const newContent = renderJson(nextPackageJson, { inlineArrays: false });

  return [
    {
      path: 'package.json',
      status: 'modified',
      currentContent,
      newContent,
    },
  ];
}

const TYPESCRIPT_7_VERSION = '7.0.0';

function getDeclaredVersionMajor(version: string): number | undefined {
  const match = version.match(/^[~^]?v?(\d+)(?:\.|$)/);
  return match == null ? undefined : getSemverMajor(match[1]);
}

export function getTypeScriptMajorUpdateTarget(
  currentVersion: string,
  targetVersion = TYPESCRIPT_7_VERSION
): string | undefined {
  if (getDeclaredVersionMajor(currentVersion) !== 5 || getSemverMajor(targetVersion) !== 7) {
    return undefined;
  }

  const prefix = currentVersion.startsWith('^') ? '^' : currentVersion.startsWith('~') ? '~' : '';
  return `${prefix}${targetVersion}`;
}

const TYPESCRIPT_CONFIG_IGNORED_DIRECTORIES = new Set([
  '.git',
  'build',
  'coverage',
  'dist',
  'node_modules',
]);

function shouldIgnoreWorkspaceDirectory(name: string): boolean {
  return (
    TYPESCRIPT_CONFIG_IGNORED_DIRECTORIES.has(name) || (name.startsWith('.') && name !== '.config')
  );
}

async function findTypeScriptConfigPaths(root: string, directory = root): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return [];
  }

  const paths: string[] = [];
  for (const entry of entries) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!shouldIgnoreWorkspaceDirectory(entry.name)) {
        paths.push(...(await findTypeScriptConfigPaths(root, fullPath)));
      }
      continue;
    }

    const isSharedTypeScriptConfig =
      relative(root, directory) === join('.config', 'typescript') &&
      entry.name !== 'package.json' &&
      entry.name.endsWith('.json');
    if (
      entry.isFile() &&
      (/^tsconfig(?:\.[^.]+)*\.json$/.test(entry.name) || isSharedTypeScriptConfig)
    ) {
      paths.push(relative(root, fullPath));
    }
  }

  return paths.sort();
}

async function findWorkspacePackageJsonPaths(root: string, directory = root): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return [];
  }

  const paths: string[] = [];
  for (const entry of entries) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!shouldIgnoreWorkspaceDirectory(entry.name)) {
        paths.push(...(await findWorkspacePackageJsonPaths(root, fullPath)));
      }
    } else if (entry.isFile() && entry.name === 'package.json') {
      paths.push(relative(root, fullPath));
    }
  }

  return paths.sort((left, right) => {
    if (left === 'package.json') return -1;
    if (right === 'package.json') return 1;
    return left.localeCompare(right);
  });
}

function prefixBaseUrlPath(baseUrl: string, path: string): string {
  if (path.startsWith('/')) return path;

  const normalizedBaseUrl = baseUrl.replace(/\/$/, '');
  const normalized = `${normalizedBaseUrl ? `${normalizedBaseUrl}/` : ''}${path.replace(/^\.\//, '')}`
    .replace(/^\.\//, '')
    .replace(/\/+/g, '/');
  return normalized.startsWith('.') ? normalized : `./${normalized}`;
}

function migrateTypeScript7CompilerOptions(
  options: Record<string, unknown>,
  configPath: string
): boolean {
  const original = JSON.stringify(options);
  const target = typeof options.target === 'string' ? options.target.toLowerCase() : undefined;
  const module = typeof options.module === 'string' ? options.module.toLowerCase() : undefined;
  const moduleResolution =
    typeof options.moduleResolution === 'string' ? options.moduleResolution.toLowerCase() : undefined;

  if (target === 'es5') options.target = 'ES2015';
  if (['amd', 'umd', 'system', 'systemjs', 'none'].includes(module ?? '')) {
    options.module = 'ESNext';
  }
  if (['classic', 'node', 'node10'].includes(moduleResolution ?? '')) {
    if (module === 'commonjs') {
      options.module = 'NodeNext';
      options.moduleResolution = 'NodeNext';
    } else {
      options.moduleResolution = 'bundler';
    }
  }

  delete options.downlevelIteration;
  delete options.ignoreDeprecations;

  if (options.esModuleInterop === false) options.esModuleInterop = true;
  if (options.allowSyntheticDefaultImports === false) options.allowSyntheticDefaultImports = true;
  if (options.alwaysStrict === false) options.alwaysStrict = true;
  if (options.stableTypeOrdering === false) options.stableTypeOrdering = true;

  const baseUrl = options.baseUrl;
  if (typeof baseUrl === 'string') {
    const paths = options.paths;
    if (paths != null && typeof paths === 'object' && !Array.isArray(paths)) {
      for (const [alias, targets] of Object.entries(paths as Record<string, unknown>)) {
        if (!Array.isArray(targets)) continue;
        (paths as Record<string, unknown>)[alias] = targets.map((entry) =>
          typeof entry === 'string' ? prefixBaseUrlPath(baseUrl, entry) : entry
        );
      }
    } else {
      options.paths = { '*': [prefixBaseUrlPath(baseUrl, '*')] };
    }
    delete options.baseUrl;
  }

  if (options.types == null) {
    if (/(?:^|[/\\])(?:tsconfig\.)?node\.json$/.test(configPath)) {
      options.types = ['node'];
    } else if (
      /(?:^|[/\\])tsconfig\.app\.json$/.test(configPath) ||
      /(?:^|[/\\])\.config[/\\]typescript[/\\]base\.json$/.test(configPath)
    ) {
      options.types = [];
    }
  }
  options.noUncheckedSideEffectImports = true;
  options.libReplacement = false;

  return JSON.stringify(options) !== original;
}

export async function getTypeScript7ConfigUpdates(root: string): Promise<FileChange[]> {
  const changes: FileChange[] = [];

  for (const configPath of await findTypeScriptConfigPaths(root)) {
    const fullPath = join(root, configPath);
    const currentContent = await readFile(fullPath, 'utf-8');

    let tsconfig: Record<string, unknown>;
    try {
      const parsed = parseJsonValue(currentContent);
      if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) continue;
      tsconfig = parsed as Record<string, unknown>;
    } catch {
      continue;
    }

    const compilerOptions = tsconfig.compilerOptions;
    if (
      compilerOptions == null ||
      typeof compilerOptions !== 'object' ||
      Array.isArray(compilerOptions) ||
      !migrateTypeScript7CompilerOptions(compilerOptions as Record<string, unknown>, configPath)
    ) {
      continue;
    }

    changes.push({
      path: configPath,
      status: 'modified',
      currentContent,
      newContent: renderJson(tsconfig),
      mergeSafe: true,
    });
  }

  return changes;
}

/**
 * Updates an explicitly declared TypeScript 5 dependency to TypeScript 7.
 * Installation remains the responsibility of the normal package update step.
 */
export async function getTypeScriptMajorPackageUpdates(
  root: string,
  config?: WorkspaceConfig,
  targetVersion = TYPESCRIPT_7_VERSION,
  oxlintTsgolintVersion = getResolvedPackageVersion({}, 'oxlint-tsgolint')
): Promise<FileChange[]> {
  if (config?.linter === 'eslint') return [];

  const packages: Array<{
    path: string;
    currentContent: string;
    pkg: PackageJsonForScripts;
  }> = [];
  for (const packagePath of await findWorkspacePackageJsonPaths(root)) {
    try {
      const currentContent = await readFile(join(root, packagePath), 'utf-8');
      packages.push({
        path: packagePath,
        currentContent,
        pkg: JSON.parse(currentContent) as PackageJsonForScripts,
      });
    } catch {
      continue;
    }
  }

  if (packages.some(({ pkg }) => hasPackage(pkg, 'eslint') || hasPackage(pkg, 'typescript-eslint'))) {
    return [];
  }

  const changedPackages = new Set<string>();
  for (const { path: packagePath, pkg } of packages) {
    for (const dependencyField of ['dependencies', 'devDependencies', 'peerDependencies'] as const) {
      const dependencies = pkg[dependencyField];
      if (dependencies == null) continue;

      const currentVersion = dependencies.typescript;
      if (currentVersion == null) continue;

      const targetRange = getTypeScriptMajorUpdateTarget(currentVersion, targetVersion);
      if (targetRange == null) continue;

      dependencies.typescript = targetRange;
      changedPackages.add(packagePath);
    }
  }

  if (changedPackages.size === 0) return [];

  if (config?.linter === 'oxlint') {
    const rootPackage = packages.find(({ path }) => path === 'package.json');
    if (rootPackage != null) {
      const targetRange = `^${oxlintTsgolintVersion}`;
      let dependencyUpdated = false;
      for (const dependencyField of [
        'dependencies',
        'devDependencies',
        'peerDependencies',
      ] as const) {
        const dependencies = rootPackage.pkg[dependencyField];
        if (dependencies?.['oxlint-tsgolint'] == null) continue;
        dependencies['oxlint-tsgolint'] = targetRange;
        dependencyUpdated = true;
      }

      if (!dependencyUpdated) {
        rootPackage.pkg.devDependencies = sortPackageMap({
          ...rootPackage.pkg.devDependencies,
          'oxlint-tsgolint': targetRange,
        });
      }
      changedPackages.add(rootPackage.path);
    }
  }

  const changes: FileChange[] = packages
    .filter(({ path }) => changedPackages.has(path))
    .map(({ path, currentContent, pkg }) => ({
      path,
      status: 'modified',
      currentContent,
      newContent: renderJson(pkg, { inlineArrays: false }),
      mergeSafe: true,
    }));

  changes.push(...(await getTypeScript7ConfigUpdates(root)));

  if (config?.linter !== 'oxlint') return changes;

  if (config.isMonorepo) {
    for (const sharedConfigPath of ['.config/oxlint/base.json', '.config/oxlint/react.json']) {
      let sharedCurrentContent: string;
      try {
        sharedCurrentContent = await readFile(join(root, sharedConfigPath), 'utf-8');
      } catch {
        continue;
      }

      let sharedConfig: Record<string, unknown>;
      try {
        const parsed = parseJsonValue(sharedCurrentContent);
        if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) continue;
        sharedConfig = parsed as Record<string, unknown>;
      } catch {
        continue;
      }

      const sharedOptions = sharedConfig.options;
      if (
        sharedOptions == null ||
        typeof sharedOptions !== 'object' ||
        Array.isArray(sharedOptions)
      ) {
        continue;
      }

      const nextOptions = { ...(sharedOptions as Record<string, unknown>) };
      const hadRootOnlyOptions = 'typeAware' in nextOptions || 'typeCheck' in nextOptions;
      if (!hadRootOnlyOptions) continue;

      delete nextOptions.typeAware;
      delete nextOptions.typeCheck;
      if (Object.keys(nextOptions).length === 0) delete sharedConfig.options;
      else sharedConfig.options = nextOptions;

      changes.push({
        path: sharedConfigPath,
        status: 'modified',
        currentContent: sharedCurrentContent,
        newContent: renderJson(sharedConfig),
        mergeSafe: true,
      });
    }
  }

  const oxlintConfigPath = config.isMonorepo
    ? 'oxlint.json'
    : config.configStrategy === 'root'
      ? 'oxlint.json'
      : '.config/oxlint.json';
  let currentOxlintContent: string;
  try {
    currentOxlintContent = await readFile(join(root, oxlintConfigPath), 'utf-8');
  } catch {
    return changes;
  }

  let oxlintConfig: Record<string, unknown>;
  try {
    const parsed = parseJsonValue(currentOxlintContent);
    if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) return changes;
    oxlintConfig = parsed as Record<string, unknown>;
  } catch {
    return changes;
  }

  const currentOptions = oxlintConfig.options;
  if (
    currentOptions != null &&
    (typeof currentOptions !== 'object' || Array.isArray(currentOptions))
  ) {
    return changes;
  }

  const options = (currentOptions ?? {}) as Record<string, unknown>;
  if (options.typeAware !== true || options.typeCheck !== true) {
    oxlintConfig.options = { ...options, typeAware: true, typeCheck: true };
    changes.push({
      path: oxlintConfigPath,
      status: 'modified',
      currentContent: currentOxlintContent,
      newContent: renderJson(oxlintConfig),
      mergeSafe: true,
    });
  }

  return changes;
}

/**
 * Adds the explicit Node.js type library required by TypeScript 6 to an
 * existing generated single-package Node config while preserving its other
 * compiler options.
 */
export async function getTypescriptNodeConfigUpdates(
  root: string,
  config: WorkspaceConfig
): Promise<FileChange[]> {
  if (config.isMonorepo) return [];

  const relativePath =
    config.configStrategy === 'root' ? 'tsconfig.node.json' : '.config/tsconfig.node.json';
  const fullPath = join(root, relativePath);

  let currentContent: string;
  try {
    currentContent = await readFile(fullPath, 'utf-8');
  } catch {
    return [];
  }

  let tsconfig: Record<string, unknown>;
  try {
    const parsed = parseJsonValue(currentContent);
    if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) return [];
    tsconfig = parsed as Record<string, unknown>;
  } catch {
    return [];
  }

  const compilerOptions = tsconfig.compilerOptions;
  if (
    compilerOptions == null ||
    typeof compilerOptions !== 'object' ||
    Array.isArray(compilerOptions)
  ) {
    return [];
  }

  const options = compilerOptions as Record<string, unknown>;
  const currentTypes = options.types;
  if (currentTypes != null && !Array.isArray(currentTypes)) return [];
  if (currentTypes?.includes('node')) return [];

  options.types = [...(currentTypes ?? []), 'node'];

  return [
    {
      path: relativePath,
      status: 'modified',
      currentContent,
      newContent: renderJson(tsconfig),
      mergeSafe: true,
    },
  ];
}

export async function getPackageManagerConfigUpdates(
  root: string,
  config: WorkspaceConfig
): Promise<FileChange[]> {
  if (config.targetPackageManagerSpec == null && config.targetNodeVersion == null) return [];

  const packageJsonPath = join(root, 'package.json');

  let currentContent: string;
  try {
    currentContent = await readFile(packageJsonPath, 'utf-8');
  } catch {
    return [];
  }

  const pkg = JSON.parse(currentContent) as PackageJsonForScripts;
  if (packageManagerFieldsEqual(pkg, config.targetPackageManagerSpec, config.targetNodeVersion)) {
    return [
      {
        path: 'package.json',
        status: 'unchanged',
        currentContent,
        newContent: currentContent,
      },
    ];
  }

  const nextPackageJson = applyPackageManagerFields(
    pkg,
    config.targetPackageManagerSpec,
    config.targetNodeVersion
  );

  return [
    {
      path: 'package.json',
      status: 'modified',
      currentContent,
      newContent: renderJson(nextPackageJson, { inlineArrays: false }),
    },
  ];
}

// =============================================================================
// Tooling Config Replacement
// =============================================================================

function planSinglePackageOxlintConfig(config: WorkspaceConfig): FileChange | undefined {
  if (config.linter !== 'oxlint' || config.isMonorepo) return undefined;

  const isStealth = (config.configStrategy ?? 'stealth') === 'stealth';
  const path = isStealth ? '.config/oxlint.json' : 'oxlint.json';
  const oxlintConfig = renderOxlintConfig({
    schemaPath: isStealth
      ? '../node_modules/oxlint/configuration_schema.json'
      : './node_modules/oxlint/configuration_schema.json',
    react: config.viteTemplate === 'react' || config.viteTemplate === 'r3f',
    reactCompiler: config.viteTemplate === 'react',
    typescript: true,
  });

  return {
    path,
    status: 'added',
    newContent: renderJson(oxlintConfig),
  };
}

export async function getOxlintConfigReplacementUpdates(
  root: string,
  config: WorkspaceConfig
): Promise<FileChange[]> {
  const expected = planSinglePackageOxlintConfig(config);
  if (expected == null) return [];

  const fullPath = join(root, expected.path);
  let currentContent: string;
  try {
    currentContent = await readFile(fullPath, 'utf-8');
  } catch {
    return [expected];
  }

  if (fileContentsEqual(expected.path, currentContent, expected.newContent)) {
    return [
      {
        ...expected,
        status: 'unchanged',
        currentContent,
        newContent: currentContent,
      },
    ];
  }

  return [
    {
      ...expected,
      status: 'modified',
      currentContent,
    },
  ];
}

// =============================================================================
// Workspace Config Merge
// =============================================================================

function extractBuildDependencies(content: string): Record<string, boolean> {
  const buildDependencies: Record<string, boolean> = {};
  let section: 'onlyBuiltDependencies' | 'allowBuilds' | undefined;

  for (const line of content.split('\n')) {
    const trimmed = line.trim();

    if (trimmed === 'onlyBuiltDependencies:') {
      section = 'onlyBuiltDependencies';
      continue;
    }

    if (trimmed === 'allowBuilds:') {
      section = 'allowBuilds';
      continue;
    }

    if (section != null && trimmed && !line.startsWith(' ') && !line.startsWith('\t')) {
      section = undefined;
    }

    if (section === 'onlyBuiltDependencies' && trimmed.startsWith('-')) {
      const dependency = trimmed
        .slice(1)
        .trim()
        .replace(/^["']|["']$/g, '');
      if (dependency.length > 0) {
        buildDependencies[dependency] = true;
      }
    }

    if (section === 'allowBuilds') {
      const match = trimmed.match(/^([^:]+):\s*(true|false)$/);
      if (match == null) continue;

      const dependency = match[1].trim().replace(/^["']|["']$/g, '');
      if (dependency.length > 0) {
        buildDependencies[dependency] = match[2] === 'true';
      }
    }
  }

  return buildDependencies;
}

function withDefaultBuildDependencies(
  buildDependencies: Record<string, boolean>
): Record<string, boolean> {
  return Object.keys(buildDependencies).length > 0 ? buildDependencies : { esbuild: true };
}

function isPnpmWorkspaceManagedScalarKey(trimmed: string): boolean {
  return trimmed.startsWith('manage-package-manager-versions:') || trimmed.startsWith('pmOnFail:');
}

function isPnpmWorkspaceManagedBlockKey(trimmed: string): boolean {
  return trimmed === 'onlyBuiltDependencies:' || trimmed === 'allowBuilds:';
}

function isIndentedWorkspaceLine(line: string): boolean {
  return line.startsWith(' ') || line.startsWith('\t');
}

function removePnpmWorkspaceManagedKeys(content: string): {
  content: string;
  insertionIndex: number;
} {
  const sourceLines = content.split('\n');
  const lines: string[] = [];
  let insertionIndex = 0;
  let foundManagedKey = false;

  for (let index = 0; index < sourceLines.length; index++) {
    const line = sourceLines[index];
    const trimmed = line.trim();

    if (isPnpmWorkspaceManagedScalarKey(trimmed)) {
      if (!foundManagedKey) {
        insertionIndex = lines.length;
        foundManagedKey = true;
      }
      continue;
    }

    if (isPnpmWorkspaceManagedBlockKey(trimmed)) {
      if (!foundManagedKey) {
        insertionIndex = lines.length;
        foundManagedKey = true;
      }

      while (index + 1 < sourceLines.length) {
        const nextLine = sourceLines[index + 1];
        const nextTrimmed = nextLine.trim();
        if (nextTrimmed !== '' && !isIndentedWorkspaceLine(nextLine)) break;
        index++;
      }
      continue;
    }

    lines.push(line);
  }

  return {
    content: lines.join('\n').trim(),
    insertionIndex,
  };
}

function patchPnpmWorkspaceManagedKeys(
  content: string,
  profile: ReturnType<typeof getPackageManagerProfile>,
  buildDependencies: Record<string, boolean>
): string {
  const managedContent = renderPnpmWorkspaceConfig({
    profile,
    manageVersions: true,
    buildDependencies,
  });
  const existing = removePnpmWorkspaceManagedKeys(content);
  const preservedLines = existing.content.length > 0 ? existing.content.split('\n') : [];
  const insertionIndex = Math.min(existing.insertionIndex, preservedLines.length);
  const managedLines = managedContent.split('\n');

  preservedLines.splice(insertionIndex, 0, ...managedLines);
  return preservedLines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Generates workspace config updates using a package-manager-profile-aware strategy.
 * Patches managed pnpm settings while preserving the rest of the workspace file.
 */
export async function getWorkspaceConfigUpdates(
  root: string,
  config?: WorkspaceConfig
): Promise<FileChange[]> {
  const workspacePath = join(root, 'pnpm-workspace.yaml');
  const changes: FileChange[] = [];
  const packageManagerSpec = config?.targetPackageManagerSpec ??
    config?.packageManagerSpec ?? { name: 'pnpm' as const };
  const profile = getPackageManagerProfile(packageManagerSpec);
  const defaultPackages = ['.config/*', 'apps/*', 'packages/*'];

  let currentContent = '';
  let exists = false;

  try {
    currentContent = await readFile(workspacePath, 'utf-8');
    exists = true;
  } catch {
    // VirtualFile doesn't exist
  }

  if (!exists) {
    // Create new file with defaults
    const newContent = `${renderPnpmWorkspaceConfig({
      profile,
      manageVersions: true,
      packages: defaultPackages,
    })}\n`;
    changes.push({
      path: 'pnpm-workspace.yaml',
      status: 'added',
      newContent,
    });
    return changes;
  }

  const buildDependencies = withDefaultBuildDependencies(extractBuildDependencies(currentContent));
  const updatedContent = `${patchPnpmWorkspaceManagedKeys(
    currentContent,
    profile,
    buildDependencies
  )}\n`;

  if (updatedContent !== currentContent) {
    changes.push({
      path: 'pnpm-workspace.yaml',
      status: 'modified',
      currentContent,
      newContent: updatedContent,
    });
  } else {
    changes.push({
      path: 'pnpm-workspace.yaml',
      status: 'unchanged',
      currentContent,
      newContent: currentContent,
    });
  }

  return changes;
}

// =============================================================================
// Apply Updates
// =============================================================================

/**
 * Writes file changes to disk.
 */
export async function applyUpdates(changes: FileChange[], root: string): Promise<void> {
  for (const change of changes) {
    if (change.status === 'unchanged') continue;

    const fullPath = join(root, change.path);
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, change.newContent);
  }
}

// =============================================================================
// Display Helpers
// =============================================================================

/**
 * Formats a file change for display.
 */
export function formatFileChange(change: FileChange): string {
  const icon = change.status === 'added' ? '+' : change.status === 'modified' ? '~' : '=';
  return `  ${icon} ${change.path}`;
}
