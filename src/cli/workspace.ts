import * as p from '@clack/prompts';
import color from 'chalk';
import { DEFAULT_LIBRARY_BUNDLER } from '../library-bundlers.js';
import { constants } from 'node:fs';
import { access } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';

import { promptForInitialPackage, promptForPackageOptions } from './index.js';
import {
  calculateWorkspaceRoot,
  detectMonorepoRoot,
  detectWorkspaceSettings,
  getMonorepoScope,
  getWorkspacePackages,
  parseWorkspaceDirectories,
  type InheritedWorkspaceSettings,
} from './workspace-utils.js';
import {
  getBaseTemplate,
  getPackageDirectoryName,
  planProject,
  resolveProjectPlanInput,
  validatePackageName,
  type VirtualFile,
  type ProjectOptions,
  type ProjectType,
  type Template,
} from '../index.js';
import type { PackageManagerName } from '../types.js';
import type { CliOptions } from '../cli.js';

const require = createRequire(import.meta.url);

type WriteGeneratedFiles = (basePath: string, files: Record<string, VirtualFile>) => Promise<void>;

export async function createPackageInWorkspace(
  monorepoRoot: string,
  packageManager: PackageManagerName,
  inheritedSettings: InheritedWorkspaceSettings,
  scope: string,
  writeGeneratedFiles: WriteGeneratedFiles
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
      const packageName = value ?? '';
      const validationError = validatePackageName(packageName);
      if (validationError) return validationError;

      const dirName = getPackageDirectoryName(packageName);
      if (!dirName) return 'Package name is required';

      if (!hasCustomDirectories) {
        const targetPath = join(monorepoRoot, defaultDir, dirName);
        try {
          const { statSync } = require('fs');
          statSync(targetPath);
          return `Directory ${defaultDir}/${dirName} already exists`;
        } catch {
          // Directory doesn't exist, which is what we want.
        }
      }
    },
  });

  if (p.isCancel(packageNameInput)) {
    return false;
  }

  const scopedName = packageNameInput as string;
  const shortName = getPackageDirectoryName(scopedName);

  const packageOptions = await promptForPackageOptions(scopedName, packageType, inheritedSettings);

  let targetDir = defaultDir;
  if (hasCustomDirectories && workspaceDirectories.length > 0) {
    const dirChoice = await p.select({
      message: 'Target directory',
      options: workspaceDirectories.map((dir) => ({
        value: dir,
        label: dir,
      })),
      initialValue: workspaceDirectories.includes(defaultDir) ? defaultDir : workspaceDirectories[0],
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
      // Directory doesn't exist, which is what we want.
    }
  }

  const relativePkgPath = join(targetDir, shortName);
  const workspaceRoot = calculateWorkspaceRoot(relativePkgPath);

  packageOptions.workspaceRoot = workspaceRoot;
  packageOptions.name = scopedName;

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
    const { files } = await planProject(resolveProjectPlanInput(packageOptions));
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

export async function handleWorkspaceCommand(
  name: string,
  options: CliOptions,
  writeGeneratedFiles: WriteGeneratedFiles
): Promise<void> {
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
  const packageDirName = getPackageDirectoryName(name);

  const fullPackagePath = join(monorepoRoot, targetDir, packageDirName);
  try {
    await access(fullPackagePath, constants.F_OK);
    console.error(color.red('Error:') + ` Directory ${targetDir}/${packageDirName} already exists`);
    process.exit(1);
  } catch {
    // Directory doesn't exist, which is what we want.
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

  const relativePkgPath = join(targetDir, packageDirName);
  const workspaceRoot = calculateWorkspaceRoot(relativePkgPath);

  const projectOptions: ProjectOptions = {
    name: scopedName,
    projectType,
    libraryBundler: isLibrary ? (options.bundler ?? DEFAULT_LIBRARY_BUNDLER) : undefined,
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

  console.log(color.cyan('Creating') + ` ${scopedName} in ${targetDir}/${packageDirName}...`);

  try {
    const { files } = await planProject(resolveProjectPlanInput(projectOptions));
    await writeGeneratedFiles(fullPackagePath, files);

    console.log(color.green('✓') + ` Created ${scopedName} at ${targetDir}/${packageDirName}`);
    process.exit(0);
  } catch (error) {
    console.error(color.red('Error:') + ' Failed to create package');
    console.error(String(error));
    process.exit(1);
  }
}

export async function handleInteractiveMonorepoMode(
  monorepoRoot: string,
  writeGeneratedFiles: WriteGeneratedFiles
): Promise<void> {
  const choice = await p.select({
    message: 'Detected monorepo workspace',
    options: [
      { value: 'add', label: 'Add new package to this workspace' },
      { value: 'standalone', label: 'Create single-package workspace' },
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
        scope,
        writeGeneratedFiles
      );
    }

    p.note([`cd ${monorepoRoot}`, 'pnpm install', 'pnpm run dev'].join('\n'), 'Next steps');

    p.outro(color.green('Happy coding! ✨'));
    process.exit(0);
  }
}
