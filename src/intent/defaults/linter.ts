import type { LinterMetaConfig } from '../../types.js';

export const defaultLinterMetaConfig: LinterMetaConfig = {
  ignorePatterns: ['dist'],
  rules: {
    noUnusedVars: {
      level: 'warn',
      argsIgnorePattern: '^_',
      varsIgnorePattern: '^_',
      caughtErrorsIgnorePattern: '^_',
    },
    noUnusedExpressions: {
      level: 'warn',
      allowShortCircuit: true,
    },
  },
};
