import type { CodeInjectionLocation, VirtualFile } from '../types.js';

export type ViteConfigParams = {
    viteConfig: Record<string, unknown>;
    codeSnippets: Partial<Record<CodeInjectionLocation, string[]>>;
};

/**
 * Formats a value for vite config output.
 * Handles $raw: prefix for raw JS expressions.
 */
function formatValue(value: unknown, indent: number): string {
    const spaces = '  '.repeat(indent);
    const innerSpaces = '  '.repeat(indent + 1);

    if (typeof value === 'string') {
        // Check for raw expression
        if (value.startsWith('$raw:')) {
            return value.slice(5);
        }
        return JSON.stringify(value);
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
        return String(value);
    }

    if (value === null) {
        return 'null';
    }

    if (Array.isArray(value)) {
        if (value.length === 0) return '[]';
        const items = value.map((v) => `${innerSpaces}${formatValue(v, indent + 1)}`);
        return `[\n${items.join(',\n')}\n${spaces}]`;
    }

    if (typeof value === 'object') {
        const entries = Object.entries(value as Record<string, unknown>);
        if (entries.length === 0) return '{}';
        const props = entries.map(
            ([key, val]) => `${innerSpaces}${key}: ${formatValue(val, indent + 1)}`
        );
        return `{\n${props.join(',\n')}\n${spaces}}`;
    }

    return String(value);
}

/**
 * Generates the vite.config.ts file with proper formatting.
 */
export function renderViteConfig(params: ViteConfigParams): VirtualFile {
    const { viteConfig, codeSnippets } = params;

    const configBody = formatValue(viteConfig, 0);

    const viteConfigContent = [
        `import { defineConfig } from "vite"`,
        ...(codeSnippets['vite-config-import'] ?? []),
        ``,
        `export default defineConfig(${configBody})`,
        ``,
    ].join('\n');

    return { type: 'text', content: viteConfigContent };
}
