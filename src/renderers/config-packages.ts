import {
  toOxfmtConfig,
  toPrettierConfig,
  toPrettierIgnoreContent,
} from '../tools/formatter-config.js';
import type { VirtualFile } from '../types.js';
import { renderJson } from './json.js';
import { renderOxlintConfig } from './oxlint-config.js';

/**
 * Generates @config/typescript package with base, app, node, and react configs.
 */
export function renderTypescriptConfigPackage(files: Record<string, VirtualFile>): void {
  const basePath = '.config/typescript';

  // package.json
  files[`${basePath}/package.json`] = {
    type: 'text',
    content: renderJson(
      {
        name: '@config/typescript',
        version: '0.1.0',
        private: true,
        files: ['base.json', 'app.json', 'node.json', 'react.json'],
      },
      { inlineArrays: false }
    ),
  };

  // README.md
  files[`${basePath}/README.md`] = {
    type: 'text',
    content: `# \`@config/typescript\`

These are base shared \`tsconfig.json\`s from which all other \`tsconfig.json\`s inherit.

## Usage

In your package's \`tsconfig.json\`:

\`\`\`json
{
  "extends": "@config/typescript/app.json",
  "include": ["src/**/*", "tests"]
}
\`\`\`

## Available Configs

- \`base.json\` - Common TypeScript compiler options
- \`app.json\` - For browser/DOM code (extends base)
- \`node.json\` - For Node.js code (extends base)
- \`react.json\` - For React projects with JSX (extends app)
`,
  };

  // base.json - Common compiler options
  files[`${basePath}/base.json`] = {
    type: 'text',
    content: renderJson({
      $schema: 'https://json.schemastore.org/tsconfig',
      compilerOptions: {
        target: 'ESNext',
        module: 'ESNext',
        moduleResolution: 'bundler',
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
        strict: true,
        skipLibCheck: true,
        composite: true,
        rewriteRelativeImportExtensions: true,
        erasableSyntaxOnly: true,
      },
    }),
  };

  // app.json - Browser/DOM environment
  files[`${basePath}/app.json`] = {
    type: 'text',
    content: renderJson({
      $schema: 'https://json.schemastore.org/tsconfig',
      extends: './base.json',
      compilerOptions: {
        lib: ['DOM', 'DOM.Iterable', 'ESNext'],
      },
    }),
  };

  // node.json - Node.js environment
  files[`${basePath}/node.json`] = {
    type: 'text',
    content: renderJson({
      $schema: 'https://json.schemastore.org/tsconfig',
      extends: './base.json',
      compilerOptions: {
        lib: ['ESNext'],
        types: ['node'],
      },
    }),
  };

  // react.json - React with JSX
  files[`${basePath}/react.json`] = {
    type: 'text',
    content: renderJson({
      $schema: 'https://json.schemastore.org/tsconfig',
      extends: './app.json',
      compilerOptions: {
        jsx: 'react-jsx',
      },
    }),
  };
}

/**
 * Generates @config/oxlint package with base and react configs.
 */
export function renderOxlintConfigPackage(files: Record<string, VirtualFile>): void {
  const basePath = '.config/oxlint';

  // package.json
  files[`${basePath}/package.json`] = {
    type: 'text',
    content: renderJson(
      {
        name: '@config/oxlint',
        version: '0.1.0',
        private: true,
        files: ['base.json', 'react.json'],
      },
      { inlineArrays: false }
    ),
  };

  // README.md
  files[`${basePath}/README.md`] = {
    type: 'text',
    content: `# \`@config/oxlint\`

Shared oxlint configurations for the monorepo.

## Usage

Run oxlint with a config:

\`\`\`bash
oxlint -c node_modules/@config/oxlint/base.json
\`\`\`

## Available Configs

- \`base.json\` - Base linting rules for TypeScript projects
- \`react.json\` - Extends base with React-specific rules
`,
  };

  // base.json - Base oxlint config
  files[`${basePath}/base.json`] = {
    type: 'text',
    content: renderJson(
      renderOxlintConfig({
        schemaPath: './node_modules/oxlint/configuration_schema.json',
        typescript: true,
      })
    ),
  };

  // react.json - React-specific oxlint config
  files[`${basePath}/react.json`] = {
    type: 'text',
    content: renderJson(
      renderOxlintConfig({
        schemaPath: './node_modules/oxlint/configuration_schema.json',
        react: true,
        typescript: true,
      })
    ),
  };
}

/**
 * Generates @config/eslint package with base and react configs.
 */
export function renderEslintConfigPackage(files: Record<string, VirtualFile>): void {
  const basePath = '.config/eslint';

  // package.json
  files[`${basePath}/package.json`] = {
    type: 'text',
    content: renderJson(
      {
        name: '@config/eslint',
        version: '0.1.0',
        private: true,
        type: 'module',
        exports: {
          './base': './base.js',
          './react': './react.js',
        },
        files: ['base.js', 'react.js'],
        devDependencies: {
          '@eslint/js': '^9.17.0',
          'typescript-eslint': '^8.18.0',
        },
      },
      { inlineArrays: false }
    ),
  };

  // README.md
  files[`${basePath}/README.md`] = {
    type: 'text',
    content: `# \`@config/eslint\`

Shared ESLint configurations for the monorepo.

## Usage

In your package's \`eslint.config.js\`:

\`\`\`js
import base from "@config/eslint/base";

export default [...base];
\`\`\`

Or for React projects:

\`\`\`js
import react from "@config/eslint/react";

export default [...react];
\`\`\`

## Available Configs

- \`base\` - Base linting rules for TypeScript projects
- \`react\` - Extends base with React-specific rules
`,
  };

  // base.js - Base ESLint config
  files[`${basePath}/base.js`] = {
    type: 'text',
    content: `import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
  {
    ignores: ['dist/**', 'node_modules/**'],
  }
);
`,
  };

  // react.js - React ESLint config
  files[`${basePath}/react.js`] = {
    type: 'text',
    content: `import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
  {
    ignores: ['dist/**', 'node_modules/**'],
  }
);
`,
  };
}

/**
 * Generates @config/prettier package with base config.
 */
export function renderPrettierConfigPackage(files: Record<string, VirtualFile>): void {
  const basePath = '.config/prettier';

  // package.json
  files[`${basePath}/package.json`] = {
    type: 'text',
    content: renderJson(
      {
        name: '@config/prettier',
        version: '0.1.0',
        private: true,
        type: 'module',
        exports: {
          '.': './base.json',
        },
        files: ['base.json', 'prettierignore'],
      },
      { inlineArrays: false }
    ),
  };

  // README.md
  files[`${basePath}/README.md`] = {
    type: 'text',
    content: `# \`@config/prettier\`

Shared Prettier configuration for the monorepo.

## Usage

In your package's \`package.json\`:

\`\`\`json
{
  "prettier": "@config/prettier"
}
\`\`\`

Or in \`.prettierrc.json\`:

\`\`\`json
"@config/prettier"
\`\`\`

## Available Configs

- Default export - Base formatter settings
`,
  };

  // base.json - Base Prettier config
  files[`${basePath}/base.json`] = {
    type: 'text',
    content: renderJson(toPrettierConfig()),
  };

  files[`${basePath}/prettierignore`] = {
    type: 'text',
    content: toPrettierIgnoreContent(),
  };
}

/**
 * Generates @config/oxfmt package with base config.
 */
export function renderOxfmtConfigPackage(files: Record<string, VirtualFile>): void {
  const basePath = '.config/oxfmt';

  // package.json
  files[`${basePath}/package.json`] = {
    type: 'text',
    content: renderJson(
      {
        name: '@config/oxfmt',
        version: '0.1.0',
        private: true,
        files: ['base.json'],
      },
      { inlineArrays: false }
    ),
  };

  // README.md
  files[`${basePath}/README.md`] = {
    type: 'text',
    content: `# \`@config/oxfmt\`

Shared oxfmt (formatter) configuration for the monorepo.

## Usage

Run oxfmt with the config:

\`\`\`bash
oxfmt -c node_modules/@config/oxfmt/base.json --write .
\`\`\`

## Available Configs

- \`base.json\` - Base formatter settings (Prettier-compatible)
`,
  };

  // base.json - Base oxfmt config
  files[`${basePath}/base.json`] = {
    type: 'text',
    content: renderJson(toOxfmtConfig()),
  };
}
