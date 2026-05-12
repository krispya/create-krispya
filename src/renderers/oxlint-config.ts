import { defaultLinterMetaConfig } from '../defaults/linter.js';
import type { LinterMetaConfig } from '../types.js';

export type RenderOxlintConfigParams = {
  schemaPath: string;
  react?: boolean;
  typescript?: boolean;
  config?: LinterMetaConfig;
};

export function renderOxlintConfig(params: RenderOxlintConfigParams) {
  const config = params.config ?? defaultLinterMetaConfig;
  const { rules } = config;
  const plugins = ['unicorn', 'typescript', 'oxc'];

  if (params.react === true) {
    plugins.push('react');
  }

  return {
    $schema: params.schemaPath,
    plugins,
    ...(params.typescript === true ? { options: { typeAware: true } } : {}),
    rules: {
      'no-unused-vars': [
        rules.noUnusedVars.level,
        {
          argsIgnorePattern: rules.noUnusedVars.argsIgnorePattern,
          varsIgnorePattern: rules.noUnusedVars.varsIgnorePattern,
          caughtErrorsIgnorePattern: rules.noUnusedVars.caughtErrorsIgnorePattern,
        },
      ],
      'no-useless-escape': 'off',
      'no-unused-expressions': [
        rules.noUnusedExpressions.level,
        { allowShortCircuit: rules.noUnusedExpressions.allowShortCircuit },
      ],
    },
    ignorePatterns: config.ignorePatterns,
  };
}
