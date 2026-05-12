import * as p from '@clack/prompts';
import color from 'chalk';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { renderAiFiles } from '../renderers/ai-files.js';
import {
    renderEslintConfigPackage,
    renderOxfmtConfigPackage,
    renderOxlintConfigPackage,
    renderPrettierConfigPackage,
    renderTypescriptConfigPackage,
    renderVscodeFiles,
} from '../renderers/monorepo.js';
import {
    getResolvedPackageVersion,
    resolveMonorepoRootPackageVersions,
} from '../package-versions.js';
import { validateWorkspace } from '../validate.js';
import type { CliOptions } from '../cli.js';
import { promptForAiAgentPlatforms } from './ai.js';
import {
    detectExistingConfigs,
    detectMonorepoRoot,
    detectWorkspaceSettings,
    ensureConfigInWorkspace,
    fileExists,
    getMonorepoScope,
} from './workspace-utils.js';

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
        renderEslintConfigPackage(files);
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
        renderPrettierConfigPackage(files);
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

export async function handleFixCommand(options: CliOptions): Promise<void> {
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
            renderTypescriptConfigPackage(files);
        }

        if (linter === 'oxlint') {
            const oxlintExists = await fileExists(join(monorepoRoot, '.config/oxlint/package.json'));
            if (!oxlintExists) renderOxlintConfigPackage(files);
        } else if (linter === 'eslint') {
            const eslintPkgExists = await fileExists(
                join(monorepoRoot, '.config/eslint/package.json')
            );
            if (!eslintPkgExists) {
                if (existingConfigs.eslintConfigPath) {
                    await migrateEslintConfig(monorepoRoot, files);
                } else {
                    renderEslintConfigPackage(files);
                }
            }
        }

        if (formatter === 'oxfmt') {
            const oxfmtExists = await fileExists(join(monorepoRoot, '.config/oxfmt/package.json'));
            if (!oxfmtExists) renderOxfmtConfigPackage(files);
        } else if (formatter === 'prettier') {
            const prettierPkgExists = await fileExists(
                join(monorepoRoot, '.config/prettier/package.json')
            );
            if (!prettierPkgExists) {
                if (existingConfigs.prettierConfigPath) {
                    await migratePrettierConfig(monorepoRoot, files);
                } else {
                    renderPrettierConfigPackage(files);
                }
            }
        }

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

        const generated = Object.keys(files).filter((file) => file.endsWith('package.json'));
        for (const pkgFile of generated) {
            const pkgName = pkgFile.replace('/package.json', '');
            console.log(color.dim(`  Generated ${pkgName}`));
        }

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
                renderVscodeFiles(vscodeFiles, linter, formatter);
                for (const [filePath, file] of Object.entries(vscodeFiles)) {
                    const fullPath = join(monorepoRoot, filePath);
                    await mkdir(dirname(fullPath), { recursive: true });
                    await writeFile(fullPath, file.content);
                }
                console.log(color.dim('  Generated .vscode/settings.json'));
                console.log(color.dim('  Generated .vscode/extensions.json'));
            }
        }

        const aiRulesExist = await fileExists(join(monorepoRoot, '.ai/workspace.md'));

        if (!aiRulesExist) {
            const platforms = await promptForAiAgentPlatforms(isNonInteractive);

            if (platforms.length > 0) {
                const scope = await getMonorepoScope(monorepoRoot);
                const aiFilesOutput: Record<string, { type: 'text'; content: string }> = {};
                renderAiFiles(aiFilesOutput, {
                    name: scope,
                    packageManager: 'pnpm',
                    linter,
                    formatter,
                    isMonorepo: true,
                    hasTypecheck: false,
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
