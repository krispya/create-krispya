import { getBaseTemplate, type Generator } from '../types.js';
import { packageJsonScripts } from '../generators/package-json-scripts.js';

export function generateVitest(generator: Generator) {
    generator.addDevDependency('vitest');

    const template = generator.options.template ?? 'vanilla';
    const baseTemplate = getBaseTemplate(template);
    const isReact = baseTemplate === 'react' || baseTemplate === 'r3f';

    // Add React Testing Library for React/R3F templates
    if (isReact) {
        generator.addDevDependency('@testing-library/react');
        generator.addDevDependency('@testing-library/dom');
        generator.addDevDependency('jsdom');
    }

    // Merge vitest config into vite config (only if needed)
    if (isReact) {
        generator.configureVite({ test: { environment: 'jsdom' } });
    }

    generator.addScripts(packageJsonScripts.test.vitest);
    generator.inject(
        'readme-tools',
        '[Vitest](https://vitest.dev/) - Fast unit test framework powered by Vite'
    );
}
