import { readFile, access, writeFile, mkdir } from 'fs/promises';
import { constants } from 'fs';
import { join, dirname } from 'path';

import type {
  BaseTemplate,
  ConfigStrategy,
  Linter,
  Formatter,
  VirtualFile,
  PackageManagerName,
} from '../types.js';
import {
  renderTypescriptConfigPackage,
  renderOxlintConfigPackage,
  renderEslintConfigPackage,
  renderPrettierConfigPackage,
  renderOxfmtConfigPackage,
} from '../renderers/monorepo.js';
import { renderAiFiles, ALL_AI_PLATFORMS } from '../renderers/ai-files.js';
import { renderEditorConfig } from '../renderers/editorconfig.js';
import { renderGitignore } from '../renderers/gitignore.js';
import { renderVscodeFiles } from '../renderers/vscode.js';
import {
  formatResolvedPackageVersion,
  getResolvedPackageVersion,
  resolveMonorepoRootPackageVersions,
} from '../package-versions.js';
import {
  mergePackageJsonScripts,
  packageJsonScripts,
  resolveDefaultPackageJsonScripts,
} from '../renderers/package-json-scripts.js';
import { toPrettierIgnoreContent } from '../adapters/formatter-config.js';
import { renderOxlintConfig } from '../renderers/oxlint-config.js';
import { renderViteConfig } from '../renderers/vite-config.js';
import { detectTooling } from '../utils/index.js';

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
      packageManager = pkgJson.packageManager.split('@')[0] ?? packageManager;
    }
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
      content: JSON.stringify(biomeConfig, null, 2),
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
        if (fileContentsEqual(filePath, currentContent, newContent)) {
          changes.push({
            path: filePath,
            status: 'unchanged',
            currentContent,
            newContent,
          });
        } else {
          changes.push({
            path: filePath,
            status: 'modified',
            currentContent,
            newContent,
          });
        }
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
          hasUserModifications: true,
        });
      }

      continue;
    }

    // Skip empty categories
    if (changes.length === 0) continue;

    // Determine if user has modifications
    // A file is "user modified" if it exists but doesn't match what we'd generate
    const hasUserModifications = changes.some((c) => c.status === 'modified');

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
  const packageManager = pkg.packageManager?.split('@')[0] ?? config.packageManager;
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

  if (
    scriptsEqual(currentScripts, nextScripts) &&
    scriptsEqual(currentDevDependencies, nextDevDependencies)
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

  const nextPackageJson: PackageJsonForScripts = {
    ...pkg,
    scripts: nextScripts,
  };
  if (Object.keys(nextDevDependencies).length > 0 || pkg.devDependencies != null) {
    nextPackageJson.devDependencies = nextDevDependencies;
  }
  const newContent = `${JSON.stringify(nextPackageJson, null, 2)}\n`;

  return [
    {
      path: 'package.json',
      status: 'modified',
      currentContent,
      newContent,
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
    newContent: `${JSON.stringify(oxlintConfig, null, 2)}\n`,
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

/**
 * Generates workspace config updates using merge strategy.
 * Adds missing entries while preserving user's custom package paths.
 */
export async function getWorkspaceConfigUpdates(root: string): Promise<FileChange[]> {
  const workspacePath = join(root, 'pnpm-workspace.yaml');
  const changes: FileChange[] = [];

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
    const newContent = `manage-package-manager-versions: true

packages:
  - '.config/*'
  - 'apps/*'
  - 'packages/*'

onlyBuiltDependencies:
  - esbuild
`;
    changes.push({
      path: 'pnpm-workspace.yaml',
      status: 'added',
      newContent,
    });
    return changes;
  }

  // Check what's missing and build updated content
  let updatedContent = currentContent;
  let needsUpdate = false;

  // Check for manage-package-manager-versions
  if (!currentContent.includes('manage-package-manager-versions')) {
    updatedContent = `manage-package-manager-versions: true\n\n${updatedContent}`;
    needsUpdate = true;
  }

  // Check for onlyBuiltDependencies
  if (!currentContent.includes('onlyBuiltDependencies')) {
    updatedContent = `${updatedContent.trimEnd()}\n\nonlyBuiltDependencies:\n  - esbuild\n`;
    needsUpdate = true;
  }

  // Check for .config/* in packages
  if (!currentContent.includes('.config/*')) {
    // Insert .config/* after packages:
    const lines = updatedContent.split('\n');
    const packagesIndex = lines.findIndex((line) => line.trim().startsWith('packages:'));
    if (packagesIndex !== -1) {
      lines.splice(packagesIndex + 1, 0, "  - '.config/*'");
      updatedContent = lines.join('\n');
      needsUpdate = true;
    }
  }

  if (needsUpdate) {
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
