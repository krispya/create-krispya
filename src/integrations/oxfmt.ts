import { defaultOxfmtConfig } from '../constants.js';
import { packageJsonScripts } from '../generators/package-json-scripts.js';
import type { Generator } from '../types.js';

export type GenerateOxfmtOptions = {} | boolean;

export function generateOxfmt(generator: Generator, options: GenerateOxfmtOptions | undefined) {
    if (options == null) {
        return;
    }

    // Check if we're in a monorepo context (workspaceRoot is set)
    const isMonorepo = generator.options.workspaceRoot != null;

    if (isMonorepo) {
        // Use @config/oxfmt package from workspace (oxfmt itself is at root)
        generator.addDevDependency('@config/oxfmt', { version: 'workspace:*' });

        const configPath = 'node_modules/@config/oxfmt/base.json';

        generator.addScripts(packageJsonScripts.format.oxfmt(configPath));
    } else {
        // Standalone: add oxfmt as devDependency
        generator.addDevDependency('oxfmt');

        const isStealth = generator.isStealthConfig();

        if (isStealth) {
            generator.addFile('.config/oxfmt.json', {
                type: 'text',
                content: JSON.stringify(defaultOxfmtConfig, null, 2),
            });
            generator.addScripts(packageJsonScripts.format.oxfmt('.config/oxfmt.json'));
        } else {
            generator.addFile('oxfmt.json', {
                type: 'text',
                content: JSON.stringify(defaultOxfmtConfig, null, 2),
            });
            generator.addScripts(packageJsonScripts.format.oxfmt('oxfmt.json'));
        }
    }

    generator.inject(
        'readme-tools',
        '[Oxfmt](https://oxc.rs/docs/guide/usage/formatter) - Fast Prettier-compatible code formatter'
    );
    generator.inject('vscode-extension-suggestion', 'oxc.oxc-vscode');
}
