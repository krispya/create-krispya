import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
    compareWithDisk,
    detectCurrentConfig,
    generateExpectedFiles,
    getOxlintConfigReplacementUpdates,
    getPackageJsonScriptUpdates,
} from '../src/update.js';

describe('update helpers', () => {
    function readTextJson(file: { type: 'text'; content: string } | { type: 'remote'; url: string }) {
        if (file.type !== 'text') {
            throw new Error('Expected generated file to be text');
        }

        return JSON.parse(file.content);
    }

    it('uses standalone root config for standalone updates', async () => {
        const expected = await generateExpectedFiles({
            name: 'my-app',
            linter: 'oxlint',
            formatter: 'prettier',
            packageManager: 'pnpm',
            isMonorepo: false,
            configStrategy: 'stealth',
        });

        expect(expected['root-config']['.editorconfig']).toEqual({
            type: 'text',
            content: [
                'root = true',
                '',
                '[*]',
                'charset = utf-8',
                'end_of_line = lf',
                'insert_final_newline = true',
                'indent_style = space',
                'indent_size = 2',
                'tab_width = 2',
                'max_line_length = 102',
            ].join('\n'),
        });
        expect(expected['root-config']['.gitignore']).toEqual({
            type: 'text',
            content: [
                'node_modules',
                'dist',
                '*.tsbuildinfo',
                '.env',
                '.env.*',
                '!.env.example',
                '.pnpm-store',
            ].join('\n'),
        });
        expect(expected['root-config']['.config/prettierignore']).toEqual({
            type: 'text',
            content: [
                'package-lock.json',
                'npm-shrinkwrap.json',
                'pnpm-lock.yaml',
                'pnpm-lock.json',
                'yarn.lock',
                'bun.lock',
                'bun.lockb',
            ].join('\n'),
        });
        expect(expected['config-packages']).toEqual({});
        expect(expected['workspace-config']).toEqual({});
    });

    it('uses standalone VS Code config paths for standalone updates', async () => {
        const expected = await generateExpectedFiles({
            name: 'my-app',
            linter: 'oxlint',
            formatter: 'prettier',
            packageManager: 'pnpm',
            isMonorepo: false,
            configStrategy: 'stealth',
        });

        const settings = readTextJson(expected.vscode['.vscode/settings.json']);

        expect(settings['oxc.configPath']).toBe('.config/oxlint.json');
        expect(settings['prettier.configPath']).toBe('.config/prettier.json');
        expect(settings['prettier.ignorePath']).toBe('.config/prettierignore');
    });

    it('compares generated JSON files by value instead of formatting', async () => {
        const tempDir = await mkdtemp(join(tmpdir(), 'create-krispya-json-'));
        try {
            const expected = await generateExpectedFiles({
                name: 'my-app',
                linter: 'oxlint',
                formatter: 'prettier',
                packageManager: 'pnpm',
                isMonorepo: false,
                configStrategy: 'stealth',
            });
            const settings = readTextJson(expected.vscode['.vscode/settings.json']!);
            const reversedSettings = Object.fromEntries(Object.entries(settings).reverse());

            await mkdir(join(tempDir, '.vscode'), { recursive: true });
            await writeFile(
                join(tempDir, '.vscode/settings.json'),
                `{
  // Existing user formatting should not matter.
${JSON.stringify(reversedSettings, null, 4).slice(2, -2)},
}
`
            );
            const categories = await compareWithDisk(expected, tempDir);
            const vscode = categories.find((category) => category.category === 'vscode');
            const settingsChange = vscode?.changes.find(
                (change) => change.path === '.vscode/settings.json'
            );

            expect(settingsChange?.status).toBe('unchanged');
        } finally {
            await rm(tempDir, { recursive: true, force: true });
        }
    });

    it('regenerates standalone package scripts with typecheck watch', async () => {
        const tempDir = await mkdtemp(join(tmpdir(), 'create-krispya-scripts-'));
        try {
            await mkdir(join(tempDir, '.config'), { recursive: true });
            await writeFile(join(tempDir, '.config/tsconfig.app.json'), '{}');
            await writeFile(
                join(tempDir, 'package.json'),
                JSON.stringify(
                    {
                        name: 'my-app',
                        type: 'module',
                        scripts: {
                            custom: 'echo custom',
                            typecheck: 'tsc --noEmit',
                        },
                        devDependencies: {
                            eslint: '^9.0.0',
                            prettier: '^3.0.0',
                            typescript: '^5.0.0',
                            vite: '^6.0.0',
                            vitest: '^4.0.0',
                        },
                    },
                    null,
                    2
                )
            );

            const changes = await getPackageJsonScriptUpdates(tempDir, {
                name: 'my-app',
                linter: 'eslint',
                formatter: 'prettier',
                packageManager: 'pnpm',
                isMonorepo: false,
                configStrategy: 'stealth',
            });

            expect(changes).toHaveLength(1);
            expect(changes[0]?.status).toBe('modified');

            const packageJson = JSON.parse(changes[0]!.newContent);
            expect(packageJson.scripts).toMatchObject({
                build: 'vite build',
                custom: 'echo custom',
                dev: 'vite',
                format: 'prettier --config .config/prettier.json --ignore-path .config/prettierignore --write .',
                lint: 'eslint --config .config/eslint.config.js .',
                test: 'vitest',
                typecheck: 'tsc --build --noEmit',
                'typecheck:watch': 'tsc --build --watch',
            });
        } finally {
            await rm(tempDir, { recursive: true, force: true });
        }
    });

    it('adds oxlint type-aware backend during standalone updates', async () => {
        const tempDir = await mkdtemp(join(tmpdir(), 'create-krispya-oxlint-type-aware-'));
        try {
            await mkdir(join(tempDir, '.config'), { recursive: true });
            await writeFile(join(tempDir, '.config/tsconfig.app.json'), '{}');
            await writeFile(
                join(tempDir, 'package.json'),
                JSON.stringify(
                    {
                        name: 'my-app',
                        type: 'module',
                        scripts: {
                            lint: 'oxlint -c .config/oxlint.json',
                        },
                        devDependencies: {
                            oxlint: '^1.51.0',
                            typescript: '^5.9.3',
                        },
                    },
                    null,
                    2
                )
            );

            const changes = await getPackageJsonScriptUpdates(tempDir, {
                name: 'my-app',
                linter: 'oxlint',
                formatter: 'prettier',
                packageManager: 'pnpm',
                isMonorepo: false,
                configStrategy: 'stealth',
            });

            expect(changes).toHaveLength(1);
            expect(changes[0]?.status).toBe('modified');

            const packageJson = JSON.parse(changes[0]!.newContent);
            expect(packageJson.devDependencies['oxlint-tsgolint']).toBe('^0.22.1');
        } finally {
            await rm(tempDir, { recursive: true, force: true });
        }
    });

    it('offers oxlint config replacement during standalone updates', async () => {
        const tempDir = await mkdtemp(join(tmpdir(), 'create-krispya-oxlint-config-'));
        try {
            await mkdir(join(tempDir, '.config'), { recursive: true });
            await writeFile(
                join(tempDir, '.config/oxlint.json'),
                JSON.stringify(
                    {
                        $schema: '../node_modules/oxlint/configuration_schema.json',
                        plugins: ['unicorn', 'typescript', 'oxc'],
                        rules: {
                            'no-useless-escape': 'off',
                        },
                    },
                    null,
                    2
                )
            );

            const changes = await getOxlintConfigReplacementUpdates(tempDir, {
                name: 'my-app',
                linter: 'oxlint',
                formatter: 'prettier',
                packageManager: 'pnpm',
                isMonorepo: false,
                configStrategy: 'stealth',
            });

            expect(changes).toHaveLength(1);
            expect(changes[0]?.status).toBe('modified');

            const oxlintConfig = JSON.parse(changes[0]!.newContent);
            expect(oxlintConfig.options).toEqual({ typeAware: true });
            expect(oxlintConfig.ignorePatterns).toEqual(['dist']);
        } finally {
            await rm(tempDir, { recursive: true, force: true });
        }
    });

    it('uses workspace root config for monorepo updates', async () => {
        const expected = await generateExpectedFiles({
            name: 'workspace',
            linter: 'oxlint',
            formatter: 'prettier',
            packageManager: 'pnpm',
            isMonorepo: true,
        });

        expect(expected['root-config']['.gitignore']).toEqual({
            type: 'text',
            content: [
                'node_modules',
                'dist',
                '*.tsbuildinfo',
                '.env',
                '.env.*',
                '!.env.example',
                '.pnpm-store',
                '.DS_Store',
            ].join('\n'),
        });
        expect(expected['config-packages']['.config/typescript/package.json']).toBeDefined();

        const settings = readTextJson(expected.vscode['.vscode/settings.json']);
        expect(settings['oxc.configPath']).toBeUndefined();
        expect(settings['prettier.configPath']).toBeUndefined();
    });
});

describe('detectCurrentConfig', () => {
    let tempDir = '';

    afterEach(async () => {
        if (tempDir) {
            await rm(tempDir, { recursive: true, force: true });
            tempDir = '';
        }
    });

    it('detects standalone package manager and config strategy', async () => {
        tempDir = await mkdtemp(join(tmpdir(), 'create-krispya-update-'));
        await mkdir(join(tempDir, '.config'), { recursive: true });
        await writeFile(
            join(tempDir, 'package.json'),
            JSON.stringify({
                name: 'my-app',
                packageManager: 'npm@11.0.0',
            })
        );
        await writeFile(join(tempDir, '.config/tsconfig.app.json'), '{}');

        const config = await detectCurrentConfig(tempDir, false);

        expect(config).toMatchObject({
            name: 'my-app',
            packageManager: 'npm',
            isMonorepo: false,
            configStrategy: 'stealth',
        });
    });
});
