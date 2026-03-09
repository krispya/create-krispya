import type { GenerateZustandOptions, Generator } from '../types.js';

export function generateZustand(generator: Generator, options: GenerateZustandOptions | undefined) {
    if (options == null) {
        return;
    }
    generator.addDependency('zustand');
    generator.inject(
        'readme-libraries',
        `[zustand](https://zustand.docs.pmnd.rs/) - small, fast and scalable state-management solution`
    );
}
