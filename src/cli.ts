#!/usr/bin/env node

import * as p from '@clack/prompts';
import color from 'chalk';
import { Command } from 'commander';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { cwd } from 'node:process';
import { fetch } from 'undici';

import type { Ide, PackageManagerName } from './types.js';

import { getDefaultProjectName, promptForOptions, type CliPresets } from './cli/index.js';
import { promptForAiAgentPlatforms } from './cli/ai.js';
import { handleCheckCommand } from './cli/check.js';
import { handleFixCommand } from './cli/fix.js';
import { handleUpdateCommand } from './cli/update.js';
import {
  createPackageInWorkspace,
  handleInteractiveMonorepoMode,
  handleWorkspaceCommand,
} from './cli/workspace.js';
import { detectMonorepoRoot, type InheritedWorkspaceSettings } from './cli/workspace-utils.js';
import { clearConfig, getConfigPath } from './config.js';
import {
  getBaseTemplate,
  planProject,
  resolveProjectPlanInput,
  planWorkspace,
  resolveWorkspacePlanInput,
  type VirtualFile,
  type ProjectOptions,
  type LibraryBundler,
  type ProjectType,
  type Template,
} from './index.js';
import { getPackageManagerName } from './package-versions.js';

const require = createRequire(import.meta.url);
const pkg = require('../package.json') as { version: string };

// =============================================================================
// Types
// =============================================================================

export interface CliOptions {
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
  ide?: Ide;
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

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Writes generated files to disk.
 */
async function writeGeneratedFiles(
  basePath: string,
  files: Record<string, VirtualFile>
): Promise<void> {
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
 * Handles monorepo creation.
 */
async function handleMonorepoCreation(
  projectOptions: ProjectOptions,
  isNonInteractive: boolean
): Promise<void> {
  const packageManager = getPackageManagerName(projectOptions.packageManager);
  const projectPath = join(cwd(), projectOptions.name);
  const spinner = p.spinner();
  spinner.start('Creating monorepo workspace...');

  try {
    const planInput = resolveWorkspacePlanInput({
      name: projectOptions.name,
      linter: projectOptions.linter ?? 'oxlint',
      formatter: projectOptions.formatter ?? 'prettier',
      packageManager: projectOptions.packageManager ?? {
        name: packageManager,
      },
      pnpmManageVersions: projectOptions.pnpmManageVersions,
      engine: projectOptions.engine,
      versions: projectOptions.versions,
      aiPlatforms: projectOptions.aiPlatforms,
      ide: projectOptions.ide ?? 'vscode',
    });

    const { files } = await planWorkspace(planInput);

    await writeGeneratedFiles(projectPath, files);

    spinner.stop(color.green.inverse(' ✓ Monorepo workspace created! '));

    // In non-interactive mode, just create the workspace and exit
    if (isNonInteractive) {
      process.exit(0);
    }

    const newWorkspaceSettings: InheritedWorkspaceSettings = {
      linter: projectOptions.linter,
      formatter: projectOptions.formatter,
      packageManager: projectOptions.packageManager ?? {
        name: packageManager,
      },
      engine: projectOptions.engine,
      pnpmManageVersions: projectOptions.pnpmManageVersions,
    };

    const scope = projectOptions.name;

    let addMore = true;
    while (addMore) {
      addMore = await createPackageInWorkspace(
        projectPath,
        packageManager,
        newWorkspaceSettings,
        scope,
        writeGeneratedFiles
      );
    }

    const nextSteps = [
      `cd ${projectOptions.name}`,
      `${packageManager} install`,
      `${packageManager} run dev`,
    ].join('\n');

    p.note(nextSteps, 'Next steps');

    p.outro(color.green('Happy coding! ✨'));
    process.exit(0);
  } catch (error) {
    spinner.stop('Failed to create monorepo workspace');
    p.log.error(String(error));
    process.exit(1);
  }
}

/**
 * Handles single-package workspace creation.
 */
async function handleSingleWorkspaceCreation(
  projectOptions: ProjectOptions,
  isNonInteractive: boolean
): Promise<void> {
  const base = projectOptions.template ? getBaseTemplate(projectOptions.template) : 'vanilla';
  const defaultFallbackName =
    base === 'vanilla' ? 'vanilla-app' : base === 'react' ? 'react-app' : 'react-three-app';
  projectOptions.name ??= defaultFallbackName;
  const packageManager = getPackageManagerName(projectOptions.packageManager);

  /**
   * Render: Create files from the resolved options
   */
  const projectPath = join(cwd(), projectOptions.name);
  const spinner = p.spinner();

  spinner.start('Creating project...');

  try {
    const planInput = resolveProjectPlanInput(projectOptions);
    const { files } = await planProject(planInput);
    await writeGeneratedFiles(projectPath, files);

    spinner.stop(color.green.inverse(' ✓ Project created! '));

    // In non-interactive mode, just exit
    if (isNonInteractive) process.exit(0);

    const nextSteps =
      projectOptions.projectType === 'library'
        ? [
            `cd ${projectOptions.name}`,
            `${packageManager} install`,
            `${packageManager} run build`,
          ].join('\n')
        : [
            `cd ${projectOptions.name}`,
            `${packageManager} install`,
            `${packageManager} run dev`,
          ].join('\n');

    p.note(nextSteps, 'Next steps');

    p.outro(color.green('Happy coding! ✨'));
  } catch (error) {
    spinner.stop('Failed to create project');
    p.log.error(String(error));
    process.exit(1);
  }
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
    .option('--ide <ide>', 'IDE files: vscode or none (default: vscode)')
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
    .option('--clear-config', 'Clear saved preferences')
    .option('--config-path', 'Print the path to the config file')
    .option('--check', 'Check if current directory is in a valid monorepo workspace')
    .option('--fix', 'Fix monorepo by generating missing .config packages')
    .option('--update', 'Update monorepo workspace to latest configuration')
    .option('-y, --yes', 'Non-interactive mode - accept all prompts')
    .option('--path <directory>', 'Run in specified directory instead of current working directory')
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

      if (options.ide && !['vscode', 'none'].includes(options.ide)) {
        console.error(color.red('Error:') + ' --ide must be "vscode" or "none"');
        process.exit(1);
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
        await handleUpdateCommand(options, handleFixCommand);
      }

      // Validate --dir requires --workspace
      if (options.dir && !options.workspace) {
        console.error(color.red('Error:') + ' --dir requires --workspace flag');
        console.log(color.dim('  Example: pnpm create krispya my-lib --workspace --dir examples'));
        process.exit(1);
      }

      // Handle --workspace flag
      if (options.workspace) {
        await handleWorkspaceCommand(name!, options, writeGeneratedFiles);
      }

      // Interactive mode starts here
      console.clear();
      p.intro(color.bgCyan(color.black(` create-krispya v${pkg.version} `)));

      // Check if we're inside a monorepo workspace (only if no config options provided)
      const monorepoRoot = await detectMonorepoRoot();
      if (monorepoRoot && !hasConfigOptions(options)) {
        await handleInteractiveMonorepoMode(monorepoRoot, writeGeneratedFiles);
      }

      // Get generate options
      let projectOptions: ProjectOptions;

      // Non-interactive mode: --yes flag skips all prompts
      if (options.yes) {
        const template: Template = options.template ?? 'vanilla';
        const baseTemplate = getBaseTemplate(template);
        const defaultName = getDefaultProjectName(template);
        const projectType: ProjectType = options.type ?? 'app';

        projectOptions = {
          name: name || defaultName,
          projectType,
          libraryBundler: projectType === 'library' ? (options.bundler ?? 'unbuild') : undefined,
          template,
          linter: options.linter ?? 'oxlint',
          formatter: options.formatter ?? 'prettier',
          ide: options.ide ?? 'vscode',
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
          packageManager: options.packageManager ? { name: options.packageManager } : undefined,
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
              ide: options.ide,
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

        projectOptions = await promptForOptions(name, presets);
      }

      // Route to appropriate handler
      const isNonInteractive = options.yes ?? false;
      const aiAgentPlatforms = await promptForAiAgentPlatforms(isNonInteractive);
      if (aiAgentPlatforms.length > 0) {
        projectOptions.aiPlatforms = aiAgentPlatforms;
      }

      if (projectOptions.projectType === 'monorepo') {
        await handleMonorepoCreation(projectOptions, isNonInteractive);
      } else {
        await handleSingleWorkspaceCreation(projectOptions, isNonInteractive);
      }
    });

  await program.parseAsync();
}

main().catch(console.error);
