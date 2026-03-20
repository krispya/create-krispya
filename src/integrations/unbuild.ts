import { packageJsonScripts } from '../generators/package-json-scripts.js';
import { getBaseTemplate, getLanguageFromTemplate, type Generator } from '../types.js';

export function generateUnbuild(generator: Generator) {
    generator.addDevDependency('unbuild');

    const template = generator.options.template ?? 'vanilla';
    const baseTemplate = getBaseTemplate(template);
    const language = getLanguageFromTemplate(template);
    const isReact = baseTemplate === 'react' || baseTemplate === 'r3f';
    const ext = language === 'typescript' ? 'ts' : 'js';

    // Check if we're in a monorepo context (workspaceRoot is set)
    const isMonorepo = generator.options.workspaceRoot != null;

    // Build config
    const buildConfigLines = [
        `import { defineBuildConfig } from "unbuild"`,
        ``,
        `export default defineBuildConfig({`,
        `  entries: ["./src/index"],`,
        `  declaration: ${language === 'typescript'},`,
        `  clean: true,`,
        `  rollup: {`,
        `    emitCJS: true,`,
    ];

    // Add external dependencies for React libraries
    if (isReact) {
        buildConfigLines.push(`    esbuild: {`);
        buildConfigLines.push(`      jsx: "automatic",`);
        buildConfigLines.push(`    },`);
    }

    buildConfigLines.push(`  },`);
    buildConfigLines.push(`})`);

    const isStealth = generator.isStealthConfig() && !isMonorepo;

    if (isStealth) {
        // Standalone stealth: place config in .config/
        generator.addFile(`.config/build.config.${ext}`, {
            type: 'text',
            content: buildConfigLines.join('\n'),
        });
        generator.addScripts(packageJsonScripts.build.unbuild(`.config/build.config.${ext}`));
    } else {
        // Monorepo or root strategy: place config at package root
        generator.addFile(`build.config.${ext}`, {
            type: 'text',
            content: buildConfigLines.join('\n'),
        });
        generator.addScripts(packageJsonScripts.build.unbuild());
    }

    generator.inject(
        'readme-libraries',
        '[unbuild](https://github.com/unjs/unbuild) - Unified JavaScript build system'
    );
}
