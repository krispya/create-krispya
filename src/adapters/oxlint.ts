import { renderOxlintConfig } from '../renderers/oxlint-config.js';
import { packageJsonScripts } from '../renderers/package-json-scripts.js';
import {
    getBaseTemplate,
    getLanguageFromTemplate,
    type LinterMetaConfig,
    type PlanBuilder,
    type ToolConfig,
} from '../types.js';

export type PlanOxlintOptions = ToolConfig<'oxlint', LinterMetaConfig>;

export function planOxlint(builder: PlanBuilder, options: PlanOxlintOptions | undefined) {
    if (options == null) {
        return;
    }

    // Check if it's a React project
    const template = builder.options.template ?? 'vanilla';
    const baseTemplate = getBaseTemplate(template);
    const isTypescript = getLanguageFromTemplate(template) === 'typescript';
    const isReact = baseTemplate === 'react' || baseTemplate === 'r3f';

    // Check if we're in a monorepo context (workspaceRoot is set)
    const isMonorepo = builder.options.workspaceRoot != null;

    if (isMonorepo) {
        // Use @config/oxlint package from workspace (oxlint itself is at root)
        builder.addDevDependency('@config/oxlint', { version: 'workspace:*' });

        const configPath = isReact
            ? 'node_modules/@config/oxlint/react.json'
            : 'node_modules/@config/oxlint/base.json';

        builder.addScripts(packageJsonScripts.lint.oxlint(configPath));
    } else {
        // Single-package workspace: add oxlint as devDependency
        builder.addDevDependency('oxlint');
        if (isTypescript) {
            builder.addDevDependency('oxlint-tsgolint');
        }

        const isStealth = builder.isStealthConfig();

        const oxlintConfig = renderOxlintConfig({
            schemaPath: isStealth
                ? '../node_modules/oxlint/configuration_schema.json'
                : './node_modules/oxlint/configuration_schema.json',
            react: isReact,
            typescript: isTypescript,
            config: options.config,
        });

        if (isStealth) {
            builder.addFile('.config/oxlint.json', {
                type: 'text',
                content: JSON.stringify(oxlintConfig, null, 2),
            });
            builder.addScripts(packageJsonScripts.lint.oxlint('.config/oxlint.json'));
        } else {
            builder.addFile('oxlint.json', {
                type: 'text',
                content: JSON.stringify(oxlintConfig, null, 2),
            });
            builder.addScripts(packageJsonScripts.lint.oxlint());
        }
    }

    builder.inject(
        'readme-tools',
        '[Oxlint](https://oxc.rs/docs/guide/usage/linter) - A fast linter for JavaScript and TypeScript'
    );
    builder.inject('vscode-extension-suggestion', 'oxc.oxc-vscode');
}
