import { afterEach, describe, expect, it, vi } from 'vitest';
import { format as formatPrettier } from 'prettier';
import { planProject, planWorkspace } from '../src/index.js';
import { defaultFormatterMetaConfig } from '../src/defaults/formatter.js';

import { renderPackageJson } from '../src/renderers/package-json.js';

const formatterIndentStyle = defaultFormatterMetaConfig.useTabs ? 'tab' : 'space';
const formatterIndentSize = defaultFormatterMetaConfig.useTabs
  ? 'tab'
  : String(defaultFormatterMetaConfig.tabWidth);
const prettierOptions = {
  printWidth: defaultFormatterMetaConfig.printWidth,
  tabWidth: defaultFormatterMetaConfig.tabWidth,
  useTabs: defaultFormatterMetaConfig.useTabs,
  semi: defaultFormatterMetaConfig.semi,
  singleQuote: defaultFormatterMetaConfig.singleQuote,
  trailingComma: defaultFormatterMetaConfig.trailingComma,
  bracketSpacing: defaultFormatterMetaConfig.bracketSpacing,
  arrowParens: defaultFormatterMetaConfig.arrowParens,
};

function readPackageJsonContent(
  file: { type: 'text'; content: string } | { type: 'remote'; url: string }
) {
  if (file.type !== 'text') {
    throw new Error('Expected package.json to be a text file');
  }

  return JSON.parse(file.content);
}

function readTextFile(file: { type: 'text'; content: string } | { type: 'remote'; url: string }) {
  if (file.type !== 'text') {
    throw new Error('Expected file to be text');
  }

  return file.content;
}

async function expectPreformattedFiles(
  files: Record<string, { type: 'text'; content: string } | { type: 'remote'; url: string }>,
  predicate: (path: string) => boolean
) {
  for (const [path, file] of Object.entries(files)) {
    if (!predicate(path) || file.type !== 'text') {
      continue;
    }

    await expect(
      formatPrettier(file.content, {
        ...prettierOptions,
        filepath: path,
      })
    ).resolves.toBe(file.content);
  }
}

describe('renderPackageJson', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('defaults single-package libraries to version 0.1.0', async () => {
    const result = renderPackageJson({
      name: 'my-lib',
      baseTemplate: 'vanilla',
      language: 'typescript',
      isLibrary: true,
      dependencies: {},
      devDependencies: {},
      peerDependencies: {},
      scripts: {},
      options: {
        name: 'my-lib',
      },
    });

    const packageJson = readPackageJsonContent(result.files['package.json']);
    expect(packageJson.version).toBe('0.1.0');
  });

  it('defaults workspace libraries to version 0.1.0', async () => {
    const result = renderPackageJson({
      name: '@scope/my-lib',
      baseTemplate: 'vanilla',
      language: 'typescript',
      isLibrary: true,
      dependencies: {},
      devDependencies: {},
      peerDependencies: {},
      scripts: {},
      options: {
        name: '@scope/my-lib',
        workspaceRoot: '../..',
      },
    });

    const packageJson = readPackageJsonContent(result.files['package.json']);
    expect(packageJson.version).toBe('0.1.0');
  });

  it('renders pnpm 11 workspace config for single-package projects', async () => {
    const result = renderPackageJson({
      name: 'my-app',
      baseTemplate: 'vanilla',
      language: 'typescript',
      isLibrary: false,
      dependencies: {},
      devDependencies: {},
      peerDependencies: {},
      scripts: {},
      options: {
        name: 'my-app',
        packageManager: { name: 'pnpm', version: '11.0.0' },
      },
    });

    expect(readTextFile(result.files['pnpm-workspace.yaml'])).toBe(`pmOnFail: download

allowBuilds:
  esbuild: true`);
  });

  it('adds the known @types/node fallback when versions have not been resolved', async () => {
    const result = renderPackageJson({
      name: 'my-app',
      baseTemplate: 'vanilla',
      language: 'javascript',
      isLibrary: false,
      dependencies: {},
      devDependencies: {},
      peerDependencies: {},
      scripts: {},
      options: {
        name: 'my-app',
        engine: { name: 'node', version: '25.1.0' },
      },
    });

    const packageJson = readPackageJsonContent(result.files['package.json']);
    expect(packageJson.devDependencies['@types/node']).toBe('^25.3.5');
    expect(packageJson.engines.node).toBe('>=25.0.0');
  });

  it('uses the known @types/node fallback instead of inventing an engine major', async () => {
    const result = renderPackageJson({
      name: 'my-app',
      baseTemplate: 'vanilla',
      language: 'javascript',
      isLibrary: false,
      dependencies: {},
      devDependencies: {},
      peerDependencies: {},
      scripts: {},
      options: {
        name: 'my-app',
        engine: { name: 'node', version: '26.1.0' },
      },
    });

    const packageJson = readPackageJsonContent(result.files['package.json']);
    expect(packageJson.devDependencies['@types/node']).not.toBe('^26.0.0');
    expect(packageJson.devDependencies['@types/node']).toBe('^25.3.5');
  });

  it('prefers explicit @types/node versions', async () => {
    const result = renderPackageJson({
      name: 'my-app',
      baseTemplate: 'vanilla',
      language: 'javascript',
      isLibrary: false,
      dependencies: {},
      devDependencies: {},
      peerDependencies: {},
      scripts: {},
      options: {
        name: 'my-app',
        engine: { name: 'node', version: '25.1.0' },
        versions: { '@types/node': '25.3.5' },
      },
    });

    const packageJson = readPackageJsonContent(result.files['package.json']);
    expect(packageJson.devDependencies['@types/node']).toBe('^25.3.5');
    expect(packageJson.engines.node).toBe('>=25.0.0');
  });

  it('uses the shared script registry for single-package defaults', async () => {
    const result = renderPackageJson({
      name: 'my-app',
      baseTemplate: 'vanilla',
      language: 'typescript',
      isLibrary: false,
      dependencies: {},
      devDependencies: {},
      peerDependencies: {},
      scripts: {},
      options: {
        name: 'my-app',
        packageManager: { name: 'pnpm', version: '10.0.0' },
      },
    });

    const packageJson = readPackageJsonContent(result.files['package.json']);
    expect(packageJson.scripts).toEqual({
      build: 'vite build',
      dev: 'vite',
      typecheck: 'tsc --build --noEmit',
      'typecheck:watch': 'tsc --build --watch',
    });
  });

  it('merges package scripts with shared defaults', async () => {
    const result = renderPackageJson({
      name: 'my-lib',
      baseTemplate: 'vanilla',
      language: 'typescript',
      isLibrary: true,
      dependencies: {},
      devDependencies: {},
      peerDependencies: {},
      scripts: {
        build: 'unbuild',
      },
      options: {
        name: 'my-lib',
        packageManager: { name: 'pnpm', version: '10.0.0' },
      },
    });

    const packageJson = readPackageJsonContent(result.files['package.json']);
    expect(packageJson.scripts).toEqual({
      build: 'unbuild',
      release: 'pnpm run build && pnpm publish',
      typecheck: 'tsc --build --noEmit',
      'typecheck:watch': 'tsc --build --watch',
    });
  });

  it('composes single-package scripts from the shared script registry', async () => {
    const { files } = await planProject({
      name: 'my-app',
      template: 'vanilla',
      testing: 'vitest',
      linter: 'eslint',
      formatter: 'prettier',
      packageManager: { name: 'pnpm', version: '10.0.0' },
      engine: { name: 'node', version: '25.1.0' },
      versions: {
        '@types/node': '25.3.5',
        eslint: '9.38.0',
        prettier: '3.8.1',
        typescript: '5.9.3',
        vite: '6.3.4',
        vitest: '4.0.18',
      },
    });

    const packageJson = readPackageJsonContent(files['package.json']);
    expect(packageJson.scripts).toEqual({
      build: 'vite build',
      dev: 'vite',
      format:
        'prettier --config .config/prettier.json --ignore-path .config/prettierignore --write .',
      lint: 'eslint --config .config/eslint.config.js .',
      test: 'vitest',
      typecheck: 'tsc --build --noEmit',
      'typecheck:watch': 'tsc --build --watch',
    });
  });

  it('adds React Compiler dev dependencies to TypeScript React apps by default', async () => {
    const { files } = await planProject({
      name: 'my-app',
      template: 'react',
      packageManager: { name: 'pnpm', version: '10.0.0' },
      engine: { name: 'node', version: '25.1.0' },
    });

    const packageJson = readPackageJsonContent(files['package.json']);
    expect(Object.keys(packageJson.devDependencies)).toEqual(
      expect.arrayContaining([
        '@babel/core',
        '@rolldown/plugin-babel',
        '@types/babel__core',
        '@vitejs/plugin-react',
        'babel-plugin-react-compiler',
        'eslint-plugin-react-hooks',
      ])
    );
  });

  it('adds React Compiler JS plugin rules to Oxlint React apps', async () => {
    const { files } = await planProject({
      name: 'my-app',
      template: 'react',
      linter: 'oxlint',
      packageManager: { name: 'pnpm', version: '10.0.0' },
      engine: { name: 'node', version: '25.1.0' },
    });

    const oxlintConfig = readPackageJsonContent(files['.config/oxlint.json']);
    expect(oxlintConfig.plugins).toContain('react');
    expect(oxlintConfig.jsPlugins).toEqual([
      {
        name: 'react-hooks-js',
        specifier: 'eslint-plugin-react-hooks',
      },
    ]);
    expect(oxlintConfig.rules['react-hooks-js/set-state-in-render']).toBe('error');
    expect(oxlintConfig.rules['react-hooks-js/rules-of-hooks']).toBeUndefined();
    expect(oxlintConfig.rules['react-hooks-js/exhaustive-deps']).toBeUndefined();
  });

  it('does not add React Compiler JS plugin rules to Oxlint React libraries', async () => {
    const { files } = await planProject({
      name: 'my-lib',
      projectType: 'library',
      template: 'react',
      linter: 'oxlint',
      packageManager: { name: 'pnpm', version: '10.0.0' },
      engine: { name: 'node', version: '25.1.0' },
    });

    const oxlintConfig = readPackageJsonContent(files['.config/oxlint.json']);
    expect(oxlintConfig.plugins).toContain('react');
    expect(oxlintConfig.jsPlugins).toBeUndefined();
    expect(oxlintConfig.rules['react-hooks-js/set-state-in-render']).toBeUndefined();
  });

  it('omits Babel core types for JavaScript React apps with React Compiler', async () => {
    const { files } = await planProject({
      name: 'my-app',
      template: 'react-js',
      packageManager: { name: 'pnpm', version: '10.0.0' },
      engine: { name: 'node', version: '25.1.0' },
    });

    const packageJson = readPackageJsonContent(files['package.json']);
    expect(packageJson.devDependencies['@babel/core']).toBeDefined();
    expect(packageJson.devDependencies['@types/babel__core']).toBeUndefined();
  });

  it('adds editorconfig to single-package workspaces', async () => {
    const { files } = await planProject({
      name: 'my-app',
      template: 'vanilla',
      formatter: 'prettier',
    });

    expect(files['.editorconfig']).toEqual({
      type: 'text',
      content: [
        'root = true',
        '',
        '[*]',
        'charset = utf-8',
        'end_of_line = lf',
        'insert_final_newline = true',
        `indent_style = ${formatterIndentStyle}`,
        `indent_size = ${formatterIndentSize}`,
        `tab_width = ${defaultFormatterMetaConfig.tabWidth}`,
        `max_line_length = ${defaultFormatterMetaConfig.printWidth}`,
      ].join('\n'),
    });
  });

  it('omits vscode files when single-package IDE is none', async () => {
    const { files } = await planProject({
      name: 'my-app',
      template: 'vanilla',
      formatter: 'prettier',
      ide: 'none',
    });

    expect(files['.editorconfig']).toBeDefined();
    expect(files['.vscode/settings.json']).toBeUndefined();
    expect(files['.vscode/extensions.json']).toBeUndefined();
  });

  it('uses the shared script registry for monorepo root scripts', async () => {
    const { files } = await planWorkspace({
      name: 'workspace',
      linter: 'oxlint',
      formatter: 'prettier',
      packageManager: { name: 'pnpm', version: '10.0.0' },
    });

    const packageJson = readPackageJsonContent(files['package.json']);
    expect(packageJson.scripts).toEqual({
      build: "pnpm --filter './packages/*' run build && pnpm --filter './apps/*' run build",
      dev: "pnpm --filter './apps/*' run dev",
      format:
        'prettier --config .config/prettier/base.json --ignore-path .config/prettier/prettierignore --write .',
      lint: 'oxlint .',
      test: 'pnpm -r run test',
    });
  });

  it('preformats monorepo config package json and js files', async () => {
    const workspaces = await Promise.all([
      planWorkspace({
        name: 'eslint-workspace',
        linter: 'eslint',
        formatter: 'prettier',
        packageManager: { name: 'pnpm', version: '10.0.0' },
      }),
      planWorkspace({
        name: 'oxlint-workspace',
        linter: 'oxlint',
        formatter: 'oxfmt',
        packageManager: { name: 'pnpm', version: '10.0.0' },
      }),
    ]);

    for (const { files } of workspaces) {
      await expectPreformattedFiles(
        files,
        (path) => path.startsWith('.config/') && /\.(json|js)$/.test(path)
      );
    }
  });

  it('preformats single-package json config files', async () => {
    const projects = await Promise.all([
      planProject({
        name: 'prettier-app',
        template: 'react',
        linter: 'oxlint',
        formatter: 'prettier',
      }),
      planProject({
        name: 'oxfmt-app',
        template: 'vanilla',
        linter: 'oxlint',
        formatter: 'oxfmt',
      }),
      planProject({
        name: 'biome-app',
        template: 'vanilla',
        linter: 'biome',
        formatter: 'biome',
      }),
    ]);

    const configPathPattern =
      /^(?:\.config\/.*\.json|\.vscode\/.*\.json|tsconfig.*\.json|package\.json|oxlint\.json|oxfmt\.json|biome\.json)$/;

    for (const { files } of projects) {
      await expectPreformattedFiles(files, (path) => configPathPattern.test(path));
    }
  });

  it('generates prettier ignore files for lock files', async () => {
    const { files: singlePackageFiles } = await planProject({
      name: 'my-app',
      template: 'vanilla',
      formatter: 'prettier',
    });
    const { files: monorepoFiles } = await planWorkspace({
      name: 'workspace',
      linter: 'oxlint',
      formatter: 'prettier',
      packageManager: { name: 'pnpm', version: '10.0.0' },
    });

    expect(singlePackageFiles['.config/prettierignore']).toEqual({
      type: 'text',
      content: [
        'dist/',
        '**/dist/',
        'package-lock.json',
        'npm-shrinkwrap.json',
        'pnpm-lock.yaml',
        'pnpm-lock.json',
        'yarn.lock',
        'bun.lock',
        'bun.lockb',
      ].join('\n'),
    });
    expect(monorepoFiles['.config/prettier/prettierignore']).toEqual(
      singlePackageFiles['.config/prettierignore']
    );
  });

  it('adds formatter ignore patterns to oxfmt configs', async () => {
    const { files: singlePackageFiles } = await planProject({
      name: 'my-app',
      template: 'vanilla',
      formatter: 'oxfmt',
    });
    const { files: monorepoFiles } = await planWorkspace({
      name: 'workspace',
      linter: 'oxlint',
      formatter: 'oxfmt',
      packageManager: { name: 'pnpm', version: '10.0.0' },
    });

    const expectedIgnorePatterns = [
      'dist/',
      '**/dist/',
      'package-lock.json',
      'npm-shrinkwrap.json',
      'pnpm-lock.yaml',
      'pnpm-lock.json',
      'yarn.lock',
      'bun.lock',
      'bun.lockb',
    ];
    const singlePackageConfig = JSON.parse(readTextFile(singlePackageFiles['.config/oxfmt.json']));
    const monorepoConfig = JSON.parse(readTextFile(monorepoFiles['.config/oxfmt/base.json']));

    expect(singlePackageConfig.ignorePatterns).toEqual(expectedIgnorePatterns);
    expect(monorepoConfig.ignorePatterns).toEqual(expectedIgnorePatterns);
  });

  it('adds editorconfig to monorepo roots', async () => {
    const { files } = await planWorkspace({
      name: 'workspace',
      linter: 'oxlint',
      formatter: 'prettier',
      packageManager: { name: 'pnpm', version: '10.0.0' },
    });

    expect(files['.editorconfig']).toBeDefined();
  });

  it('omits vscode files when monorepo IDE is none', async () => {
    const { files } = await planWorkspace({
      name: 'workspace',
      linter: 'oxlint',
      formatter: 'prettier',
      packageManager: { name: 'pnpm', version: '10.0.0' },
      ide: 'none',
    });

    expect(files['.editorconfig']).toBeDefined();
    expect(files['.vscode/settings.json']).toBeUndefined();
    expect(files['.vscode/extensions.json']).toBeUndefined();
  });

  it('adds typescript to generated TypeScript projects', async () => {
    const versions = {
      '@types/node': '25.3.5',
      oxlint: '1.51.0',
      'oxlint-tsgolint': '0.99.0',
      prettier: '3.8.1',
      typescript: '5.9.3',
      vite: '6.3.4',
    };

    const { files } = await planProject({
      name: 'my-app',
      template: 'vanilla',
      linter: 'oxlint',
      formatter: 'prettier',
      packageManager: { name: 'pnpm', version: '10.0.0' },
      engine: { name: 'node', version: '25.1.0' },
      versions,
    });

    const packageJson = readPackageJsonContent(files['package.json']);
    expect(packageJson.devDependencies.typescript).toBe(`^${versions.typescript}`);
    expect(packageJson.devDependencies['oxlint-tsgolint']).toBe(`^${versions['oxlint-tsgolint']}`);
  });

  it('adds oxlint type-aware support to monorepo roots', async () => {
    const { files } = await planWorkspace({
      name: 'workspace',
      linter: 'oxlint',
      formatter: 'prettier',
      packageManager: { name: 'pnpm', version: '10.0.0' },
      versions: {
        '@types/node': '25.3.5',
        oxlint: '1.51.0',
        'oxlint-tsgolint': '0.22.1',
        prettier: '3.8.1',
      },
    });

    const packageJson = readPackageJsonContent(files['package.json']);
    expect(packageJson.devDependencies['oxlint-tsgolint']).toBe('^0.22.1');

    const oxlintConfig = readPackageJsonContent(files['.config/oxlint/base.json']);
    expect(oxlintConfig.options).toEqual({ typeAware: true });
  });
});
