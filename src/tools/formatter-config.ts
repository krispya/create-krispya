import { defaultFormatterMetaConfig } from '../defaults/formatter.js';
import type { FormatterMetaConfig } from '../types.js';

export function toPrettierConfig(config: FormatterMetaConfig = defaultFormatterMetaConfig) {
  return {
    $schema: 'https://json.schemastore.org/prettierrc',
    printWidth: config.printWidth,
    tabWidth: config.tabWidth,
    useTabs: config.useTabs,
    semi: config.semi,
    singleQuote: config.singleQuote,
    trailingComma: config.trailingComma,
    bracketSpacing: config.bracketSpacing,
    arrowParens: config.arrowParens,
    overrides: [
      {
        files: ['*.md', '**/*.md'],
        options: { semi: false },
      },
      {
        files: ['*.yml', '*.yaml', '**/*.yml', '**/*.yaml'],
        options: { semi: false },
      },
    ],
  };
}

export function toPrettierIgnoreContent(
  config: FormatterMetaConfig = defaultFormatterMetaConfig
): string {
  return config.ignorePatterns.join('\n');
}

export function toOxfmtConfig(config: FormatterMetaConfig = defaultFormatterMetaConfig) {
  return {
    printWidth: config.printWidth,
    tabWidth: config.tabWidth,
    useTabs: config.useTabs,
    semi: config.semi,
    singleQuote: config.singleQuote,
    trailingComma: config.trailingComma,
    bracketSpacing: config.bracketSpacing,
    arrowParens: config.arrowParens,
    ignorePatterns: config.ignorePatterns,
  };
}
