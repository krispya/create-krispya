import { packageJsonScripts } from '../renderers/package-json-scripts.js';
import {
    getBaseTemplate,
    getLanguageFromTemplate,
    type LinterMetaConfig,
    type PlanBuilder,
    type ToolConfig,
} from '../types.js';

export type PlanEslintOptions = ToolConfig<'eslint', LinterMetaConfig>;

// Helper to convert level to eslint format
function toEslintLevel(level: 'off' | 'warn' | 'error'): string {
    return level;
}

export function planEslint(builder: PlanBuilder, options: PlanEslintOptions | undefined) {
    if (options == null) {
        return;
    }

    builder.addDevDependency('eslint');

    // Add eslint flat config
    const template = builder.options.template ?? 'vanilla';
    const baseTemplate = getBaseTemplate(template);
    const isTypescript = getLanguageFromTemplate(template) === 'typescript';
    const isReact = baseTemplate === 'react' || baseTemplate === 'r3f';

    const { rules } = options.config;

    const imports: string[] = ['import js from "@eslint/js"'];
    const configs: string[] = ['js.configs.recommended'];

    if (isTypescript) {
        builder.addDevDependency('typescript-eslint');
        imports.push('import tseslint from "typescript-eslint"');
        configs.push('...tseslint.configs.recommended');
    }

    if (isReact) {
        builder.addDevDependency('eslint-plugin-react-hooks');
        imports.push('import reactHooks from "eslint-plugin-react-hooks"');
    }

    // Build ignore patterns string
    const ignoresArray = JSON.stringify(options.config.ignorePatterns);

    // Build rules object - use @typescript-eslint/no-unused-vars for TS projects
    const unusedVarsRule = isTypescript ? '@typescript-eslint/no-unused-vars' : 'no-unused-vars';
    const rulesConfig = {
        [unusedVarsRule]: [
            toEslintLevel(rules.noUnusedVars.level),
            {
                argsIgnorePattern: rules.noUnusedVars.argsIgnorePattern,
                varsIgnorePattern: rules.noUnusedVars.varsIgnorePattern,
                caughtErrorsIgnorePattern: rules.noUnusedVars.caughtErrorsIgnorePattern,
            },
        ],
        'no-unused-expressions': [
            toEslintLevel(rules.noUnusedExpressions.level),
            { allowShortCircuit: rules.noUnusedExpressions.allowShortCircuit },
        ],
    };

    const rulesString = JSON.stringify(rulesConfig, null, 4).replace(/\n/g, '\n    ');

    const configContent = [
        ...imports,
        '',
        'export default [',
        `  { ignores: ${ignoresArray} },`,
        `  ${configs.join(',\n  ')},`,
        isReact
            ? `  {
    plugins: {
      "react-hooks": reactHooks,
    },
    rules: reactHooks.configs.recommended.rules,
  },`
            : '',
        `  {
    rules: ${rulesString},
  },`,
        ']',
    ]
        .filter(Boolean)
        .join('\n');

    const isStealth = builder.isStealthConfig();

    if (isStealth) {
        builder.addFile('.config/eslint.config.js', {
            type: 'text',
            content: configContent,
        });
        builder.addScripts(packageJsonScripts.lint.eslint('.config/eslint.config.js'));
    } else {
        builder.addFile('eslint.config.js', {
            type: 'text',
            content: configContent,
        });
        builder.addScripts(packageJsonScripts.lint.eslint());
    }

    builder.inject(
        'readme-tools',
        '[ESLint](https://eslint.org/) - Linter for JavaScript and TypeScript'
    );
    builder.inject('vscode-extension-suggestion', 'dbaeumer.vscode-eslint');
}
