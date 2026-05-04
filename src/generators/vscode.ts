import type { CodeInjectionLocation, ConfigStrategy, File, Formatter, Linter } from '../types.js';
import { generateVscodeEditorSettings } from './editorconfig.js';

export type VscodeParams = {
    codeSnippets?: Partial<Record<CodeInjectionLocation, string[]>>;
    vscodeSettings?: Record<string, unknown>;
    linter?: Linter;
    formatter?: Formatter;
    configStrategy?: ConfigStrategy;
    isMonorepo?: boolean;
};

const DEFAULT_VSCODE_SETTINGS: Record<string, unknown> = {
    ...generateVscodeEditorSettings(),
    'explorer.fileNesting.enabled': true,
    'explorer.fileNesting.expand': false,
};

const OXFMT_LANGUAGE_SETTINGS: Record<string, unknown> = {
    '[json]': {
        'editor.defaultFormatter': 'vscode.json-language-features',
    },
    '[jsonc]': {
        'editor.defaultFormatter': 'vscode.json-language-features',
    },
    '[markdown]': {
        'editor.defaultFormatter': 'vscode.markdown-language-features',
    },
    '[yaml]': {
        'editor.defaultFormatter': 'redhat.vscode-yaml',
    },
};

function resolveVscodeRecommendations(linter?: Linter, formatter?: Formatter): string[] {
    const recommendations: string[] = [];

    if (linter === 'oxlint' || formatter === 'oxfmt') {
        recommendations.push('oxc.oxc-vscode');
    }

    if (linter === 'eslint') {
        recommendations.push('dbaeumer.vscode-eslint');
    }

    if (linter === 'biome' || formatter === 'biome') {
        recommendations.push('biomejs.biome');
    }

    if (formatter === 'prettier') {
        recommendations.push('esbenp.prettier-vscode');
    }

    return recommendations;
}

function resolveVscodeSettings(params: VscodeParams): Record<string, unknown> {
    const { linter, formatter, configStrategy, isMonorepo } = params;
    const settings: Record<string, unknown> = { ...DEFAULT_VSCODE_SETTINGS };
    const isStealth = !isMonorepo && (configStrategy ?? 'stealth') === 'stealth';

    if (linter === 'eslint') {
        settings['eslint.enable'] = true;
        settings['oxc.enable'] = false;
        settings['biome.enabled'] = false;

        if (isStealth) {
            settings['eslint.options'] = {
                overrideConfigFile: '.config/eslint.config.js',
            };
        }
    } else if (linter === 'oxlint') {
        settings['oxc.enable'] = true;
        settings['eslint.enable'] = false;
        settings['biome.enabled'] = false;

        if (isStealth) {
            settings['oxc.configPath'] = '.config/oxlint.json';
        }
    } else if (linter === 'biome') {
        settings['biome.enabled'] = true;
        settings['eslint.enable'] = false;
        settings['oxc.enable'] = false;

        if (isStealth) {
            settings['biome.linter.configPath'] = '.config/biome.json';
        }
    }

    if (formatter === 'prettier') {
        settings['editor.defaultFormatter'] = 'esbenp.prettier-vscode';

        if (isStealth) {
            settings['prettier.configPath'] = '.config/prettier.json';
        }
    } else if (formatter === 'oxfmt') {
        settings['editor.defaultFormatter'] = 'oxc.oxc-vscode';
        Object.assign(settings, OXFMT_LANGUAGE_SETTINGS);

        if (isStealth) {
            settings['oxc.fmt.configPath'] = '.config/oxfmt.json';
        }
    } else if (formatter === 'biome') {
        settings['biome.enabled'] = true;
        settings['eslint.enable'] = false;
        settings['oxc.enable'] = false;
        settings['editor.defaultFormatter'] = 'biomejs.biome';

        if (isStealth) {
            settings['biome.linter.configPath'] = '.config/biome.json';
        }
    }

    return settings;
}

/**
 * Generates VS Code configuration files.
 */
export function generateVscodeFiles(params: VscodeParams): Record<string, File> {
    const { codeSnippets = {}, vscodeSettings = {} } = params;
    const files: Record<string, File> = {};
    const recommendations = [
        ...(codeSnippets['vscode-extension-suggestion'] ?? []),
        ...resolveVscodeRecommendations(params.linter, params.formatter),
    ];

    if (recommendations.length > 0) {
        // Deduplicate extension recommendations
        const uniqueRecommendations = [...new Set(recommendations)];
        files['.vscode/extensions.json'] = {
            type: 'text',
            content: JSON.stringify(
                {
                    recommendations: uniqueRecommendations,
                },
                null,
                2
            ),
        };
    }

    const resolvedSettings = {
        ...resolveVscodeSettings(params),
        ...vscodeSettings,
    };

    if (Object.keys(resolvedSettings).length > 0) {
        // Sort keys to group related settings (e.g., all oxc.* together)
        const sortedSettings = Object.fromEntries(
            Object.entries(resolvedSettings).sort(([a], [b]) => a.localeCompare(b))
        );
        files['.vscode/settings.json'] = {
            type: 'text',
            content: JSON.stringify(sortedSettings, null, 2),
        };
    }

    return files;
}
