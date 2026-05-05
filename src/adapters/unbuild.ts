import { packageJsonScripts } from '../renderers/package-json-scripts.js';
import { getBaseTemplate, getLanguageFromTemplate, type PlanBuilder } from '../types.js';

export function planUnbuild(builder: PlanBuilder) {
    builder.addDevDependency('unbuild');

    const template = builder.options.template ?? 'vanilla';
    const baseTemplate = getBaseTemplate(template);
    const language = getLanguageFromTemplate(template);
    const isReact = baseTemplate === 'react' || baseTemplate === 'r3f';
    const ext = language === 'typescript' ? 'ts' : 'js';

    // Check if we're in a monorepo context (workspaceRoot is set)
    const isMonorepo = builder.options.workspaceRoot != null;

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

    const isStealth = builder.isStealthConfig() && !isMonorepo;

    if (isStealth) {
        // Single-package stealth: place config in .config/
        builder.addFile(`.config/build.config.${ext}`, {
            type: 'text',
            content: buildConfigLines.join('\n'),
        });
        builder.addScripts(packageJsonScripts.build.unbuild(`.config/build.config.${ext}`));
    } else {
        // Monorepo or root strategy: place config at package root
        builder.addFile(`build.config.${ext}`, {
            type: 'text',
            content: buildConfigLines.join('\n'),
        });
        builder.addScripts(packageJsonScripts.build.unbuild());
    }

    builder.inject(
        'readme-libraries',
        '[unbuild](https://github.com/unjs/unbuild) - Unified JavaScript build system'
    );
}
