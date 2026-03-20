import { defaultPrettierConfig } from '../constants.js';
import { packageJsonScripts } from '../generators/package-json-scripts.js';
import type { Generator } from '../types.js';

export type GeneratePrettierOptions = {} | boolean;

export function generatePrettier(generator: Generator, options: GeneratePrettierOptions | undefined) {
    if (options == null) {
        return;
    }

    generator.addDevDependency('prettier');

    const isStealth = generator.isStealthConfig();

    if (isStealth) {
        generator.addFile('.config/prettier.json', {
            type: 'text',
            content: JSON.stringify(defaultPrettierConfig, null, 2),
        });
        generator.addScripts(packageJsonScripts.format.prettier('.config/prettier.json'));
    } else {
        generator.addFile('.prettierrc', {
            type: 'text',
            content: JSON.stringify(defaultPrettierConfig, null, 2),
        });
        generator.addScripts(packageJsonScripts.format.prettier());
    }

    generator.inject('readme-tools', '[Prettier](https://prettier.io/) - Opinionated code formatter');
    generator.inject('vscode-extension-suggestion', 'esbenp.prettier-vscode');
}
