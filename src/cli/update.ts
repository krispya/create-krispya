import * as p from '@clack/prompts';
import color from 'chalk';
import { spawn } from 'node:child_process';

import {
  applyUpdates,
  compareWithDisk,
  detectCurrentConfig,
  formatFileChange,
  getPackageManagerConfigUpdates,
  getOxlintConfigReplacementUpdates,
  getPackageJsonScriptUpdates,
  planExpectedFiles,
  getWorkspaceConfigUpdates,
  type CategoryUpdate,
  type FileChange,
  type UpdateCategory,
  type WorkspaceConfig,
} from './update-core.js';
import { validateWorkspace } from '../validation/index.js';
import type { CliOptions } from '../cli.js';
import { detectMonorepoRoot, detectPackageRoot } from './workspace-utils.js';
import {
  formatPackageManager,
  getPackageManagerProfile,
  parsePackageManagerSpec,
  resolvePackageManager,
} from '../package-managers/index.js';
import type { PackageManagerSpec } from '../types.js';
import { compareNumericSemver, getSemverMajor } from '../utils/index.js';

type FixCommand = (options: CliOptions) => Promise<void>;
type PackageUpdateCommand = {
  command: string;
  args: string[];
  displayCommand: string;
  promptMessage: string;
  successMessage: string;
  failureLabel: string;
};

const UPDATE_CATEGORY_ORDER = [
  'root-config',
  'config-packages',
  'tooling-config',
  'workspace-config',
  'vscode',
  'package-json',
  'ai-files',
  'ai-files-install',
  'ai-files-update',
] satisfies UpdateCategory[];

function isMergeUpdateCategory(category: CategoryUpdate['category']): boolean {
  return category === 'workspace-config' || category === 'package-json';
}

function getUpdateHint(category: CategoryUpdate['category'], status: 'added' | 'modified'): string {
  if (status === 'added') return 'new file';
  if (category === 'package-json') return 'merge update';
  if (category === 'workspace-config') return 'merge update';
  return 'changed; overwrites if selected';
}

type SelectableFileChange = FileChange & { status: 'added' | 'modified' };

function isSelectableFileChange(change: FileChange): change is SelectableFileChange {
  return change.status === 'added' || change.status === 'modified';
}

function getInitialUpdateSelections(category: CategoryUpdate): string[] {
  return category.changes
    .filter(
      (change) =>
        change.status === 'added' ||
        (change.status === 'modified' && isMergeUpdateCategory(category.category))
    )
    .map((change) => change.path);
}

async function promptForUpdateSelections(category: CategoryUpdate) {
  const selectableChanges = category.changes.filter(isSelectableFileChange);
  const selectedFiles = await p.multiselect({
    message: category.label,
    options: selectableChanges.map((change) => ({
      value: change.path,
      label: change.path,
      hint: getUpdateHint(category.category, change.status),
    })),
    initialValues: getInitialUpdateSelections(category),
    required: false,
  });

  if (p.isCancel(selectedFiles)) {
    p.cancel('Operation cancelled.');
    process.exit(0);
  }

  return selectableChanges.filter((change) => selectedFiles.includes(change.path));
}

async function promptForAiFileInstall(category: CategoryUpdate): Promise<FileChange[]> {
  const newChanges = category.changes.filter((change) => change.status === 'added');
  const fileList = newChanges.map((change) => change.path).join(', ');
  const shouldInstall = await p.confirm({
    message: fileList ? `Install more AI files? (${fileList})` : 'Install more AI files?',
    initialValue: true,
  });

  if (p.isCancel(shouldInstall)) {
    p.cancel('Operation cancelled.');
    process.exit(0);
  }

  return shouldInstall ? newChanges : [];
}

function getCategoryOrder(category: UpdateCategory): number {
  const index = UPDATE_CATEGORY_ORDER.indexOf(category);
  return index === -1 ? UPDATE_CATEGORY_ORDER.length : index;
}

function orderUpdateCategories(categories: CategoryUpdate[]): CategoryUpdate[] {
  return [...categories].sort(
    (left, right) => getCategoryOrder(left.category) - getCategoryOrder(right.category)
  );
}

function isPnpmMajorMigration(config: WorkspaceConfig): boolean {
  const currentPackageManager = config.packageManagerSpec;
  const targetPackageManager = config.targetPackageManagerSpec;
  if (currentPackageManager?.name !== 'pnpm' || targetPackageManager?.name !== 'pnpm') {
    return false;
  }

  const currentMajor = getSemverMajor(currentPackageManager.version);
  const targetMajor = getSemverMajor(targetPackageManager.version);
  return currentMajor != null && targetMajor != null && currentMajor !== targetMajor;
}

export function getPackageUpdateCommand(config: WorkspaceConfig): PackageUpdateCommand | undefined {
  const packageManagerName = config.packageManager.split('@')[0] ?? config.packageManager;
  if (packageManagerName === 'pnpm') {
    if (isPnpmMajorMigration(config)) {
      return {
        command: 'pnpm',
        args: ['install'],
        displayCommand: 'pnpm install',
        promptMessage: 'Install dependencies?',
        successMessage: 'Dependencies installed',
        failureLabel: 'Dependency install',
      };
    }

    return {
      command: 'pnpm',
      args: ['update'],
      displayCommand: 'pnpm update',
      promptMessage: 'Update packages?',
      successMessage: 'Packages updated',
      failureLabel: 'Package update',
    };
  }

  if (packageManagerName === 'npm') {
    return {
      command: 'npm',
      args: ['update'],
      displayCommand: 'npm update',
      promptMessage: 'Update packages?',
      successMessage: 'Packages updated',
      failureLabel: 'Package update',
    };
  }

  return undefined;
}

async function runPackageUpdate(
  projectRoot: string,
  updateCommand: PackageUpdateCommand
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(updateCommand.command, updateCommand.args, {
      cwd: projectRoot,
      shell: process.platform === 'win32',
      stdio: 'inherit',
    });

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${updateCommand.displayCommand} exited with code ${code ?? 'unknown'}`));
    });
  });
}

async function promptForPackageUpdate(
  projectRoot: string,
  config: WorkspaceConfig,
  options: CliOptions
): Promise<void> {
  const updateCommand = getPackageUpdateCommand(config);
  if (!updateCommand) {
    console.log(color.dim(`  Package updates are not supported for ${config.packageManager}`));
    return;
  }

  const shouldUpdatePackages =
    options.yes ||
    (await p.confirm({
      message: updateCommand.promptMessage,
      initialValue: true,
    }));

  if (p.isCancel(shouldUpdatePackages)) {
    p.cancel('Operation cancelled.');
    process.exit(0);
  }

  if (!shouldUpdatePackages) {
    console.log(color.dim('  Skipped package updates'));
    return;
  }

  console.log();
  console.log(color.cyan(`Running ${updateCommand.displayCommand}...`));
  try {
    await runPackageUpdate(projectRoot, updateCommand);
    console.log(color.green('✓') + ` ${updateCommand.successMessage}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(color.red('✗') + ` ${updateCommand.failureLabel} failed: ${message}`);
    process.exit(1);
  }
}

async function collectUpdateCategories(
  projectRoot: string,
  config: WorkspaceConfig,
  isMonorepo: boolean
): Promise<CategoryUpdate[]> {
  const expected = await planExpectedFiles(config);
  const categories = await compareWithDisk(expected, projectRoot);

  const allCategories = categories.filter((category) => category.category !== 'workspace-config');
  const packageJsonScriptChanges = await getPackageJsonScriptUpdates(projectRoot, config);
  if (packageJsonScriptChanges.length > 0) {
    allCategories.push({
      category: 'package-json',
      label: 'package.json',
      changes: packageJsonScriptChanges,
      hasUserModifications: packageJsonScriptChanges.some((change) => change.status === 'modified'),
    });
  }

  const oxlintConfigChanges = await getOxlintConfigReplacementUpdates(projectRoot, config);
  if (oxlintConfigChanges.length > 0) {
    allCategories.push({
      category: 'tooling-config',
      label: 'Tooling Config',
      changes: oxlintConfigChanges,
      hasUserModifications: oxlintConfigChanges.some((change) => change.status === 'modified'),
    });
  }

  if (isMonorepo) {
    const workspaceConfigChanges = await getWorkspaceConfigUpdates(projectRoot, config);
    if (workspaceConfigChanges.length > 0) {
      allCategories.push({
        category: 'workspace-config',
        label: 'Workspace Config',
        changes: workspaceConfigChanges,
        hasUserModifications: workspaceConfigChanges.some((change) => change.status === 'modified'),
      });
    }
  }

  return orderUpdateCategories(allCategories);
}

async function resolveTargetPackageManagerSpec(
  options: CliOptions,
  config: WorkspaceConfig
): Promise<PackageManagerSpec | undefined> {
  if (options.packageManager == null) return undefined;

  const packageManager = parsePackageManagerSpec(options.packageManager);
  if (packageManager == null) {
    console.log(color.red('✗') + ` Unsupported package manager: ${options.packageManager}`);
    process.exit(1);
  }

  return resolvePackageManager({
    name: config.name,
    packageManager,
  });
}

export function getPackageManagerMajorUpdateTarget(
  currentPackageManager: PackageManagerSpec | undefined,
  latestPackageManager: PackageManagerSpec
): PackageManagerSpec | undefined {
  if (currentPackageManager?.version == null) return undefined;

  const currentMajor = getSemverMajor(currentPackageManager.version);
  const latestMajor = getSemverMajor(latestPackageManager.version);
  if (currentMajor == null || latestMajor == null || latestMajor <= currentMajor) {
    return undefined;
  }

  return latestPackageManager;
}

export function getRequiredNodeUpdateTarget(
  currentNodeVersion: string | undefined,
  requiredNodeVersion: string | undefined
): string | undefined {
  if (requiredNodeVersion == null) return undefined;
  if (currentNodeVersion == null) return requiredNodeVersion;
  return compareNumericSemver(currentNodeVersion, requiredNodeVersion) < 0
    ? requiredNodeVersion
    : undefined;
}

function formatPackageManagerMajor(packageManager: PackageManagerSpec): string {
  const major = getSemverMajor(packageManager.version);
  return major == null ? packageManager.name : `${packageManager.name}@${major}`;
}

async function promptForNodeRequirementUpdate(
  options: CliOptions,
  config: WorkspaceConfig,
  targetPackageManagerSpec: PackageManagerSpec | undefined
): Promise<string | undefined> {
  if (targetPackageManagerSpec == null) return undefined;

  const profile = getPackageManagerProfile(targetPackageManagerSpec);
  const requiredNodeVersion = profile.requirements.node;
  const currentNodeVersion = config.engine?.version;
  const targetNodeVersion = getRequiredNodeUpdateTarget(currentNodeVersion, requiredNodeVersion);
  if (targetNodeVersion == null) return undefined;

  const currentNodeLabel = currentNodeVersion == null ? 'not set' : `>=${currentNodeVersion}`;
  p.log.warn(
    `${formatPackageManager(targetPackageManagerSpec)} requires Node >=${targetNodeVersion}; current engines.node is ${currentNodeLabel}.`
  );

  const shouldUpdate =
    options.yes ||
    (await p.confirm({
      message: `Update engines.node to >=${targetNodeVersion} too?`,
      initialValue: true,
    }));

  if (p.isCancel(shouldUpdate)) {
    p.cancel('Operation cancelled.');
    process.exit(0);
  }

  return shouldUpdate ? targetNodeVersion : undefined;
}

async function promptForPackageManagerMajorUpdate(
  options: CliOptions,
  config: WorkspaceConfig
): Promise<PackageManagerSpec | undefined> {
  if (options.packageManager != null || config.packageManagerSpec == null) return undefined;

  const currentPackageManager = config.packageManagerSpec;
  if (currentPackageManager.version == null) return undefined;

  const latestPackageManager = await resolvePackageManager({
    name: config.name,
    packageManager: { name: currentPackageManager.name },
  });

  const updateTarget = getPackageManagerMajorUpdateTarget(
    currentPackageManager,
    latestPackageManager
  );
  if (updateTarget == null) return undefined;

  const shouldUpdate =
    options.yes ||
    (await p.confirm({
      message: `Update ${currentPackageManager.name} from ${formatPackageManagerMajor(
        currentPackageManager
      )} to ${formatPackageManagerMajor(latestPackageManager)}?`,
      initialValue: true,
    }));

  if (p.isCancel(shouldUpdate)) {
    p.cancel('Operation cancelled.');
    process.exit(0);
  }

  return shouldUpdate ? updateTarget : undefined;
}

async function applyPackageManagerMigration(
  projectRoot: string,
  isMonorepo: boolean,
  options: CliOptions,
  detectedConfig: WorkspaceConfig
): Promise<WorkspaceConfig> {
  const targetPackageManagerSpec =
    (await resolveTargetPackageManagerSpec(options, detectedConfig)) ??
    (await promptForPackageManagerMajorUpdate(options, detectedConfig));
  if (targetPackageManagerSpec == null) return detectedConfig;

  const targetNodeVersion = await promptForNodeRequirementUpdate(
    options,
    detectedConfig,
    targetPackageManagerSpec
  );
  const migrationConfig: WorkspaceConfig = {
    ...detectedConfig,
    packageManager: targetPackageManagerSpec.name,
    targetPackageManagerSpec,
    targetNodeVersion,
  };

  const changes = [
    ...(await getPackageManagerConfigUpdates(projectRoot, migrationConfig)),
    ...(isMonorepo || targetPackageManagerSpec.name === 'pnpm'
      ? await getWorkspaceConfigUpdates(projectRoot, migrationConfig)
      : []),
  ].filter((change) => change.status === 'added' || change.status === 'modified');

  if (changes.length === 0) return migrationConfig;

  console.log();
  console.log(color.cyan('Package Manager:'));
  for (const change of changes) {
    console.log(formatFileChange(change));
  }

  await applyUpdates(changes, projectRoot);
  console.log(color.green('✓') + ` Package Manager: updated ${changes.length}`);

  return migrationConfig;
}

async function processUpdateCategory(
  category: CategoryUpdate,
  projectRoot: string,
  options: CliOptions
): Promise<'updated' | 'skipped' | 'unchanged'> {
  const newChanges = category.changes.filter((change) => change.status === 'added');
  const modifiedChanges = category.changes.filter((change) => change.status === 'modified');
  const hasNew = newChanges.length > 0;
  const hasModified = modifiedChanges.length > 0;
  const hasChanges = hasNew || hasModified;

  if (!hasChanges) {
    console.log(color.green('✓') + ` ${category.label}: Up to date`);
    return 'unchanged';
  }

  let changesToApply: FileChange[] = [];

  if (options.yes) {
    console.log(color.cyan(`${category.label}:`));
    for (const change of [...newChanges, ...modifiedChanges]) {
      console.log(formatFileChange(change));
    }
    console.log();

    if (isMergeUpdateCategory(category.category)) {
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
  } else {
    changesToApply =
      category.category === 'ai-files-install'
        ? await promptForAiFileInstall(category)
        : await promptForUpdateSelections(category);
  }

  if (changesToApply.length > 0) {
    await applyUpdates(changesToApply, projectRoot);
    const addedCount = changesToApply.filter((change) => change.status === 'added').length;
    const updatedFilesCount = changesToApply.filter((change) => change.status === 'modified').length;
    const parts = [];
    if (addedCount > 0) parts.push(`added ${addedCount}`);
    if (updatedFilesCount > 0) parts.push(`updated ${updatedFilesCount}`);
    console.log(color.green('✓') + ` ${category.label}: ${parts.join(', ')}`);
    return 'updated';
  }

  return 'skipped';
}

export async function handleUpdateCommand(
  options: CliOptions,
  handleFixCommand: FixCommand
): Promise<void> {
  const monorepoRoot = await detectMonorepoRoot();
  const projectRoot = monorepoRoot ?? (await detectPackageRoot());
  if (!projectRoot) {
    console.log(color.red('✗') + ' Could not find a project root');
    console.log(color.dim('  Run this command from inside a generated project'));
    process.exit(1);
  }
  const isMonorepo = monorepoRoot != null;

  if (isMonorepo) {
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

      const preFixConfig = await detectCurrentConfig(projectRoot);
      await handleFixCommand({
        ...options,
        linter: options.linter ?? preFixConfig.linter,
        formatter: options.formatter ?? preFixConfig.formatter,
      });
    }
  }

  const config = await detectCurrentConfig(projectRoot, isMonorepo);
  if (options.linter || options.formatter) {
    console.log(
      color.yellow('!') +
        ' Linter/formatter migration is not part of --update in this architecture pass'
    );
    console.log(color.dim('  Continuing with updates for the detected current tooling'));
    console.log();
  }

  console.log(
    color.cyan('Checking for updates...') + color.dim(` (${config.linter}/${config.formatter})`)
  );
  console.log();

  const categories = await collectUpdateCategories(projectRoot, config, isMonorepo);
  let updatedCount = 0;
  let skippedCount = 0;

  for (const category of categories) {
    const result = await processUpdateCategory(category, projectRoot, options);
    if (result === 'updated') updatedCount++;
    if (result === 'skipped') skippedCount++;
  }

  if (updatedCount === 0 && skippedCount === 0) {
    console.log(color.green('✓') + ' Everything is up to date!');
  } else if (updatedCount > 0) {
    console.log(
      color.green('✓') + ` Updated ${updatedCount} ${updatedCount === 1 ? 'category' : 'categories'}`
    );
    if (skippedCount > 0) {
      console.log(color.dim(`  Skipped ${skippedCount}`));
    }
  }

  const finalConfig = await applyPackageManagerMigration(projectRoot, isMonorepo, options, config);

  await promptForPackageUpdate(projectRoot, finalConfig, options);

  process.exit(0);
}
