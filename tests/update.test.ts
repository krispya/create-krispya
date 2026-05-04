import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { detectCurrentConfig, generateExpectedFiles } from '../src/update.js';

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
