import { defaultLinterMetaConfig } from '../defaults/linter.js';
import type { LinterMetaConfig } from '../types.js';

export type RenderOxlintConfigParams = {
  schemaPath: string;
  root?: boolean;
  react?: boolean;
  reactCompiler?: boolean;
  typescript?: boolean;
  config?: LinterMetaConfig;
};

const REACT_HOOKS_JS_PLUGIN = {
  name: 'react-hooks-js',
  specifier: 'eslint-plugin-react-hooks',
};

const REACT_COMPILER_RULES = {
  'react-hooks-js/component-hook-factories': 'error',
  'react-hooks-js/config': 'error',
  'react-hooks-js/error-boundaries': 'error',
  'react-hooks-js/gating': 'error',
  'react-hooks-js/globals': 'error',
  'react-hooks-js/immutability': 'error',
  'react-hooks-js/incompatible-library': 'warn',
  'react-hooks-js/preserve-manual-memoization': 'warn',
  'react-hooks-js/purity': 'error',
  'react-hooks-js/refs': 'error',
  'react-hooks-js/set-state-in-effect': 'error',
  'react-hooks-js/set-state-in-render': 'error',
  'react-hooks-js/static-components': 'error',
  'react-hooks-js/unsupported-syntax': 'warn',
  'react-hooks-js/use-memo': 'error',
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
    ...(params.reactCompiler === true ? { jsPlugins: [REACT_HOOKS_JS_PLUGIN] } : {}),
    ...(params.typescript === true && params.root !== false
      ? { options: { typeAware: true, typeCheck: true } }
      : {}),
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
      ...(params.reactCompiler === true ? REACT_COMPILER_RULES : {}),
    },
    ignorePatterns: config.ignorePatterns,
  };
}
