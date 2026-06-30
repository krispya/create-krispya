import type { FormatterMetaConfig } from '../types.js';

export const defaultFormatterMetaConfig: FormatterMetaConfig = {
  printWidth: 102,
  tabWidth: 2,
  useTabs: false,
  semi: true,
  singleQuote: true,
  trailingComma: 'es5',
  bracketSpacing: true,
  arrowParens: 'always',
  ignorePatterns: [
    'dist/',
    '**/dist/',
    'package-lock.json',
    'npm-shrinkwrap.json',
    'pnpm-lock.yaml',
    'pnpm-lock.json',
    'yarn.lock',
    'bun.lock',
    'bun.lockb',
  ],
};
