import * as p from '@clack/prompts';
import color from 'chalk';
import { constants } from 'node:fs';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { cwd } from 'node:process';

import { generateAiFiles } from '../generators/ai-files.js';
import type { AiPlatform, Linter, Formatter } from '../types.js';
import {
    applyMigration,
    applyUpdates,
    compareWithDisk,
    detectCurrentConfig,
    formatFileChange,
    formatMigrationChange,
    generateExpectedFiles,
    getMigrationPlan,
    getPackageJsonScriptUpdates,
    getWorkspaceConfigUpdates,
    needsMigration,
    type CategoryUpdate,
    type FileChange,
    type MigrationTarget,
    type UpdateCategory,
    type WorkspaceConfig,
} from '../update.js';
import { validateWorkspace } from '../validate.js';
import type { CliOptions } from '../cli.js';

type FixCommand = (options: CliOptions) => Promise<void>;

const UPDATE_CATEGORY_ORDER = [
    'root-config',
    'config-packages',
    'workspace-config',
    'vscode',
    'package-json',
    'ai-files',
] satisfies UpdateCategory[];

async function fileExists(path: string): Promise<boolean> {
    try {
        await access(path, constants.F_OK);
        return true;
    } catch {
        return false;
    }
}

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
            // File doesn't exist, continue.
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

async function getMonorepoScope(monorepoRoot: string): Promise<string> {
    try {
        const pkgPath = join(monorepoRoot, 'package.json');
        const content = await readFile(pkgPath, 'utf-8');
        const pkgJson = JSON.parse(content) as { name?: string };
        if (pkgJson.name) {
            return pkgJson.name.replace(/^@/, '').replace(/\/.*$/, '');
        }
    } catch {
        // Fall through to directory name.
    }
    return monorepoRoot.split(/[/\\]/).pop() ?? 'workspace';
}

function isMergeUpdateCategory(category: CategoryUpdate['category']): boolean {
    return category === 'workspace-config' || category === 'package-json';
}

function getUpdateHint(category: CategoryUpdate['category'], status: 'added' | 'modified'): string {
    if (status === 'added') return 'new file';
    if (category === 'package-json') return 'scripts-only merge';
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

function getCategoryOrder(category: UpdateCategory): number {
    const index = UPDATE_CATEGORY_ORDER.indexOf(category);
    return index === -1 ? UPDATE_CATEGORY_ORDER.length : index;
}

function orderUpdateCategories(categories: CategoryUpdate[]): CategoryUpdate[] {
    return [...categories].sort(
        (left, right) => getCategoryOrder(left.category) - getCategoryOrder(right.category)
    );
}

async function collectUpdateCategories(
    projectRoot: string,
    config: WorkspaceConfig,
    isMonorepo: boolean
): Promise<CategoryUpdate[]> {
    const expected = await generateExpectedFiles(config);
    const categories = await compareWithDisk(expected, projectRoot);

    const allCategories = categories.filter((category) => category.category !== 'workspace-config');
    const packageJsonScriptChanges = await getPackageJsonScriptUpdates(projectRoot, config);
    if (packageJsonScriptChanges.length > 0) {
        allCategories.push({
            category: 'package-json',
            label: 'package.json Scripts',
            changes: packageJsonScriptChanges,
            hasUserModifications: packageJsonScriptChanges.some(
                (change) => change.status === 'modified'
            ),
        });
    }

    if (isMonorepo) {
        const workspaceConfigChanges = await getWorkspaceConfigUpdates(projectRoot);
        if (workspaceConfigChanges.length > 0) {
            allCategories.push({
                category: 'workspace-config',
                label: 'Workspace Config',
                changes: workspaceConfigChanges,
                hasUserModifications: workspaceConfigChanges.some(
                    (change) => change.status === 'modified'
                ),
            });
        }
    }

    return orderUpdateCategories(allCategories);
}

async function handleMigration(
    config: WorkspaceConfig,
    target: MigrationTarget,
    root: string,
    options: CliOptions
): Promise<void> {
    const plan = await getMigrationPlan(config, target, root);

    console.log(color.cyan('Migration:'));
    if (plan.fromLinter !== plan.toLinter) {
        console.log(`  Linter: ${color.dim(plan.fromLinter)} -> ${color.green(plan.toLinter)}`);
    }
    if (plan.fromFormatter !== plan.toFormatter) {
        console.log(
            `  Formatter: ${color.dim(plan.fromFormatter)} -> ${color.green(plan.toFormatter)}`
        );
    }
    console.log();

    console.log(color.cyan('Changes:'));
    for (const change of plan.changes) {
        console.log(formatMigrationChange(change));
    }

    if (plan.subPackageUpdates.length > 0) {
        console.log();
        console.log(color.cyan(`Sub-packages (${plan.subPackageUpdates.length}):`));
        for (const update of plan.subPackageUpdates) {
            const changes = [
                ...update.remove.map((dependency) => `-${dependency}`),
                ...update.add.map((dependency) => `+${dependency}`),
            ].join(', ');
            console.log(`  ~ ${update.path} (${changes})`);
        }
    }
    console.log();

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

    await applyMigration(plan, root);

    const aiWorkspacePath = join(root, '.ai/workspace.md');
    const aiRulesExist = await fileExists(aiWorkspacePath);
    if (aiRulesExist) {
        console.log();
        console.log(color.cyan('Updating AI rules...'));

        const scope = await getMonorepoScope(root);
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
        changesToApply = await promptForUpdateSelections(category);
    }

    if (changesToApply.length > 0) {
        await applyUpdates(changesToApply, projectRoot);
        const addedCount = changesToApply.filter((change) => change.status === 'added').length;
        const updatedFilesCount = changesToApply.filter(
            (change) => change.status === 'modified'
        ).length;
        const parts = [];
        if (addedCount > 0) parts.push(`added ${addedCount}`);
        if (updatedFilesCount > 0) parts.push(`updated ${updatedFilesCount}`);
        console.log(color.green('✓') + ` ${category.label}: ${parts.join(', ')}`);
        console.log();
        return 'updated';
    }

    console.log(color.dim(`  Skipped ${category.label}`));
    console.log();
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
    } else if (options.linter || options.formatter) {
        console.log(
            color.yellow('!') + ' Linter/formatter migrations in --update are currently monorepo-only'
        );
        console.log(color.dim('  Continuing with standalone shared config updates'));
        console.log();
    }

    const config = await detectCurrentConfig(projectRoot, isMonorepo);
    const migrationTarget = {
        linter: options.linter as Linter | undefined,
        formatter: options.formatter as Formatter | undefined,
    };

    if (isMonorepo && needsMigration(config, migrationTarget)) {
        await handleMigration(config, migrationTarget, projectRoot, options);
        return;
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
            color.green('✓') +
                ` Updated ${updatedCount} ${updatedCount === 1 ? 'category' : 'categories'}`
        );
        if (skippedCount > 0) {
            console.log(color.dim(`  Skipped ${skippedCount}`));
        }
    }

    process.exit(0);
}
