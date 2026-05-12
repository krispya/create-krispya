import { describe, expect, it } from 'vitest';
import { renderAiFiles } from '../src/renderers/ai-files.js';
import type { VirtualFile } from '../src/types.js';

const exampleFiles = 'src/App.tsx src/core/systems/move-entity.ts';

function renderAgentsFile(
    params: Omit<Parameters<typeof renderAiFiles>[1], 'name' | 'platforms'>
): string {
    const files: Record<string, VirtualFile> = {};

    renderAiFiles(files, {
        name: 'example',
        platforms: ['agents'],
        ...params,
    });

    const agentsFile = files['AGENTS.md'];
    if (agentsFile?.type !== 'text') {
        throw new Error('Expected AGENTS.md to be generated as text');
    }

    return agentsFile.content;
}

describe('renderAiFiles', () => {
    it('generates single-package pnpm oxlint and prettier instructions with stealth configs', () => {
        const content = renderAgentsFile({
            packageManager: 'pnpm',
            linter: 'oxlint',
            formatter: 'prettier',
            configStrategy: 'stealth',
            hasTypecheck: true,
        });

        expect(content).toContain('# Workspace Tools');
        expect(content).toContain('- **Package Manager:** pnpm');
        expect(content).toContain('- **Linter:** oxlint');
        expect(content).toContain('- **Formatter:** prettier');
        expect(content).toContain('pnpm typecheck');
        expect(content).toContain(
            `pnpm exec prettier --config .config/prettier.json --ignore-path .config/prettierignore --write ${exampleFiles}`
        );
        expect(content).toContain(`pnpm lint -- ${exampleFiles}`);
        expect(content).toContain('pnpm format\npnpm lint');
    });

    it('generates single-package eslint and prettier instructions with root configs', () => {
        const content = renderAgentsFile({
            packageManager: 'pnpm',
            linter: 'eslint',
            formatter: 'prettier',
            configStrategy: 'root',
            hasTypecheck: true,
        });

        expect(content).toContain(`pnpm exec prettier --write ${exampleFiles}`);
        expect(content).toContain(`pnpm exec eslint ${exampleFiles}`);
    });

    it('generates biome commands with stealth config paths', () => {
        const content = renderAgentsFile({
            packageManager: 'pnpm',
            linter: 'biome',
            formatter: 'biome',
            configStrategy: 'stealth',
            hasTypecheck: true,
        });

        expect(content).toContain(
            `pnpm exec biome format --config-path .config --write ${exampleFiles}`
        );
        expect(content).toContain(`pnpm exec biome lint --config-path .config ${exampleFiles}`);
    });

    it('generates monorepo oxlint and prettier instructions with shared configs', () => {
        const content = renderAgentsFile({
            packageManager: 'pnpm',
            linter: 'oxlint',
            formatter: 'prettier',
            isMonorepo: true,
        });

        expect(content).toContain(
            `pnpm exec prettier --config .config/prettier/base.json --ignore-path .config/prettier/prettierignore --write ${exampleFiles}`
        );
        expect(content).toContain(`pnpm exec oxlint ${exampleFiles}`);
        expect(content).not.toContain('pnpm typecheck');
    });

    it('omits typecheck instructions when no typecheck script exists', () => {
        const content = renderAgentsFile({
            packageManager: 'pnpm',
            linter: 'oxlint',
            formatter: 'prettier',
            configStrategy: 'stealth',
            hasTypecheck: false,
        });

        expect(content).not.toContain('pnpm typecheck');
        expect(content).toContain(
            '✅ After editing files, format and lint only the files changed for the current task.'
        );
    });
});
