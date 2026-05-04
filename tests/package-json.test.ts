import { afterEach, describe, expect, it, vi } from 'vitest';
import { generate } from '../src/index.js';
import { generateMonorepo } from '../src/generators/monorepo.js';
import { generatePackageJson } from '../src/generators/package-json.js';

function readPackageJsonContent(
    file: { type: 'text'; content: string } | { type: 'remote'; url: string }
) {
    if (file.type !== 'text') {
        throw new Error('Expected package.json to be a text file');
    }

    return JSON.parse(file.content);
}

describe('generatePackageJson', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('defaults standalone libraries to version 0.1.0', () => {
        const result = generatePackageJson({
            name: 'my-lib',
            baseTemplate: 'vanilla',
            language: 'typescript',
            isLibrary: true,
            dependencies: {},
            devDependencies: {},
            peerDependencies: {},
            scripts: {},
            options: {
                name: 'my-lib',
            },
        });

        const packageJson = readPackageJsonContent(result.files['package.json']);
        expect(packageJson.version).toBe('0.1.0');
    });

    it('defaults workspace libraries to version 0.1.0', () => {
        const result = generatePackageJson({
            name: '@scope/my-lib',
            baseTemplate: 'vanilla',
            language: 'typescript',
            isLibrary: true,
            dependencies: {},
            devDependencies: {},
            peerDependencies: {},
            scripts: {},
            options: {
                name: '@scope/my-lib',
                workspaceRoot: '../..',
            },
        });

        const packageJson = readPackageJsonContent(result.files['package.json']);
        expect(packageJson.version).toBe('0.1.0');
    });

    it('uses the selected node version for both types and engines', () => {
        const result = generatePackageJson({
            name: 'my-app',
            baseTemplate: 'vanilla',
            language: 'javascript',
            isLibrary: false,
            dependencies: {},
            devDependencies: {},
            peerDependencies: {},
            scripts: {},
            options: {
                name: 'my-app',
                engine: { name: 'node', version: '25.1.0' },
            },
        });

        const packageJson = readPackageJsonContent(result.files['package.json']);
        expect(packageJson.devDependencies['@types/node']).toBe('^25.0.0');
        expect(packageJson.engines.node).toBe('>=25.0.0');
    });

    it('uses the resolved @types/node version when available', () => {
        const result = generatePackageJson({
            name: 'my-app',
            baseTemplate: 'vanilla',
            language: 'javascript',
            isLibrary: false,
            dependencies: {},
            devDependencies: {},
            peerDependencies: {},
            scripts: {},
            options: {
                name: 'my-app',
                engine: { name: 'node', version: '25.1.0' },
                versions: { '@types/node': '25.3.5' },
            },
        });

        const packageJson = readPackageJsonContent(result.files['package.json']);
        expect(packageJson.devDependencies['@types/node']).toBe('^25.3.5');
        expect(packageJson.engines.node).toBe('>=25.0.0');
    });

    it('adds readable default app scripts for TypeScript projects', () => {
        const result = generatePackageJson({
            name: 'my-app',
            baseTemplate: 'vanilla',
            language: 'typescript',
            isLibrary: false,
            dependencies: {},
            devDependencies: {},
            peerDependencies: {},
            scripts: {},
            options: {
                name: 'my-app',
                packageManager: { name: 'pnpm', version: '10.0.0' },
            },
        });

        const packageJson = readPackageJsonContent(result.files['package.json']);
        expect(packageJson.scripts).toEqual({
            build: 'vite build',
            dev: 'vite',
            typecheck: 'tsc --build --noEmit',
        });
    });

    it('merges default scripts with library overrides', () => {
        const result = generatePackageJson({
            name: 'my-lib',
            baseTemplate: 'vanilla',
            language: 'typescript',
            isLibrary: true,
            dependencies: {},
            devDependencies: {},
            peerDependencies: {},
            scripts: {
                build: 'unbuild',
            },
            options: {
                name: 'my-lib',
                packageManager: { name: 'pnpm', version: '10.0.0' },
            },
        });

        const packageJson = readPackageJsonContent(result.files['package.json']);
        expect(packageJson.scripts).toEqual({
            build: 'unbuild',
            release: 'pnpm run build && pnpm publish',
            typecheck: 'tsc --build --noEmit',
        });
    });

    it('composes standalone scripts from the shared script registry', () => {
        const files = generate({
            name: 'my-app',
            template: 'vanilla',
            testing: 'vitest',
            linter: 'eslint',
            formatter: 'prettier',
            packageManager: { name: 'pnpm', version: '10.0.0' },
            engine: { name: 'node', version: '25.1.0' },
            versions: {
                '@types/node': '25.3.5',
                eslint: '9.38.0',
                prettier: '3.8.1',
                typescript: '5.9.3',
                vite: '6.3.4',
                vitest: '4.0.18',
            },
        });

        const packageJson = readPackageJsonContent(files['package.json']);
        expect(packageJson.scripts).toEqual({
            build: 'vite build',
            dev: 'vite',
            format: 'prettier --config .config/prettier.json --write .',
            lint: 'eslint --config .config/eslint.config.js .',
            test: 'vitest',
            typecheck: 'tsc --build --noEmit',
        });
    });

    it('adds editorconfig to standalone projects', () => {
        const files = generate({
            name: 'my-app',
            template: 'vanilla',
            formatter: 'prettier',
        });

        expect(files['.editorconfig']).toEqual({
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
    });

    it('omits vscode files when standalone IDE is none', () => {
        const files = generate({
            name: 'my-app',
            template: 'vanilla',
            formatter: 'prettier',
            ide: 'none',
        });

        expect(files['.editorconfig']).toBeDefined();
        expect(files['.vscode/settings.json']).toBeUndefined();
        expect(files['.vscode/extensions.json']).toBeUndefined();
    });

    it('uses the shared script registry for monorepo root scripts', () => {
        const { files } = generateMonorepo({
            name: 'workspace',
            linter: 'oxlint',
            formatter: 'prettier',
            packageManager: { name: 'pnpm', version: '10.0.0' },
        });

        const packageJson = readPackageJsonContent(files['package.json']);
        expect(packageJson.scripts).toEqual({
            build: "pnpm --filter './packages/*' run build && pnpm --filter './apps/*' run build",
            dev: "pnpm --filter './apps/*' run dev",
            format: 'prettier --config .config/prettier/base.json --write .',
            lint: 'oxlint .',
            test: 'pnpm -r run test',
        });
    });

    it('adds editorconfig to monorepo roots', () => {
        const { files } = generateMonorepo({
            name: 'workspace',
            linter: 'oxlint',
            formatter: 'prettier',
            packageManager: { name: 'pnpm', version: '10.0.0' },
        });

        expect(files['.editorconfig']).toBeDefined();
    });

    it('omits vscode files when monorepo IDE is none', () => {
        const { files } = generateMonorepo({
            name: 'workspace',
            linter: 'oxlint',
            formatter: 'prettier',
            packageManager: { name: 'pnpm', version: '10.0.0' },
            ide: 'none',
        });

        expect(files['.editorconfig']).toBeDefined();
        expect(files['.vscode/settings.json']).toBeUndefined();
        expect(files['.vscode/extensions.json']).toBeUndefined();
    });

    it('adds typescript to generated TypeScript projects', () => {
        const files = generate({
            name: 'my-app',
            template: 'vanilla',
            linter: 'oxlint',
            formatter: 'prettier',
            packageManager: { name: 'pnpm', version: '10.0.0' },
            engine: { name: 'node', version: '25.1.0' },
            versions: {
                '@types/node': '25.3.5',
                oxlint: '1.51.0',
                prettier: '3.8.1',
                typescript: '5.9.3',
                vite: '6.3.4',
            },
        });

        const packageJson = readPackageJsonContent(files['package.json']);
        expect(packageJson.devDependencies.typescript).toBe('^5.9.3');
    });
});
