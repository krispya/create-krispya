import type { GenerateLevaOptions, Generator } from '../types.js';

export function generateLeva(generator: Generator, options: GenerateLevaOptions | undefined) {
    if (options == null) {
        return;
    }
    generator.addDependency('leva');
    generator.inject(
        'readme-libraries',
        `[leva](https://github.com/pmndrs/leva) - HTML GUI panel for React with lightweight, beautiful and extensible controls`
    );
}
