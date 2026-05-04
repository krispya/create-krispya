import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { validateWorkspace } from '../src/validate.js';

describe('validateWorkspace', () => {
    let tempDir: string;

    beforeEach(async () => {
        tempDir = join(tmpdir(), `test-workspace-${Date.now()}`);
        await mkdir(tempDir, { recursive: true });
    });

    afterEach(async () => {
        await rm(tempDir, { recursive: true, force: true });
    });

    it('fails when .config/typescript is missing', async () => {
        const result = await validateWorkspace(tempDir);
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Missing .config/typescript package');
    });

    it('fails when linter config is missing', async () => {
        await mkdir(join(tempDir, '.config/typescript'), { recursive: true });
        await writeFile(join(tempDir, '.config/typescript/package.json'), '{}');

        const result = await validateWorkspace(tempDir);
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes('linter'))).toBe(true);
    });

    it('passes with oxlint + oxfmt config packages', async () => {
        await mkdir(join(tempDir, '.config/typescript'), { recursive: true });
        await mkdir(join(tempDir, '.config/oxlint'), { recursive: true });
        await mkdir(join(tempDir, '.config/oxfmt'), { recursive: true });
        await writeFile(join(tempDir, '.config/typescript/package.json'), '{}');
        await writeFile(join(tempDir, '.config/oxlint/package.json'), '{}');
        await writeFile(join(tempDir, '.config/oxfmt/package.json'), '{}');

        const result = await validateWorkspace(tempDir);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
    });

    it('passes with biome.json for both linter and formatter', async () => {
        await mkdir(join(tempDir, '.config/typescript'), { recursive: true });
        await writeFile(join(tempDir, '.config/typescript/package.json'), '{}');
        await writeFile(join(tempDir, 'biome.json'), '{}');

        const result = await validateWorkspace(tempDir);
        expect(result.valid).toBe(true);
    });

    it('passes with eslint + prettier root configs', async () => {
        await mkdir(join(tempDir, '.config/typescript'), { recursive: true });
        await writeFile(join(tempDir, '.config/typescript/package.json'), '{}');
        await writeFile(join(tempDir, 'eslint.config.js'), 'export default []');
        await writeFile(join(tempDir, '.prettierrc.json'), '{}');

        const result = await validateWorkspace(tempDir);
        expect(result.valid).toBe(true);
    });

    it('passes with .config/eslint + .config/prettier packages', async () => {
        await mkdir(join(tempDir, '.config/typescript'), { recursive: true });
        await mkdir(join(tempDir, '.config/eslint'), { recursive: true });
        await mkdir(join(tempDir, '.config/prettier'), { recursive: true });
        await writeFile(join(tempDir, '.config/typescript/package.json'), '{}');
        await writeFile(join(tempDir, '.config/eslint/package.json'), '{}');
        await writeFile(join(tempDir, '.config/prettier/package.json'), '{}');

        const result = await validateWorkspace(tempDir);
        expect(result.valid).toBe(true);
    });
});

describe('generateMonorepo with eslint/prettier', () => {
    it('generates .config/eslint package when eslint is selected', async () => {
        const { generateMonorepo } = await import('../src/generators/monorepo.js');
        const { files } = generateMonorepo({
            name: 'test-workspace',
            linter: 'eslint',
            formatter: 'prettier',
            packageManager: { name: 'pnpm' },
        });

        expect(files['.config/eslint/package.json']).toBeDefined();
        expect(files['.config/eslint/base.js']).toBeDefined();
        expect(files['.config/prettier/package.json']).toBeDefined();
        expect(files['.config/prettier/base.json']).toBeDefined();
    });
});
