#!/usr/bin/env node

/**
 * @todo Refactor this file into some more logical splits.
 * Here are some ideas from the bot:
 *
 * src/cli.ts: executable entry only
 * src/cli/commands/create.ts: standalone create flow
 * src/cli/commands/workspace.ts: --workspace
 * src/cli/commands/update.ts: --update
 * src/cli/commands/fix.ts: --fix
 * src/cli/commands/check.ts: --check
 * src/cli/monorepo.ts: detect/parse workspace helpers
 * src/cli/options.ts: CliOptions, preset mapping, hasConfigOptions
 * src/cli/write.ts: file writing / disk apply helpers
 */

import * as p from '@clack/prompts';
import color from 'chalk';
import { Command } from 'commander';
import { constants } from 'node:fs';
import { access, mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { cwd } from 'node:process';
import { fetch } from 'undici';

import type {
    EngineSpec,
    Formatter,
    Linter,
    PackageManagerName,
    PackageManagerSpec,
} from './types.js';

import {
    editorNames,
    getDefaultProjectName,
    openInEditor,
    promptForInitialPackage,
    promptForOptions,
    promptForPackageOptions,
    type CliPresets,
} from './cli/index.js';
import {
    clearConfig,
    EditorChoice,
    getAiPlatforms,
    getConfigPath,
    getPreferredEditor,
    getReuseWindow,
    setAiPlatforms,
    setPreferredEditor,
    setReuseWindow,
} from './config.js';
import {
    AI_PLATFORM_HINTS,
    AI_PLATFORM_LABELS,
    ALL_AI_PLATFORMS,
    generateAiFiles,
} from './generators/ai-files.js';
import {
    generateEslintConfigPackage,
    generateOxfmtConfigPackage,
    generateOxlintConfigPackage,
    generatePrettierConfigPackage,
    generateTypescriptConfigPackage,
    generateVscodeFiles,
} from './generators/monorepo.js';
import {
    detectTooling,
    generate,
    getBaseTemplate,
    parseWorkspaceYamlContent,
    validatePackageName,
    type File,
    type GenerateOptions,
    type LibraryBundler,
    type ProjectType,
    type Template,
} from './index.js';
import {
    getPackageManagerName,
    getResolvedPackageVersion,
    parseEngine,
    parsePackageManager,
    resolveEngine,
    resolveMonorepoRootPackageVersions,
    resolvePackageManager,
    resolveProjectPackageVersions,
} from './package-versions.js';
import type { AiPlatform } from './types.js';
import {
    applyMigration,
    applyUpdates,
    compareWithDisk,
    detectCurrentConfig,
    formatFileChange,
    formatMigrationChange,
    generateExpectedFiles,
    getMigrationPlan,
    getWorkspaceConfigUpdates,
    needsMigration,
    type CategoryUpdate,
    type MigrationTarget,
    type WorkspaceConfig,
} from './update.js';
import { validateWorkspace } from './validate.js';

const require = createRequire(import.meta.url);
const pkg = require('../package.json') as { version: string };

// =============================================================================
// Types
// =============================================================================

interface CliOptions {
    type?: ProjectType;
    bundler?: LibraryBundler;
    template?: Template;
    linter?: 'eslint' | 'oxlint' | 'biome';
    formatter?: 'prettier' | 'oxfmt' | 'biome';
    drei?: boolean;
    handle?: boolean;
    leva?: boolean;
    postprocessing?: boolean;
    rapier?: boolean;
    xr?: boolean;
    uikit?: boolean;
    offscreen?: boolean;
    zustand?: boolean;
    koota?: boolean;
    pnpmManageVersions?: boolean;
    triplex?: boolean;
    viverse?: boolean;
    packageManager?: PackageManagerName;
    nodeVersion?: string;
    clearConfig?: boolean;
    dir?: string;
    configPath?: boolean;
    check?: boolean;
    fix?: boolean;
    update?: boolean;
    yes?: boolean;
    workspace?: boolean;
    path?: string;
}

// Meta options don't affect project configuration, only CLI behavior
const META_OPTIONS = [
    'clearConfig',
    'configPath',
    'check',
    'fix',
    'update',
    'yes',
    'workspace',
    'path',
    'dir',
] as const;

/**
 * Checks if any project config options were provided via CLI flags.
 */
function hasConfigOptions(options: CliOptions): boolean {
    return Object.keys(options).some(
        (key) => !META_OPTIONS.includes(key as (typeof META_OPTIONS)[number])
    );
}

type InheritedWorkspaceSettings = {
    linter?: 'oxlint' | 'eslint' | 'biome';
    formatter?: 'oxfmt' | 'prettier' | 'biome';
    packageManager?: PackageManagerSpec;
    engine?: EngineSpec;
    pnpmManageVersions?: boolean;
};

interface ExistingConfigs {
    linter?: 'oxlint' | 'eslint' | 'biome';
    formatter?: 'prettier' | 'biome';
    eslintConfigPath?: string;
    prettierConfigPath?: string;
    biomeConfigPath?: string;
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Helper to check if a file exists.
 */
async function fileExists(path: string): Promise<boolean> {
    try {
        await access(path, constants.F_OK);
        return true;
    } catch {
        return false;
    }
}

/**
 * Prompts user to select AI platforms for rule generation.
 *
 * @param isNonInteractive - Skip prompts and use saved/default
 * @returns Selected platforms, or empty array to skip
 */
async function promptForAiPlatforms(isNonInteractive: boolean): Promise<AiPlatform[]> {
    const savedPlatforms = getAiPlatforms();

    // Non-interactive: use saved preference or default to all
    if (isNonInteractive) {
        return savedPlatforms ?? ALL_AI_PLATFORMS;
    }

    // Has saved preference: confirm to use it
    if (savedPlatforms && savedPlatforms.length > 0) {
        const savedLabels = savedPlatforms.map((plat) => AI_PLATFORM_LABELS[plat]).join(', ');
        const useDefault = await p.confirm({
            message: `Add AI rules? ${color.dim(`(${savedLabels})`)}`,
            initialValue: true,
        });
        if (p.isCancel(useDefault)) {
            return [];
        }
        if (useDefault) {
            return savedPlatforms;
        }
        // User said no to saved preference, fall through to selection
    }

    // Multi-select platforms
    const selected = await p.multiselect({
        message: 'Add AI rules?',
        options: ALL_AI_PLATFORMS.map((platform) => ({
            value: platform,
            label: AI_PLATFORM_LABELS[platform],
            hint: AI_PLATFORM_HINTS[platform],
        })),
        initialValues: ['agents'],
        required: false,
    });

    if (p.isCancel(selected)) {
        return [];
    }

    const platforms = selected as AiPlatform[];

    if (platforms.length === 0) {
        return [];
    }

    return platforms;
}

/**
 * Writes generated files to disk.
 */
async function writeGeneratedFiles(basePath: string, files: Record<string, File>): Promise<void> {
    const filePaths = Object.keys(files).sort();

    for (const filePath of filePaths) {
        const fullFilePath = join(basePath, filePath);
        await mkdir(dirname(fullFilePath), { recursive: true });
        const file = files[filePath]!;

        if (file.type === 'text') {
            await writeFile(fullFilePath, file.content);
        } else {
            const response = await fetch(file.url);
            await writeFile(fullFilePath, response.body!);
        }
    }
}

/**
 * Calculates the relative path from a package directory back to the monorepo root.
 */
function calculateWorkspaceRoot(packagePath: string): string {
    const segments = packagePath.split(/[/\\]/).filter(Boolean);
    return segments.map(() => '..').join('/');
}

// =============================================================================
// Monorepo Detection & Parsing
// =============================================================================

/**
 * Detects if the current directory is inside a monorepo workspace.
 */
async function detectMonorepoRoot(): Promise<string | null> {
    let currentDir = cwd();
    const root = resolve('/');

    while (currentDir !== root) {
        const workspaceFile = join(currentDir, 'pnpm-workspace.yaml');
        try {
            await access(workspaceFile, constants.F_OK);
            const content = await readFile(workspaceFile, 'utf-8');
            if (content.includes('packages:')) {
                return currentDir;
            }
        } catch {
            // File doesn't exist, continue
        }
        currentDir = dirname(currentDir);
    }

    return null;
}

async function detectPackageRoot(): Promise<string | null> {
    let currentDir = cwd();
    const root = resolve('/');

    while (currentDir !== root) {
        if (await fileExists(join(currentDir, 'package.json'))) {
            return currentDir;
        }
        currentDir = dirname(currentDir);
    }

    return (await fileExists(join(root, 'package.json'))) ? root : null;
}

/**
 * Parses pnpm-workspace.yaml to extract workspace directories.
 */
async function parseWorkspaceDirectories(monorepoRoot: string): Promise<string[]> {
    try {
        const workspaceFile = join(monorepoRoot, 'pnpm-workspace.yaml');
        const content = await readFile(workspaceFile, 'utf-8');
        return parseWorkspaceYamlContent(content);
    } catch {
        return [];
    }
}

/**
 * Detects workspace-level settings from the monorepo root.
 * Uses standardized detection: scripts → .config/ directories → devDependencies
 */
async function detectWorkspaceSettings(monorepoRoot: string): Promise<InheritedWorkspaceSettings> {
    try {
        // Use standardized tooling detection
        const tooling = await detectTooling(monorepoRoot);

        const pkgPath = join(monorepoRoot, 'package.json');
        const content = await readFile(pkgPath, 'utf-8');
        const pkgJson = JSON.parse(content) as {
            packageManager?: string;
            engines?: Record<string, string>;
        };

        const packageManager = parsePackageManager(pkgJson.packageManager);
        const engine = parseEngine(pkgJson.engines);

        // Check pnpm-workspace.yaml for manage-package-manager-versions
        let pnpmManageVersions: boolean | undefined;
        try {
            const workspaceFile = join(monorepoRoot, 'pnpm-workspace.yaml');
            const workspaceContent = await readFile(workspaceFile, 'utf-8');
            pnpmManageVersions = workspaceContent.includes('manage-package-manager-versions: true');
        } catch {
            // pnpm-workspace.yaml doesn't exist or can't be read
        }

        return {
            linter: tooling.linter,
            formatter: tooling.formatter,
            packageManager,
            engine,
            pnpmManageVersions,
        };
    } catch {
        return {};
    }
}

/**
 * Detects existing root config files that may need migration.
 */
async function detectExistingConfigs(monorepoRoot: string): Promise<ExistingConfigs> {
    const configs: ExistingConfigs = {};

    const eslintPath = join(monorepoRoot, 'eslint.config.js');
    if (await fileExists(eslintPath)) {
        configs.linter = 'eslint';
        configs.eslintConfigPath = eslintPath;
    }

    const prettierPath = join(monorepoRoot, '.prettierrc.json');
    if (await fileExists(prettierPath)) {
        configs.formatter = 'prettier';
        configs.prettierConfigPath = prettierPath;
    }

    const biomePath = join(monorepoRoot, 'biome.json');
    if (await fileExists(biomePath)) {
        configs.biomeConfigPath = biomePath;
        if (!configs.linter) configs.linter = 'biome';
        if (!configs.formatter) configs.formatter = 'biome';
    }

    return configs;
}

/**
 * Gets the monorepo scope name from root package.json name field or directory name.
 */
async function getMonorepoScope(monorepoRoot: string): Promise<string> {
    try {
        const pkgPath = join(monorepoRoot, 'package.json');
        const content = await readFile(pkgPath, 'utf-8');
        const pkgJson = JSON.parse(content) as { name?: string };
        if (pkgJson.name) {
            return pkgJson.name.replace(/^@/, '').replace(/\/.*$/, '');
        }
    } catch {
        // Fall through to directory name
    }
    return monorepoRoot.split(/[/\\]/).pop() ?? 'workspace';
}

/**
 * Scans the packages/ directory for existing workspace package names.
 */
async function getWorkspacePackages(monorepoRoot: string): Promise<string[]> {
    const packagesDir = join(monorepoRoot, 'packages');

    try {
        const { readdir } = await import('fs/promises');
        const entries = await readdir(packagesDir, { withFileTypes: true });
        const names: string[] = [];

        for (const entry of entries) {
            if (!entry.isDirectory()) continue;
            try {
                const content = await readFile(
                    join(packagesDir, entry.name, 'package.json'),
                    'utf-8'
                );
                const pkg = JSON.parse(content) as { name?: string };
                if (pkg.name) names.push(pkg.name);
            } catch {
                // No package.json or invalid, skip
            }
        }

        return names;
    } catch {
        return [];
    }
}

/**
 * Ensures .config/* is in pnpm-workspace.yaml packages array.
 */
async function ensureConfigInWorkspace(monorepoRoot: string): Promise<void> {
    const workspacePath = join(monorepoRoot, 'pnpm-workspace.yaml');

    let content: string;
    try {
        content = await readFile(workspacePath, 'utf-8');
    } catch {
        content = `packages:
  - ".config/*"
  - "packages/*"
`;
        await writeFile(workspacePath, content);
        return;
    }

    if (content.includes('.config/*') || content.includes('".config/*"')) {
        return;
    }

    const lines = content.split('\n');
    const packagesIndex = lines.findIndex((line) => line.trim().startsWith('packages:'));

    if (packagesIndex === -1) {
        content = `packages:
  - ".config/*"
${content}`;
    } else {
        lines.splice(packagesIndex + 1, 0, '  - ".config/*"');
        content = lines.join('\n');
    }

    await writeFile(workspacePath, content);
}

// =============================================================================
// Config Migration
// =============================================================================

/**
 * Migrates an existing eslint.config.js to .config/eslint package.
 */
async function migrateEslintConfig(
    monorepoRoot: string,
    files: Record<string, { type: 'text'; content: string }>
): Promise<void> {
    const configBasePath = '.config/eslint';
    const existingConfigPath = join(monorepoRoot, 'eslint.config.js');

    let existingContent: string;
    try {
        existingContent = await readFile(existingConfigPath, 'utf-8');
    } catch {
        generateEslintConfigPackage(files);
        return;
    }

    files[`${configBasePath}/package.json`] = {
        type: 'text',
        content: JSON.stringify(
            {
                name: '@config/eslint',
                version: '0.1.0',
                private: true,
                type: 'module',
                exports: {
                    './base': './base.js',
                    './react': './react.js',
                },
            },
            null,
            2
        ),
    };

    files[`${configBasePath}/README.md`] = {
        type: 'text',
        content: `# \`@config/eslint\`

Shared ESLint configurations.

## Usage

In your package's \`eslint.config.js\`:

\`\`\`js
import base from "@config/eslint/base";

export default [...base];
\`\`\`

## Available Configs

- \`base\` - Base ESLint rules (migrated from root)
- \`react\` - React-specific rules
`,
    };

    files[`${configBasePath}/base.js`] = {
        type: 'text',
        content: existingContent,
    };

    files[`${configBasePath}/react.js`] = {
        type: 'text',
        content: `import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";

export default [
  {
    plugins: {
      react,
      "react-hooks": reactHooks,
    },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      "react/react-in-jsx-scope": "off",
    },
    settings: {
      react: {
        version: "detect",
      },
    },
  },
];
`,
    };
}

/**
 * Migrates an existing .prettierrc.json to .config/prettier package.
 */
async function migratePrettierConfig(
    monorepoRoot: string,
    files: Record<string, { type: 'text'; content: string }>
): Promise<void> {
    const configBasePath = '.config/prettier';
    const existingConfigPath = join(monorepoRoot, '.prettierrc.json');

    let existingContent: string;
    try {
        existingContent = await readFile(existingConfigPath, 'utf-8');
    } catch {
        generatePrettierConfigPackage(files);
        return;
    }

    files[`${configBasePath}/package.json`] = {
        type: 'text',
        content: JSON.stringify(
            {
                name: '@config/prettier',
                version: '0.1.0',
                private: true,
                exports: {
                    './base': './base.json',
                },
            },
            null,
            2
        ),
    };

    files[`${configBasePath}/README.md`] = {
        type: 'text',
        content: `# \`@config/prettier\`

Shared Prettier configurations.

## Usage

In your package's \`.prettierrc\`:

\`\`\`json
"@config/prettier/base"
\`\`\`

Or in \`package.json\`:

\`\`\`json
{
  "prettier": "@config/prettier/base"
}
\`\`\`

## Available Configs

- \`base\` - Base Prettier rules (migrated from root)
`,
    };

    files[`${configBasePath}/base.json`] = {
        type: 'text',
        content: existingContent,
    };
}

// =============================================================================
// Interactive Package Creation
// =============================================================================

/**
 * Creates a single package in a monorepo workspace.
 * Returns true if another package should be added, false otherwise.
 */
async function createPackageInWorkspace(
    monorepoRoot: string,
    packageManager: PackageManagerName,
    inheritedSettings: InheritedWorkspaceSettings,
    scope: string
): Promise<boolean> {
    const workspaceDirectories = await parseWorkspaceDirectories(monorepoRoot);
    const defaultDirectories = ['apps', 'packages'];
    const hasCustomDirectories =
        workspaceDirectories.length > 0 &&
        !workspaceDirectories.every((dir) => defaultDirectories.includes(dir));

    const packageType = await promptForInitialPackage();

    if (packageType === 'skip') {
        return false;
    }

    const defaultDir = packageType === 'app' ? 'apps' : 'packages';

    const packageNameInput = await p.text({
        message: 'Package name?',
        initialValue: `@${scope}/`,
        validate: (value) => {
            const validationError = validatePackageName(value);
            if (validationError) return validationError;

            // Extract directory name from package name (last part after @scope/ or full name)
            const dirName = value.includes('/') ? value.split('/').pop()! : value;
            if (!dirName) return 'Package name is required';

            if (!hasCustomDirectories) {
                const targetPath = join(monorepoRoot, defaultDir, dirName);
                try {
                    const { statSync } = require('fs');
                    statSync(targetPath);
                    return `Directory ${defaultDir}/${dirName} already exists`;
                } catch {
                    // Directory doesn't exist, which is what we want
                }
            }
        },
    });

    if (p.isCancel(packageNameInput)) {
        return false;
    }

    const scopedName = packageNameInput as string;
    // Extract directory name from package name (last part after @scope/ or full name)
    const shortName = scopedName.includes('/') ? scopedName.split('/').pop()! : scopedName;

    const packageOptions = await promptForPackageOptions(scopedName, packageType, inheritedSettings);

    let targetDir = defaultDir;
    if (hasCustomDirectories && workspaceDirectories.length > 0) {
        const dirChoice = await p.select({
            message: 'Target directory',
            options: workspaceDirectories.map((dir) => ({
                value: dir,
                label: dir,
            })),
            initialValue: workspaceDirectories.includes(defaultDir)
                ? defaultDir
                : workspaceDirectories[0],
        });

        if (p.isCancel(dirChoice)) {
            return false;
        }
        targetDir = dirChoice as string;

        const targetPath = join(monorepoRoot, targetDir, shortName);
        try {
            const { statSync } = require('fs');
            statSync(targetPath);
            p.log.error(`Directory ${targetDir}/${shortName} already exists`);
            return false;
        } catch {
            // Directory doesn't exist, which is what we want
        }
    }

    const relativePkgPath = join(targetDir, shortName);
    const workspaceRoot = calculateWorkspaceRoot(relativePkgPath);

    packageOptions.workspaceRoot = workspaceRoot;
    packageOptions.name = scopedName;

    packageOptions.packageManager = await resolvePackageManager(packageOptions);
    packageOptions.engine = await resolveEngine(packageOptions);
    packageOptions.versions = await resolveProjectPackageVersions(packageOptions);

    // For apps, prompt for workspace dependencies
    const workspacePackages = packageType === 'app' ? await getWorkspacePackages(monorepoRoot) : [];
    if (workspacePackages.length > 0) {
        const selectedDeps = await p.multiselect({
            message: 'Add workspace dependencies?',
            options: workspacePackages.map((name) => ({ value: name, label: name })),
            required: false,
        });

        if (!p.isCancel(selectedDeps) && selectedDeps.length > 0) {
            packageOptions.workspaceDependencies = selectedDeps as string[];
        }
    }

    const outputPath = join(monorepoRoot, relativePkgPath);
    const spinner = p.spinner();
    spinner.start('Creating package...');

    try {
        const files = generate(packageOptions);
        await writeGeneratedFiles(outputPath, files);

        spinner.stop(color.green.inverse(` ✓ Package created at ${relativePkgPath}! `));

        const addAnother = await p.select({
            message: 'Add another package?',
            options: [
                { value: 'no', label: "No, I'm done" },
                { value: 'yes', label: 'Yes, add another' },
            ],
            initialValue: 'no',
        });

        return !p.isCancel(addAnother) && addAnother === 'yes';
    } catch (error) {
        spinner.stop('Failed to create package');
        p.log.error(String(error));
        return false;
    }
}

/**
 * Shows editor prompt and opens project if selected.
 */
async function promptAndOpenEditor(projectPath: string): Promise<void> {
    const savedEditor = getPreferredEditor();
    let selectedEditor: EditorChoice | undefined;

    if (savedEditor && savedEditor !== 'skip') {
        const useDefault = await p.confirm({
            message: `Open in editor? ${color.dim(`(${editorNames[savedEditor]})`)}`,
            initialValue: true,
        });

        if (p.isCancel(useDefault)) {
            selectedEditor = undefined;
        } else if (useDefault) {
            selectedEditor = savedEditor;
        } else {
            selectedEditor = 'skip';
        }
    } else {
        const openEditor = await p.select({
            message: 'Open project in editor?',
            options: [
                { value: 'skip', label: 'Skip' },
                { value: 'cursor', label: 'Cursor' },
                { value: 'code', label: 'VS Code' },
                { value: 'webstorm', label: 'WebStorm' },
            ],
            initialValue: 'skip',
        });

        if (!p.isCancel(openEditor)) {
            selectedEditor = openEditor as EditorChoice;

            const saveChoice = await p.confirm({
                message: `Save ${editorNames[selectedEditor] ?? 'Skip'} as default editor?`,
                initialValue: true,
            });

            if (!p.isCancel(saveChoice) && saveChoice) {
                setPreferredEditor(selectedEditor);

                if (selectedEditor === 'cursor' || selectedEditor === 'code') {
                    const reuseChoice = await p.confirm({
                        message: 'Reuse current window when opening projects?',
                        initialValue: false,
                    });

                    if (!p.isCancel(reuseChoice)) {
                        setReuseWindow(reuseChoice);
                    }
                }
            }
        }
    }

    if (selectedEditor && selectedEditor !== 'skip') {
        try {
            await openInEditor(
                selectedEditor as 'cursor' | 'code' | 'webstorm',
                projectPath,
                getReuseWindow()
            );
            p.log.success(`Opening in ${editorNames[selectedEditor]}...`);
        } catch {
            p.log.warn(
                `Could not open ${editorNames[selectedEditor]}. Make sure the CLI command is in your PATH.`
            );
        }
    }
}

// =============================================================================
// Command Handlers
// =============================================================================

/**
 * Handles the --check command to validate a monorepo workspace.
 */
async function handleCheckCommand(): Promise<void> {
    const monorepoRoot = await detectMonorepoRoot();
    if (!monorepoRoot) {
        console.log(color.red('✗') + ' Not a monorepo workspace');
        process.exit(1);
    }
    const { valid, errors } = await validateWorkspace(monorepoRoot);
    if (valid) {
        console.log(color.green('✓') + ' Valid monorepo workspace');
        console.log(color.dim(`  ${monorepoRoot}`));
    } else {
        console.log(color.red('✗') + ' Invalid monorepo workspace');
        console.log(color.dim(`  ${monorepoRoot}`));
        for (const error of errors) {
            console.log(color.red(`  • ${error}`));
        }
    }
    process.exit(valid ? 0 : 1);
}

/**
 * Handles the --fix command to fix a monorepo workspace.
 */
async function handleFixCommand(options: CliOptions): Promise<void> {
    const monorepoRoot = await detectMonorepoRoot();
    if (!monorepoRoot) {
        console.log(color.red('✗') + ' Not a monorepo workspace');
        console.log(color.dim('  Run this command from within a monorepo'));
        process.exit(1);
    }

    const { valid, errors } = await validateWorkspace(monorepoRoot);
    if (valid) {
        console.log(color.green('✓') + ' Workspace is already valid');
        console.log(color.dim(`  ${monorepoRoot}`));
        process.exit(0);
    }

    console.log(color.yellow('!') + ' Invalid monorepo workspace');
    for (const error of errors) {
        console.log(color.dim(`  • ${error}`));
    }
    console.log();

    const tooling = await detectWorkspaceSettings(monorepoRoot);
    const existingConfigs = await detectExistingConfigs(monorepoRoot);
    const detectedLinter = tooling.linter ?? existingConfigs.linter ?? 'oxlint';
    const detectedFormatter = tooling.formatter ?? existingConfigs.formatter ?? 'prettier';

    const isNonInteractive = Boolean(options.linter && options.formatter);

    let linter: 'oxlint' | 'eslint' | 'biome';
    let formatter: 'oxfmt' | 'prettier' | 'biome';

    if (isNonInteractive) {
        linter = options.linter as 'oxlint' | 'eslint' | 'biome';
        formatter = options.formatter as 'oxfmt' | 'prettier' | 'biome';
    } else {
        const linterChoice = await p.select({
            message: 'Linter',
            options: [
                {
                    value: 'oxlint',
                    label: 'oxlint' + (tooling.linter === 'oxlint' ? color.dim(' (installed)') : ''),
                },
                {
                    value: 'eslint',
                    label:
                        'eslint' +
                        (tooling.linter === 'eslint' || existingConfigs.linter === 'eslint'
                            ? color.dim(' (installed)')
                            : ''),
                },
                {
                    value: 'biome',
                    label: 'biome' + (tooling.linter === 'biome' ? color.dim(' (installed)') : ''),
                },
            ],
            initialValue: detectedLinter,
        });

        if (p.isCancel(linterChoice)) {
            p.cancel('Operation cancelled.');
            process.exit(0);
        }

        const formatterChoice = await p.select({
            message: 'Formatter',
            options: [
                {
                    value: 'oxfmt',
                    label: 'oxfmt' + (tooling.formatter === 'oxfmt' ? color.dim(' (installed)') : ''),
                },
                {
                    value: 'prettier',
                    label:
                        'prettier' +
                        (tooling.formatter === 'prettier' || existingConfigs.formatter === 'prettier'
                            ? color.dim(' (installed)')
                            : ''),
                },
                {
                    value: 'biome',
                    label: 'biome' + (tooling.formatter === 'biome' ? color.dim(' (installed)') : ''),
                },
            ],
            initialValue: detectedFormatter,
        });

        if (p.isCancel(formatterChoice)) {
            p.cancel('Operation cancelled.');
            process.exit(0);
        }

        linter = linterChoice as 'oxlint' | 'eslint' | 'biome';
        formatter = formatterChoice as 'oxfmt' | 'prettier' | 'biome';
    }

    console.log();
    const spinner = p.spinner();
    spinner.start('Fixing workspace...');

    try {
        const files: Record<string, { type: 'text'; content: string }> = {};

        const tsConfigExists = await fileExists(
            join(monorepoRoot, '.config/typescript/package.json')
        );
        if (!tsConfigExists) {
            generateTypescriptConfigPackage(files);
        }

        if (linter === 'oxlint') {
            const oxlintExists = await fileExists(join(monorepoRoot, '.config/oxlint/package.json'));
            if (!oxlintExists) generateOxlintConfigPackage(files);
        } else if (linter === 'eslint') {
            const eslintPkgExists = await fileExists(
                join(monorepoRoot, '.config/eslint/package.json')
            );
            if (!eslintPkgExists) {
                if (existingConfigs.eslintConfigPath) {
                    await migrateEslintConfig(monorepoRoot, files);
                } else {
                    generateEslintConfigPackage(files);
                }
            }
        }

        if (formatter === 'oxfmt') {
            const oxfmtExists = await fileExists(join(monorepoRoot, '.config/oxfmt/package.json'));
            if (!oxfmtExists) generateOxfmtConfigPackage(files);
        } else if (formatter === 'prettier') {
            const prettierPkgExists = await fileExists(
                join(monorepoRoot, '.config/prettier/package.json')
            );
            if (!prettierPkgExists) {
                if (existingConfigs.prettierConfigPath) {
                    await migratePrettierConfig(monorepoRoot, files);
                } else {
                    generatePrettierConfigPackage(files);
                }
            }
        }

        // Biome uses root biome.json (not a .config package)
        if ((linter === 'biome' || formatter === 'biome') && !existingConfigs.biomeConfigPath) {
            const versions = await resolveMonorepoRootPackageVersions({
                linter,
                formatter,
            });
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
            files['biome.json'] = {
                type: 'text',
                content: JSON.stringify(biomeConfig, null, 2),
            };
        }

        for (const [filePath, file] of Object.entries(files)) {
            const fullPath = join(monorepoRoot, filePath);
            await mkdir(dirname(fullPath), { recursive: true });
            await writeFile(fullPath, file.content);
        }

        await ensureConfigInWorkspace(monorepoRoot);

        if (existingConfigs.eslintConfigPath && linter === 'eslint') {
            try {
                await unlink(existingConfigs.eslintConfigPath);
            } catch {}
        }
        if (existingConfigs.prettierConfigPath && formatter === 'prettier') {
            try {
                await unlink(existingConfigs.prettierConfigPath);
            } catch {}
        }

        spinner.stop(color.green('✓') + ' Workspace fixed!');

        const generated = Object.keys(files).filter((f) => f.endsWith('package.json'));
        for (const pkgFile of generated) {
            const pkgName = pkgFile.replace('/package.json', '');
            console.log(color.dim(`  Generated ${pkgName}`));
        }

        // VS Code files
        const vscodeSettingsExists = await fileExists(join(monorepoRoot, '.vscode/settings.json'));
        const vscodeExtensionsExists = await fileExists(
            join(monorepoRoot, '.vscode/extensions.json')
        );
        const vscodeExists = vscodeSettingsExists && vscodeExtensionsExists;

        if (!vscodeExists) {
            let addVscode = false;
            if (isNonInteractive) {
                addVscode = true;
            } else {
                const vscodeChoice = await p.confirm({
                    message: 'Generate VS Code settings?',
                    initialValue: true,
                });
                addVscode = !p.isCancel(vscodeChoice) && vscodeChoice;
            }

            if (addVscode) {
                const vscodeFiles: Record<string, { type: 'text'; content: string }> = {};
                generateVscodeFiles(vscodeFiles, linter, formatter);
                for (const [filePath, file] of Object.entries(vscodeFiles)) {
                    const fullPath = join(monorepoRoot, filePath);
                    await mkdir(dirname(fullPath), { recursive: true });
                    await writeFile(fullPath, file.content);
                }
                console.log(color.dim('  Generated .vscode/settings.json'));
                console.log(color.dim('  Generated .vscode/extensions.json'));
            }
        }

        // AI rules - check if .ai/ folder exists
        const aiRulesExist = await fileExists(join(monorepoRoot, '.ai/workspace.md'));

        if (!aiRulesExist) {
            const platforms = await promptForAiPlatforms(isNonInteractive);

            if (platforms.length > 0) {
                const scope = await getMonorepoScope(monorepoRoot);
                const aiFilesOutput: Record<string, { type: 'text'; content: string }> = {};
                generateAiFiles(aiFilesOutput, {
                    name: scope,
                    packageManager: 'pnpm',
                    linter,
                    formatter,
                    isMonorepo: true,
                    platforms,
                });
                for (const [filePath, file] of Object.entries(aiFilesOutput)) {
                    const fullPath = join(monorepoRoot, filePath);
                    await mkdir(dirname(fullPath), { recursive: true });
                    await writeFile(fullPath, file.content);
                    console.log(color.dim(`  Generated ${filePath}`));
                }
            }
        }

        process.exit(0);
    } catch (error) {
        spinner.stop(color.red('✗') + ' Failed to fix workspace');
        console.error(error);
        process.exit(1);
    }
}

/**
 * Handles migration from one linter/formatter to another.
 */
async function handleMigration(
    config: WorkspaceConfig,
    target: MigrationTarget,
    root: string,
    options: CliOptions
): Promise<void> {
    const plan = await getMigrationPlan(config, target, root);

    // Display migration summary
    console.log(color.cyan('Migration:'));
    if (plan.fromLinter !== plan.toLinter) {
        console.log(`  Linter: ${color.dim(plan.fromLinter)} → ${color.green(plan.toLinter)}`);
    }
    if (plan.fromFormatter !== plan.toFormatter) {
        console.log(
            `  Formatter: ${color.dim(plan.fromFormatter)} → ${color.green(plan.toFormatter)}`
        );
    }
    console.log();

    // Display changes
    console.log(color.cyan('Changes:'));
    for (const change of plan.changes) {
        console.log(formatMigrationChange(change));
    }

    if (plan.subPackageUpdates.length > 0) {
        console.log();
        console.log(color.cyan(`Sub-packages (${plan.subPackageUpdates.length}):`));
        for (const update of plan.subPackageUpdates) {
            const changes = [
                ...update.remove.map((d) => `-${d}`),
                ...update.add.map((d) => `+${d}`),
            ].join(', ');
            console.log(`  ~ ${update.path} (${changes})`);
        }
    }
    console.log();

    // Confirm
    if (!options.yes) {
        const confirm = await p.confirm({
            message: 'Apply migration?',
            initialValue: true,
        });

        if (p.isCancel(confirm) || !confirm) {
            console.log(color.dim('  Migration cancelled'));
            process.exit(0);
        }
    }

    // Apply migration
    await applyMigration(plan, root);

    // Update AI rules if they exist (they reference linter/formatter)
    const aiWorkspacePath = join(root, '.ai/workspace.md');
    const aiRulesExist = await fileExists(aiWorkspacePath);
    if (aiRulesExist) {
        console.log();
        console.log(color.cyan('Updating AI rules...'));

        const scope = await getMonorepoScope(root);
        // Detect which platforms already exist
        const existingPlatforms: AiPlatform[] = [];
        if (await fileExists(join(root, 'AGENTS.md'))) {
            existingPlatforms.push('agents');
        }
        if (await fileExists(join(root, 'CLAUDE.md'))) {
            existingPlatforms.push('claude');
        }

        const aiFilesOutput: Record<string, { type: 'text'; content: string }> = {};
        generateAiFiles(aiFilesOutput, {
            name: scope,
            packageManager: 'pnpm',
            linter: plan.toLinter,
            formatter: plan.toFormatter,
            isMonorepo: true,
            platforms: existingPlatforms.length > 0 ? existingPlatforms : ['agents'],
        });

        for (const [filePath, file] of Object.entries(aiFilesOutput)) {
            const fullPath = join(root, filePath);
            await mkdir(dirname(fullPath), { recursive: true });
            await writeFile(fullPath, file.content);
            console.log(color.dim(`  ${filePath}`));
        }
    }

    console.log();
    console.log(color.green('✓') + ` Migrated to ${plan.toLinter}/${plan.toFormatter}`);
    console.log(color.dim('  Run `pnpm install` to update dependencies'));
    process.exit(0);
}

/**
 * Handles the --update command to update a workspace or standalone project.
 */
async function handleUpdateCommand(options: CliOptions): Promise<void> {
    const monorepoRoot = await detectMonorepoRoot();
    const projectRoot = monorepoRoot ?? (await detectPackageRoot());
    if (!projectRoot) {
        console.log(color.red('✗') + ' Could not find a project root');
        console.log(color.dim('  Run this command from inside a generated project'));
        process.exit(1);
    }
    const isMonorepo = monorepoRoot != null;

    if (isMonorepo) {
        // Step 1: Validate workspace
        const { valid, errors } = await validateWorkspace(projectRoot);
        if (!valid) {
            console.log(color.yellow('!') + ' Workspace has issues:');
            for (const error of errors) {
                console.log(color.dim(`  • ${error}`));
            }
            console.log();

            const shouldFix =
                options.yes ||
                (await p.confirm({
                    message: 'Run fix first to resolve these issues?',
                    initialValue: true,
                }));

            if (p.isCancel(shouldFix) || !shouldFix) {
                console.log(color.dim('  Run `pnpm create krispya --fix` to fix manually'));
                process.exit(1);
            }

            // Detect config before fix so we can pass linter/formatter for non-interactive mode
            const preFixConfig = await detectCurrentConfig(projectRoot);

            // Run fix command with detected linter/formatter for non-interactive mode
            const fixOptions: CliOptions = {
                ...options,
                linter: options.linter ?? preFixConfig.linter,
                formatter: options.formatter ?? preFixConfig.formatter,
            };
            await handleFixCommand(fixOptions);
        }
    } else if (options.linter || options.formatter) {
        console.log(
            color.yellow('!') + ' Linter/formatter migrations in --update are currently monorepo-only'
        );
        console.log(color.dim('  Continuing with standalone shared config updates'));
        console.log();
    }

    // Step 2: Detect current configuration
    const config = await detectCurrentConfig(projectRoot, isMonorepo);

    // Step 3: Check for migration (if --linter or --formatter flags provided)
    const targetLinter = options.linter as Linter | undefined;
    const targetFormatter = options.formatter as Formatter | undefined;
    const migrationTarget = { linter: targetLinter, formatter: targetFormatter };

    if (isMonorepo && needsMigration(config, migrationTarget)) {
        await handleMigration(config, migrationTarget, projectRoot, options);
        return;
    }

    console.log(
        color.cyan('Checking for updates...') + color.dim(` (${config.linter}/${config.formatter})`)
    );
    console.log();

    // Step 4: Generate expected files and compare
    const expected = await generateExpectedFiles(config);
    const categories = await compareWithDisk(expected, projectRoot);

    const allCategories = categories.filter((c) => c.category !== 'workspace-config');
    if (isMonorepo) {
        // Step 4: Add workspace config updates (merge strategy)
        const workspaceConfigChanges = await getWorkspaceConfigUpdates(projectRoot);
        const workspaceCategory: CategoryUpdate = {
            category: 'workspace-config',
            label: 'Workspace Config',
            changes: workspaceConfigChanges,
            hasUserModifications: workspaceConfigChanges.some((c) => c.status === 'modified'),
        };

        // Insert after config-packages
        if (workspaceConfigChanges.length > 0) {
            const configPkgIndex = allCategories.findIndex((c) => c.category === 'config-packages');
            if (configPkgIndex !== -1) {
                allCategories.splice(configPkgIndex + 1, 0, workspaceCategory);
            } else {
                allCategories.push(workspaceCategory);
            }
        }
    }

    // Step 5: Process each category
    let updatedCount = 0;
    let skippedCount = 0;

    for (const category of allCategories) {
        const newChanges = category.changes.filter((c) => c.status === 'added');
        const modifiedChanges = category.changes.filter((c) => c.status === 'modified');
        const hasNew = newChanges.length > 0;
        const hasModified = modifiedChanges.length > 0;
        const hasChanges = hasNew || hasModified;

        if (!hasChanges) {
            console.log(color.green('✓') + ` ${category.label}: Up to date`);
            continue;
        }

        // Special handling for AI Files: prompt for yes/no
        if (category.category === 'ai-files') {
            if (hasNew) {
                console.log(color.cyan(category.label + ':'));
                console.log(color.dim(`  ${newChanges.length} AI file(s) can be added`));
                console.log();

                // In update mode, just ask yes/no to apply the determined changes
                const applyAi = options.yes
                    ? true
                    : await p.confirm({
                          message: 'Add AI rules?',
                          initialValue: true,
                      });

                if (!p.isCancel(applyAi) && applyAi) {
                    await applyUpdates(newChanges, projectRoot);
                    console.log(color.green('✓') + ` Added ${newChanges.length} AI file(s)`);
                    updatedCount++;
                } else {
                    console.log(color.dim(`  Skipped ${category.label}`));
                    skippedCount++;
                }
            }

            // Handle modified AI files separately (if any exist and changed)
            if (hasModified) {
                console.log(color.cyan('AI Files (existing):'));
                for (const change of modifiedChanges) {
                    console.log(formatFileChange(change));
                }
                console.log();

                // In --yes mode, skip updating existing AI files (safe default)
                if (options.yes) {
                    console.log(color.dim('  (--yes mode: keeping existing AI files)'));
                } else {
                    const updateExisting = await p.confirm({
                        message: 'Update existing AI files to latest template?',
                        initialValue: false,
                    });

                    if (!p.isCancel(updateExisting) && updateExisting) {
                        await applyUpdates(modifiedChanges, projectRoot);
                        console.log(color.green('✓') + ' Updated existing AI files');
                    }
                }
            }
            console.log();
            continue;
        }

        // Determine action based on what changes exist
        let changesToApply: typeof category.changes = [];

        if (options.yes) {
            // Show changes for --yes mode
            console.log(color.cyan(category.label + ':'));
            for (const change of [...newChanges, ...modifiedChanges]) {
                console.log(formatFileChange(change));
            }
            console.log();

            // Non-interactive: add new only (safe default)
            // Exception: workspace-config uses merge strategy, so "modified" is safe
            if (category.category === 'workspace-config') {
                changesToApply = [...newChanges, ...modifiedChanges];
                if (changesToApply.length > 0) {
                    console.log(color.dim('  (--yes mode: applying merge updates)'));
                }
            } else {
                changesToApply = newChanges;
                if (newChanges.length > 0) {
                    console.log(color.dim('  (--yes mode: adding new files only)'));
                }
            }
        } else if (hasNew && hasModified) {
            // Both new and modified: multiselect with individual files
            // New files pre-selected, modified files not selected by default
            const allChanges = [...newChanges, ...modifiedChanges];
            const selectedFiles = await p.multiselect({
                message: `${category.label} (+ new, ~ changed)`,
                options: allChanges.map((change) => ({
                    value: change.path,
                    label: change.status === 'added' ? `+ ${change.path}` : `~ ${change.path}`,
                })),
                initialValues: newChanges.map((c) => c.path), // Pre-select new files
                required: false,
            });

            if (p.isCancel(selectedFiles)) {
                p.cancel('Operation cancelled.');
                process.exit(0);
            }

            if (selectedFiles.length > 0) {
                changesToApply = allChanges.filter((c) => selectedFiles.includes(c.path));
            }
        } else if (hasNew) {
            // Only new files: show list then confirm
            console.log(color.cyan(category.label + ':'));
            for (const change of newChanges) {
                console.log(formatFileChange(change));
            }
            console.log();
            // Only new files: simple confirm
            const shouldAdd = await p.confirm({
                message: `Add ${newChanges.length} new file(s)?`,
                initialValue: true,
            });

            if (p.isCancel(shouldAdd)) {
                p.cancel('Operation cancelled.');
                process.exit(0);
            }

            if (shouldAdd) {
                changesToApply = newChanges;
            }
        } else if (hasModified) {
            // Only modified files: show list then confirm with warning
            console.log(color.cyan(category.label + ':'));
            for (const change of modifiedChanges) {
                console.log(formatFileChange(change));
            }
            console.log();

            const shouldUpdate = await p.confirm({
                message: `Update ${modifiedChanges.length} file(s)? (will overwrite)`,
                initialValue: false,
            });

            if (p.isCancel(shouldUpdate)) {
                p.cancel('Operation cancelled.');
                process.exit(0);
            }

            if (shouldUpdate) {
                changesToApply = modifiedChanges;
            }
        }

        if (changesToApply.length > 0) {
            await applyUpdates(changesToApply, projectRoot);
            const addedCount = changesToApply.filter((c) => c.status === 'added').length;
            const updatedFilesCount = changesToApply.filter((c) => c.status === 'modified').length;
            const parts = [];
            if (addedCount > 0) parts.push(`added ${addedCount}`);
            if (updatedFilesCount > 0) parts.push(`updated ${updatedFilesCount}`);
            console.log(color.green('✓') + ` ${category.label}: ${parts.join(', ')}`);
            updatedCount++;
        } else {
            console.log(color.dim(`  Skipped ${category.label}`));
            skippedCount++;
        }
        console.log();
    }

    // Summary
    if (updatedCount === 0 && skippedCount === 0) {
        console.log(color.green('✓') + ' Everything is up to date!');
    } else if (updatedCount > 0) {
        console.log(
            color.green('✓') +
                ` Updated ${updatedCount} ${updatedCount === 1 ? 'category' : 'categories'}`
        );
        if (skippedCount > 0) {
            console.log(color.dim(`  Skipped ${skippedCount}`));
        }
    }

    process.exit(0);
}

/**
 * Handles the --workspace command for non-interactive package creation in a monorepo.
 */
async function handleWorkspaceCommand(name: string, options: CliOptions): Promise<void> {
    const monorepoRoot = await detectMonorepoRoot();
    if (!monorepoRoot) {
        console.error(color.red('Error:') + ' --workspace flag requires being inside a monorepo');
        process.exit(1);
    }

    if (!name) {
        console.error(color.red('Error:') + ' Package name is required with --workspace flag');
        console.log(color.dim('  Example: pnpm create krispya my-lib --workspace --type library'));
        process.exit(1);
    }

    const scope = await getMonorepoScope(monorepoRoot);
    const inheritedSettings = await detectWorkspaceSettings(monorepoRoot);
    const projectType: ProjectType = options.type ?? 'app';
    const defaultDir = projectType === 'library' ? 'packages' : 'apps';
    const targetDir = options.dir ?? defaultDir;
    const template: Template = options.template ?? 'vanilla';
    const baseTemplate = getBaseTemplate(template);

    const scopedName = name.startsWith('@') ? name : `@${scope}/${name}`;

    // Check if directory already exists
    const fullPackagePath = join(monorepoRoot, targetDir, name);
    try {
        await access(fullPackagePath, constants.F_OK);
        console.error(color.red('Error:') + ` Directory ${targetDir}/${name} already exists`);
        process.exit(1);
    } catch {
        // Directory doesn't exist, which is what we want
    }

    const linter = inheritedSettings.linter ?? options.linter ?? 'oxlint';
    const formatter = inheritedSettings.formatter ?? options.formatter ?? 'prettier';
    const packageManager = inheritedSettings.packageManager?.name ?? 'pnpm';
    const engine = inheritedSettings.engine ?? {
        name: 'node',
        version: 'latest',
    };
    const pnpmManageVersions = inheritedSettings.pnpmManageVersions ?? true;
    const isLibrary = projectType === 'library';

    const relativePkgPath = join(targetDir, name);
    const workspaceRoot = calculateWorkspaceRoot(relativePkgPath);

    const generateOptions: GenerateOptions = {
        name: scopedName,
        projectType,
        libraryBundler: isLibrary ? (options.bundler ?? 'unbuild') : undefined,
        template,
        linter,
        formatter,
        packageManager: { name: packageManager },
        engine,
        pnpmManageVersions,
        workspaceRoot,
        ...(baseTemplate === 'r3f' && {
            drei: options.drei ? {} : undefined,
            handle: options.handle ? {} : undefined,
            leva: options.leva ? {} : undefined,
            postprocessing: options.postprocessing ? {} : undefined,
            rapier: options.rapier ? {} : undefined,
            xr: options.xr ? {} : undefined,
            uikit: options.uikit ? {} : undefined,
            offscreen: options.offscreen ? {} : undefined,
            zustand: options.zustand ? {} : undefined,
            koota: options.koota ? {} : undefined,
            viverse: options.viverse ? {} : undefined,
            triplex: options.triplex ? {} : undefined,
        }),
    };

    generateOptions.packageManager = await resolvePackageManager(generateOptions);
    generateOptions.engine = await resolveEngine(generateOptions);
    generateOptions.versions = await resolveProjectPackageVersions(generateOptions);

    console.log(color.cyan('Creating') + ` ${scopedName} in ${targetDir}/${name}...`);

    try {
        const files = generate(generateOptions);
        await writeGeneratedFiles(fullPackagePath, files);

        console.log(color.green('✓') + ` Created ${scopedName} at ${targetDir}/${name}`);
        process.exit(0);
    } catch (error) {
        console.error(color.red('Error:') + ' Failed to create package');
        console.error(String(error));
        process.exit(1);
    }
}

/**
 * Handles monorepo creation.
 */
async function handleMonorepoCreation(
    generateOptions: GenerateOptions,
    isNonInteractive: boolean
): Promise<void> {
    const { generateMonorepo } = await import('./generators/monorepo.js');

    const packageManager = getPackageManagerName(generateOptions.packageManager);
    generateOptions.packageManager = await resolvePackageManager(generateOptions);
    generateOptions.engine = await resolveEngine(generateOptions);
    generateOptions.versions = await resolveMonorepoRootPackageVersions({
        linter: generateOptions.linter ?? 'oxlint',
        formatter: generateOptions.formatter ?? 'prettier',
        versions: generateOptions.versions,
    });

    // Prompt for AI platforms
    const aiPlatforms = await promptForAiPlatforms(isNonInteractive);

    const projectPath = join(cwd(), generateOptions.name);
    const spinner = p.spinner();
    spinner.start('Creating monorepo workspace...');

    try {
        const { files } = generateMonorepo({
            name: generateOptions.name,
            linter: generateOptions.linter ?? 'oxlint',
            formatter: generateOptions.formatter ?? 'prettier',
            packageManager: generateOptions.packageManager ?? {
                name: packageManager,
            },
            pnpmManageVersions: generateOptions.pnpmManageVersions,
            engine: generateOptions.engine,
            versions: generateOptions.versions,
            aiPlatforms: aiPlatforms.length > 0 ? aiPlatforms : undefined,
        });

        const filePaths = Object.keys(files).sort();
        for (const filePath of filePaths) {
            const fullFilePath = join(projectPath, filePath);
            await mkdir(dirname(fullFilePath), { recursive: true });
            const file = files[filePath]!;

            if (file.type === 'text') {
                await writeFile(fullFilePath, file.content);
            }
        }

        spinner.stop(color.green.inverse(' ✓ Monorepo workspace created! '));

        // In non-interactive mode, just create the workspace and exit
        if (isNonInteractive) {
            process.exit(0);
        }

        const newWorkspaceSettings: InheritedWorkspaceSettings = {
            linter: generateOptions.linter,
            formatter: generateOptions.formatter,
            packageManager: generateOptions.packageManager ?? {
                name: packageManager,
            },
            engine: generateOptions.engine,
            pnpmManageVersions: generateOptions.pnpmManageVersions,
        };

        const scope = generateOptions.name;

        let addMore = true;
        while (addMore) {
            addMore = await createPackageInWorkspace(
                projectPath,
                packageManager,
                newWorkspaceSettings,
                scope
            );
        }

        const nextSteps = [
            `cd ${generateOptions.name}`,
            `${packageManager} install`,
            `${packageManager} run dev`,
        ].join('\n');

        p.note(nextSteps, 'Next steps');

        await promptAndOpenEditor(projectPath);

        p.outro(color.green('Happy coding! ✨'));
        process.exit(0);
    } catch (error) {
        spinner.stop('Failed to create monorepo workspace');
        p.log.error(String(error));
        process.exit(1);
    }
}

/**
 * Handles standalone project creation (app or library).
 */
async function handleStandaloneProjectCreation(
    generateOptions: GenerateOptions,
    isNonInteractive: boolean
): Promise<void> {
    const base = generateOptions.template ? getBaseTemplate(generateOptions.template) : 'vanilla';

    const defaultFallbackName =
        base === 'vanilla' ? 'vanilla-app' : base === 'react' ? 'react-app' : 'react-three-app';

    generateOptions.name ??= defaultFallbackName;

    // Prompt for AI platforms
    const aiPlatforms = await promptForAiPlatforms(isNonInteractive);
    if (aiPlatforms.length > 0) {
        generateOptions.aiPlatforms = aiPlatforms;
    }

    /**
     * Resolve: All of the user's settings are resolved into one options object
     * with the latest package versions from NPM.
     */
    const packageManager = getPackageManagerName(generateOptions.packageManager);
    const isLibrary = generateOptions.projectType === 'library';

    generateOptions.packageManager = await resolvePackageManager(generateOptions);
    generateOptions.engine = await resolveEngine(generateOptions);
    generateOptions.versions = await resolveProjectPackageVersions(generateOptions);

    /**
     * Render: Create files from the resolved options
     */
    const projectPath = join(cwd(), generateOptions.name);
    const spinner = p.spinner();
    spinner.start('Creating project...');

    try {
        const files = generate(generateOptions);
        await writeGeneratedFiles(projectPath, files);

        spinner.stop(color.green.inverse(' ✓ Project created! '));

        // In non-interactive mode, just exit
        if (isNonInteractive) process.exit(0);

        const nextSteps = isLibrary
            ? [
                  `cd ${generateOptions.name}`,
                  `${packageManager} install`,
                  `${packageManager} run build`,
              ].join('\n')
            : [
                  `cd ${generateOptions.name}`,
                  `${packageManager} install`,
                  `${packageManager} run dev`,
              ].join('\n');

        p.note(nextSteps, 'Next steps');

        await promptAndOpenEditor(projectPath);

        p.outro(color.green('Happy coding! ✨'));
    } catch (error) {
        spinner.stop('Failed to create project');
        p.log.error(String(error));
        process.exit(1);
    }
}

/**
 * Handles interactive mode when inside a monorepo.
 */
async function handleInteractiveMonorepoMode(monorepoRoot: string): Promise<void> {
    const choice = await p.select({
        message: 'Detected monorepo workspace',
        options: [
            { value: 'add', label: 'Add new package to this workspace' },
            { value: 'standalone', label: 'Create standalone project' },
        ],
        initialValue: 'add',
    });

    if (p.isCancel(choice)) {
        p.cancel('Operation cancelled.');
        process.exit(0);
    }

    if (choice === 'add') {
        const inheritedSettings = await detectWorkspaceSettings(monorepoRoot);
        const hasSettings = Object.values(inheritedSettings).some(Boolean);
        if (hasSettings) {
            const settingsInfo = [
                inheritedSettings.linter && `linter: ${inheritedSettings.linter}`,
                inheritedSettings.formatter && `formatter: ${inheritedSettings.formatter}`,
                inheritedSettings.packageManager && `pm: ${inheritedSettings.packageManager.name}`,
            ]
                .filter(Boolean)
                .join(', ');
            p.log.info(`Using workspace settings (${settingsInfo})`);
        }

        const scope = await getMonorepoScope(monorepoRoot);

        let addMore = true;
        while (addMore) {
            addMore = await createPackageInWorkspace(
                monorepoRoot,
                inheritedSettings.packageManager?.name ?? 'pnpm',
                inheritedSettings,
                scope
            );
        }

        p.note([`cd ${monorepoRoot}`, 'pnpm install', 'pnpm run dev'].join('\n'), 'Next steps');

        await promptAndOpenEditor(monorepoRoot);

        p.outro(color.green('Happy coding! ✨'));
        process.exit(0);
    }
    // If standalone, return to continue with normal flow
}

// =============================================================================
// Main Entry Point
// =============================================================================

async function main() {
    const program = new Command()
        .name('create-krispya')
        .description('CLI for creating Vanilla, React, and React Three Fiber projects')
        .argument('[name]', 'name for the project')
        .option('--type <type>', 'project type: app or library (default: app)')
        .option(
            '--bundler <bundler>',
            'library bundler: unbuild or tsdown (default: unbuild, only for libraries)'
        )
        .option(
            '--template <type>',
            'project template: vanilla, vanilla-js, react, react-js, r3f, r3f-js (default: vanilla)'
        )
        .option('--linter <type>', 'linter: eslint, oxlint, or biome (default: oxlint)')
        .option('--formatter <type>', 'formatter: prettier, oxfmt, or biome (default: prettier)')
        .option('--drei', 'add @react-three/drei (r3f only)')
        .option('--handle', 'add @react-three/handle (r3f only)')
        .option('--leva', 'add leva (r3f only)')
        .option('--postprocessing', 'add @react-three/postprocessing (r3f only)')
        .option('--rapier', 'add @react-three/rapier (r3f only)')
        .option('--xr', 'add @react-three/xr (r3f only)')
        .option('--uikit', 'add @react-three/uikit (r3f only)')
        .option('--offscreen', 'add @react-three/offscreen (r3f only)')
        .option('--zustand', 'add zustand (r3f only)')
        .option('--koota', 'add koota (r3f only)')
        .option('--triplex', 'set up triplex development environment (r3f only)')
        .option('--viverse', 'set up viverse deployment (r3f only)')
        .option('--package-manager <manager>', 'specify package manager (e.g. npm, yarn, pnpm)')
        .option(
            '--pnpm-manage-versions',
            'enable manage-package-manager-versions in pnpm-workspace.yaml (default: true)'
        )
        .option(
            '--no-pnpm-manage-versions',
            'disable manage-package-manager-versions in pnpm-workspace.yaml'
        )
        .option(
            '--node-version <version>',
            'set Node.js version for engines.node field (default: "latest")'
        )
        .option('--workspace', 'Add package to current monorepo workspace (non-interactive)')
        .option('--dir <directory>', 'Target directory for --workspace (default: apps/ or packages/)')
        .option('--clear-config', 'Clear saved preferences (e.g. editor choice)')
        .option('--config-path', 'Print the path to the config file')
        .option('--check', 'Check if current directory is in a valid monorepo workspace')
        .option('--fix', 'Fix monorepo by generating missing .config packages')
        .option('--update', 'Update monorepo workspace to latest configuration')
        .option('-y, --yes', 'Non-interactive mode - accept all prompts')
        .option(
            '--path <directory>',
            'Run in specified directory instead of current working directory'
        )
        .action(async (name: string | undefined, options: CliOptions) => {
            // Change working directory if --path is provided
            if (options.path) {
                process.chdir(options.path);
            }

            // Short-circuit: config management flags exit immediately
            if (options.clearConfig) {
                clearConfig();
                console.log('Configuration cleared.');
                process.exit(0);
            }

            if (options.configPath) {
                console.log(getConfigPath());
                process.exit(0);
            }

            // Handle flags that may have been parsed as the name argument
            if (name?.startsWith('-')) {
                switch (name) {
                    case '--version':
                    case '-V':
                        console.log(pkg.version);
                        process.exit(0);
                    case '--help':
                    case '-h':
                        program.help();
                        break;
                    case '--clear-config':
                        clearConfig();
                        console.log('Configuration cleared.');
                        process.exit(0);
                    case '--config-path':
                        console.log(getConfigPath());
                        process.exit(0);
                    case '--check':
                        await handleCheckCommand();
                        break;
                    case '--fix':
                        options.fix = true;
                        break;
                    case '--update':
                        options.update = true;
                        break;
                    case '--yes':
                        options.yes = true;
                        break;
                    default:
                        console.error(color.red(`Unknown option: ${name}`));
                        process.exit(1);
                }
            }

            // Handle --check flag
            if (options.check) {
                await handleCheckCommand();
            }

            // Handle --fix flag
            if (options.fix) {
                await handleFixCommand(options);
            }

            // Handle --update flag
            if (options.update) {
                await handleUpdateCommand(options);
            }

            // Validate --dir requires --workspace
            if (options.dir && !options.workspace) {
                console.error(color.red('Error:') + ' --dir requires --workspace flag');
                console.log(
                    color.dim('  Example: pnpm create krispya my-lib --workspace --dir examples')
                );
                process.exit(1);
            }

            // Handle --workspace flag
            if (options.workspace) {
                await handleWorkspaceCommand(name!, options);
            }

            // Interactive mode starts here
            console.clear();
            p.intro(color.bgCyan(color.black(` create-krispya v${pkg.version} `)));

            // Check if we're inside a monorepo workspace (only if no config options provided)
            const monorepoRoot = await detectMonorepoRoot();
            if (monorepoRoot && !hasConfigOptions(options)) {
                await handleInteractiveMonorepoMode(monorepoRoot);
            }

            // Get generate options
            let generateOptions: GenerateOptions;

            // Non-interactive mode: --yes flag skips all prompts
            if (options.yes) {
                const template: Template = options.template ?? 'vanilla';
                const baseTemplate = getBaseTemplate(template);
                const defaultName = getDefaultProjectName(template);
                const projectType: ProjectType = options.type ?? 'app';

                generateOptions = {
                    name: name || defaultName,
                    projectType,
                    libraryBundler:
                        projectType === 'library' ? (options.bundler ?? 'unbuild') : undefined,
                    template,
                    linter: options.linter ?? 'oxlint',
                    formatter: options.formatter ?? 'prettier',
                    ...(baseTemplate === 'r3f' && {
                        drei: options.drei ? {} : undefined,
                        handle: options.handle ? {} : undefined,
                        leva: options.leva ? {} : undefined,
                        postprocessing: options.postprocessing ? {} : undefined,
                        rapier: options.rapier ? {} : undefined,
                        xr: options.xr ? {} : undefined,
                        uikit: options.uikit ? {} : undefined,
                        offscreen: options.offscreen ? {} : undefined,
                        zustand: options.zustand ? {} : undefined,
                        koota: options.koota ? {} : undefined,
                        viverse: options.viverse ? {} : undefined,
                        triplex: options.triplex ? {} : undefined,
                    }),
                    packageManager: options.packageManager
                        ? { name: options.packageManager }
                        : undefined,
                    pnpmManageVersions: options.pnpmManageVersions,
                    engine: { name: 'node', version: options.nodeVersion ?? 'latest' },
                };
            } else {
                // Interactive mode: build presets from CLI flags to pre-fill prompts
                const presets: CliPresets | undefined = hasConfigOptions(options)
                    ? {
                          type: options.type,
                          template: options.template,
                          bundler: options.bundler,
                          linter: options.linter,
                          formatter: options.formatter,
                          packageManager: options.packageManager,
                          engine: options.nodeVersion
                              ? { name: 'node', version: options.nodeVersion }
                              : undefined,
                          pnpmManageVersions: options.pnpmManageVersions,
                          drei: options.drei,
                          handle: options.handle,
                          leva: options.leva,
                          postprocessing: options.postprocessing,
                          rapier: options.rapier,
                          xr: options.xr,
                          uikit: options.uikit,
                          offscreen: options.offscreen,
                          zustand: options.zustand,
                          koota: options.koota,
                          triplex: options.triplex,
                          viverse: options.viverse,
                      }
                    : undefined;

                generateOptions = await promptForOptions(name, presets);
            }

            // Route to appropriate handler
            const isNonInteractive = options.yes ?? false;
            if (generateOptions.projectType === 'monorepo') {
                await handleMonorepoCreation(generateOptions, isNonInteractive);
            } else {
                await handleStandaloneProjectCreation(generateOptions, isNonInteractive);
            }
        });

    await program.parseAsync();
}

main().catch(console.error);
