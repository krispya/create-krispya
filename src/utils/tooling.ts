import { access, readFile } from 'fs/promises';
import { constants } from 'fs';
import { join } from 'path';

import type { Formatter, Linter } from '../types.js';

export type DetectedTooling = {
    linter: Linter | undefined;
    formatter: Formatter | undefined;
};

async function pathExists(path: string): Promise<boolean> {
    try {
        await access(path, constants.F_OK);
        return true;
    } catch {
        return false;
    }
}

function detectLinterFromScript(script: string | undefined): Linter | undefined {
    if (!script) return undefined;
    if (script.includes('oxlint')) return 'oxlint';
    if (script.includes('eslint')) return 'eslint';
    if (script.includes('biome check') || script.includes('biome lint')) return 'biome';
    return undefined;
}

function detectFormatterFromScript(script: string | undefined): Formatter | undefined {
    if (!script) return undefined;
    if (script.includes('prettier')) return 'prettier';
    if (script.includes('oxfmt')) return 'oxfmt';
    if (script.includes('biome format')) return 'biome';
    return undefined;
}

async function detectLinterFromConfig(root: string): Promise<Linter | undefined> {
    if (await pathExists(join(root, '.config/oxlint'))) return 'oxlint';
    if (await pathExists(join(root, '.config/eslint'))) return 'eslint';
    if (await pathExists(join(root, 'biome.json'))) {
        try {
            const content = await readFile(join(root, 'biome.json'), 'utf-8');
            const config = JSON.parse(content) as { linter?: { enabled?: boolean } };
            if (config.linter?.enabled !== false) return 'biome';
        } catch {
            return 'biome';
        }
    }
    return undefined;
}

async function detectFormatterFromConfig(root: string): Promise<Formatter | undefined> {
    if (await pathExists(join(root, '.config/prettier'))) return 'prettier';
    if (await pathExists(join(root, '.config/oxfmt'))) return 'oxfmt';
    if (await pathExists(join(root, 'biome.json'))) {
        try {
            const content = await readFile(join(root, 'biome.json'), 'utf-8');
            const config = JSON.parse(content) as { formatter?: { enabled?: boolean } };
            if (config.formatter?.enabled !== false) return 'biome';
        } catch {
            return 'biome';
        }
    }
    return undefined;
}

function detectLinterFromDeps(devDeps: Record<string, string> | undefined): Linter | undefined {
    if (!devDeps) return undefined;
    if (devDeps['@biomejs/biome']) return 'biome';
    if (devDeps.eslint) return 'eslint';
    if (devDeps.oxlint) return 'oxlint';
    return undefined;
}

function detectFormatterFromDeps(devDeps: Record<string, string> | undefined): Formatter | undefined {
    if (!devDeps) return undefined;
    if (devDeps['@biomejs/biome']) return 'biome';
    if (devDeps.prettier) return 'prettier';
    if (devDeps.oxfmt) return 'oxfmt';
    return undefined;
}

export async function detectTooling(root: string): Promise<DetectedTooling> {
    try {
        const pkgPath = join(root, 'package.json');
        const content = await readFile(pkgPath, 'utf-8');
        const pkg = JSON.parse(content) as {
            scripts?: Record<string, string>;
            devDependencies?: Record<string, string>;
        };

        const linter =
            detectLinterFromScript(pkg.scripts?.lint) ??
            (await detectLinterFromConfig(root)) ??
            detectLinterFromDeps(pkg.devDependencies);

        const formatter =
            detectFormatterFromScript(pkg.scripts?.format) ??
            (await detectFormatterFromConfig(root)) ??
            detectFormatterFromDeps(pkg.devDependencies);

        return { linter, formatter };
    } catch {
        return { linter: undefined, formatter: undefined };
    }
}
