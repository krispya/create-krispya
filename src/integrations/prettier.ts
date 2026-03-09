import { defaultPrettierConfig } from '../constants.js';
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
        generator.addScript('format', 'prettier --config .config/prettier.json --write .');
        generator.addVscodeSetting('prettier.configPath', '.config/prettier.json');
    } else {
        generator.addFile('.prettierrc', {
            type: 'text',
            content: JSON.stringify(defaultPrettierConfig, null, 2),
        });
        generator.addScript('format', 'prettier --write .');
    }

    generator.inject('readme-tools', '[Prettier](https://prettier.io/) - Opinionated code formatter');
    generator.inject('vscode-extension-suggestion', 'esbenp.prettier-vscode');
    generator.addVscodeSetting('editor.defaultFormatter', 'esbenp.prettier-vscode');
}
