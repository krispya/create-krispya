import type { GenerateRapierOptions, Generator } from '../types.js';

export function generateRapier(generator: Generator, options: GenerateRapierOptions | undefined) {
    if (options == null) {
        return;
    }
    generator.addDependency('@react-three/rapier');
    generator.inject(
        'readme-libraries',
        `[@react-three/rapier](https://github.com/pmndrs/react-three-rapier) - Physics based on Rapier for your @react-three/fiber scene`
    );
}
