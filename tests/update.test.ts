import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  compareWithDisk,
  detectCurrentConfig,
  planExpectedFiles,
  getOxlintConfigReplacementUpdates,
  getPackageManagerConfigUpdates,
  getPackageJsonScriptUpdates,
  getWorkspaceConfigUpdates,
} from '../src/cli/update-core.js';
import {
  getPackageUpdateCommand,
  getPackageManagerMajorUpdateTarget,
  getRequiredNodeUpdateTarget,
} from '../src/cli/update.js';
import { defaultFormatterMetaConfig } from '../src/defaults/formatter.js';

const formatterIndentStyle = defaultFormatterMetaConfig.useTabs ? 'tab' : 'space';
const formatterIndentSize = defaultFormatterMetaConfig.useTabs
  ? 'tab'
  : String(defaultFormatterMetaConfig.tabWidth);
const formatterIndent = defaultFormatterMetaConfig.useTabs
  ? '\t'
  : ' '.repeat(defaultFormatterMetaConfig.tabWidth);

describe('update helpers', () => {
  function readTextJson(file: { type: 'text'; content: string } | { type: 'remote'; url: string }) {
    if (file.type !== 'text') {
      throw new Error('Expected generated file to be text');
    }

    return JSON.parse(file.content);
  }

  it('uses single-package root config for single-package updates', async () => {
    const expected = await planExpectedFiles({
      name: 'my-app',
      linter: 'oxlint',
      formatter: 'prettier',
      packageManager: 'pnpm',
      isMonorepo: false,
      configStrategy: 'stealth',
    });

    expect(expected['root-config']['.editorconfig']).toEqual({
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
    expect(expected['root-config']['.gitignore']).toEqual({
      type: 'text',
      content: [
        'node_modules',
        'dist',
        '*.tsbuildinfo',
        '.env',
        '.env.*',
        '!.env.example',
        '.pnpm-store',
      ].join('\n'),
    });
    expect(expected['root-config']['.config/prettierignore']).toEqual({
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
    expect(expected['config-packages']).toEqual({});
    expect(expected['workspace-config']).toEqual({});
  });

  it('detects package manager major updates', () => {
    expect(
      getPackageManagerMajorUpdateTarget(
        { name: 'pnpm', version: '10.30.3' },
        { name: 'pnpm', version: '11.2.0' }
      )
    ).toEqual({ name: 'pnpm', version: '11.2.0' });

    expect(
      getPackageManagerMajorUpdateTarget(
        { name: 'pnpm', version: '11.1.0' },
        { name: 'pnpm', version: '11.2.0' }
      )
    ).toBeUndefined();

    expect(
      getPackageManagerMajorUpdateTarget(
        { name: 'pnpm', version: '11.1.0' },
        { name: 'pnpm', version: '10.30.3' }
      )
    ).toBeUndefined();
  });

  it('detects node engine updates required by package managers', () => {
    expect(getRequiredNodeUpdateTarget('20.0.0', '22.13')).toBe('22.13');
    expect(getRequiredNodeUpdateTarget('22.13.0', '22.13')).toBeUndefined();
    expect(getRequiredNodeUpdateTarget(undefined, '22.13')).toBe('22.13');
    expect(getRequiredNodeUpdateTarget('22.13.0', undefined)).toBeUndefined();
  });

  it('updates packages when the pnpm major stays the same', () => {
    expect(
      getPackageUpdateCommand({
        name: 'workspace',
        linter: 'oxlint',
        formatter: 'prettier',
        packageManager: 'pnpm',
        packageManagerSpec: { name: 'pnpm', version: '11.1.0' },
        targetPackageManagerSpec: { name: 'pnpm', version: '11.2.0' },
        isMonorepo: true,
      })
    ).toMatchObject({
      command: 'pnpm',
      args: ['update'],
      displayCommand: 'pnpm update',
      promptMessage: 'Update packages?',
    });
  });

  it('installs dependencies after a pnpm major migration', () => {
    expect(
      getPackageUpdateCommand({
        name: 'workspace',
        linter: 'oxlint',
        formatter: 'prettier',
        packageManager: 'pnpm',
        packageManagerSpec: { name: 'pnpm', version: '10.30.3' },
        targetPackageManagerSpec: { name: 'pnpm', version: '11.2.0' },
        isMonorepo: true,
      })
    ).toMatchObject({
      command: 'pnpm',
      args: ['install'],
      displayCommand: 'pnpm install',
      promptMessage: 'Install dependencies?',
    });
  });

  it('includes Vite config in single-package app updates', async () => {
    const expected = await planExpectedFiles({
      name: 'my-app',
      linter: 'oxlint',
      formatter: 'prettier',
      packageManager: 'pnpm',
      isMonorepo: false,
      configStrategy: 'stealth',
      viteTemplate: 'react',
    });

    expect(expected['root-config']['vite.config.ts']).toEqual({
      type: 'text',
      content: [
        "import { defineConfig } from 'vite';",
        "import react, { reactCompilerPreset } from '@vitejs/plugin-react';",
        "import babel from '@rolldown/plugin-babel';",
        '',
        'export default defineConfig({',
        `${formatterIndent}base: './',`,
        `${formatterIndent}plugins: [react(), babel({ presets: [reactCompilerPreset()] })],`,
        '});',
        '',
      ].join('\n'),
    });
  });

  it('uses single-package VS Code config paths for single-package updates', async () => {
    const expected = await planExpectedFiles({
      name: 'my-app',
      linter: 'oxlint',
      formatter: 'prettier',
      packageManager: 'pnpm',
      isMonorepo: false,
      configStrategy: 'stealth',
    });

    const settings = readTextJson(expected.vscode['.vscode/settings.json']);

    expect(settings['oxc.configPath']).toBe('.config/oxlint.json');
    expect(settings['prettier.configPath']).toBe('.config/prettier.json');
    expect(settings['prettier.ignorePath']).toBe('.config/prettierignore');
  });

  it('compares generated JSON files by value instead of formatting', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'create-krispya-json-'));
    try {
      const expected = await planExpectedFiles({
        name: 'my-app',
        linter: 'oxlint',
        formatter: 'prettier',
        packageManager: 'pnpm',
        isMonorepo: false,
        configStrategy: 'stealth',
      });
      const settings = readTextJson(expected.vscode['.vscode/settings.json']!);
      const reversedSettings = Object.fromEntries(Object.entries(settings).reverse());

      await mkdir(join(tempDir, '.vscode'), { recursive: true });
      await writeFile(
        join(tempDir, '.vscode/settings.json'),
        `{
  // Existing user formatting should not matter.
${JSON.stringify(reversedSettings, null, 4).slice(2, -2)},
}
`
      );
      const categories = await compareWithDisk(expected, tempDir);
      const vscode = categories.find((category) => category.category === 'vscode');
      const settingsChange = vscode?.changes.find(
        (change) => change.path === '.vscode/settings.json'
      );

      expect(settingsChange?.status).toBe('unchanged');
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('splits AI file installs from existing AI file updates', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'create-krispya-ai-files-'));
    try {
      const expected = await planExpectedFiles({
        name: 'my-app',
        linter: 'oxlint',
        formatter: 'prettier',
        packageManager: 'pnpm',
        isMonorepo: false,
        configStrategy: 'stealth',
      });

      await writeFile(join(tempDir, 'AGENTS.md'), '# Custom agent notes\n');

      const categories = await compareWithDisk(expected, tempDir);
      const installCategory = categories.find((category) => category.category === 'ai-files-install');
      const updateCategory = categories.find((category) => category.category === 'ai-files-update');

      expect(categories.some((category) => category.category === 'ai-files')).toBe(false);
      expect(installCategory?.label).toBe('Install More AI Files');
      expect(installCategory?.changes).toEqual([
        expect.objectContaining({ path: 'CLAUDE.md', status: 'added' }),
      ]);
      expect(updateCategory?.label).toBe('Update Existing AI Files');
      expect(updateCategory?.changes).toEqual([
        expect.objectContaining({ path: 'AGENTS.md', status: 'modified' }),
      ]);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('regenerates single-package scripts with typecheck watch', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'create-krispya-scripts-'));
    try {
      await mkdir(join(tempDir, '.config'), { recursive: true });
      await writeFile(join(tempDir, '.config/tsconfig.app.json'), '{}');
      await writeFile(
        join(tempDir, 'package.json'),
        JSON.stringify(
          {
            name: 'my-app',
            type: 'module',
            scripts: {
              custom: 'echo custom',
              typecheck: 'tsc --noEmit',
            },
            devDependencies: {
              eslint: '^9.0.0',
              prettier: '^3.0.0',
              typescript: '^5.0.0',
              vite: '^6.0.0',
              vitest: '^4.0.0',
            },
          },
          null,
          2
        )
      );

      const changes = await getPackageJsonScriptUpdates(tempDir, {
        name: 'my-app',
        linter: 'eslint',
        formatter: 'prettier',
        packageManager: 'pnpm',
        isMonorepo: false,
        configStrategy: 'stealth',
      });

      expect(changes).toHaveLength(1);
      expect(changes[0]?.status).toBe('modified');

      const packageJson = JSON.parse(changes[0]!.newContent);
      expect(packageJson.scripts).toMatchObject({
        build: 'vite build',
        custom: 'echo custom',
        dev: 'vite',
        format:
          'prettier --config .config/prettier.json --ignore-path .config/prettierignore --write .',
        lint: 'eslint --config .config/eslint.config.js .',
        test: 'vitest',
        typecheck: 'tsc --build --noEmit',
        'typecheck:watch': 'tsc --build --watch',
      });
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('adds oxlint type-aware backend during single-package updates', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'create-krispya-oxlint-type-aware-'));
    try {
      await mkdir(join(tempDir, '.config'), { recursive: true });
      await writeFile(join(tempDir, '.config/tsconfig.app.json'), '{}');
      await writeFile(
        join(tempDir, 'package.json'),
        JSON.stringify(
          {
            name: 'my-app',
            type: 'module',
            scripts: {
              lint: 'oxlint -c .config/oxlint.json',
            },
            devDependencies: {
              oxlint: '^1.51.0',
              typescript: '^5.9.3',
            },
          },
          null,
          2
        )
      );

      const changes = await getPackageJsonScriptUpdates(tempDir, {
        name: 'my-app',
        linter: 'oxlint',
        formatter: 'prettier',
        packageManager: 'pnpm',
        isMonorepo: false,
        configStrategy: 'stealth',
      });

      expect(changes).toHaveLength(1);
      expect(changes[0]?.status).toBe('modified');

      const packageJson = JSON.parse(changes[0]!.newContent);
      expect(packageJson.devDependencies['oxlint-tsgolint']).toBe('^0.22.1');
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('offers React Compiler dependencies during single-package React updates', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'create-krispya-react-compiler-update-'));
    try {
      await mkdir(join(tempDir, '.config'), { recursive: true });
      await writeFile(join(tempDir, '.config/tsconfig.app.json'), '{}');
      await writeFile(
        join(tempDir, 'package.json'),
        JSON.stringify(
          {
            name: 'my-app',
            type: 'module',
            dependencies: {
              react: '^19.0.0',
              'react-dom': '^19.0.0',
            },
            devDependencies: {
              '@vitejs/plugin-react': '^6.0.0',
              typescript: '^5.9.0',
              vite: '^8.0.0',
            },
          },
          null,
          2
        )
      );

      const changes = await getPackageJsonScriptUpdates(tempDir, {
        name: 'my-app',
        linter: 'oxlint',
        formatter: 'prettier',
        packageManager: 'pnpm',
        isMonorepo: false,
        configStrategy: 'stealth',
        viteTemplate: 'react',
      });

      expect(changes).toHaveLength(1);
      expect(changes[0]?.status).toBe('modified');

      const packageJson = JSON.parse(changes[0]!.newContent);
      expect(Object.keys(packageJson.devDependencies)).toEqual(
        expect.arrayContaining([
          '@babel/core',
          '@rolldown/plugin-babel',
          '@types/babel__core',
          'babel-plugin-react-compiler',
          'eslint-plugin-react-hooks',
        ])
      );
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('offers oxlint config replacement during single-package updates', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'create-krispya-oxlint-config-'));
    try {
      await mkdir(join(tempDir, '.config'), { recursive: true });
      await writeFile(
        join(tempDir, '.config/oxlint.json'),
        JSON.stringify(
          {
            $schema: '../node_modules/oxlint/configuration_schema.json',
            plugins: ['unicorn', 'typescript', 'oxc'],
            rules: {
              'no-useless-escape': 'off',
            },
          },
          null,
          2
        )
      );

      const changes = await getOxlintConfigReplacementUpdates(tempDir, {
        name: 'my-app',
        linter: 'oxlint',
        formatter: 'prettier',
        packageManager: 'pnpm',
        isMonorepo: false,
        configStrategy: 'stealth',
      });

      expect(changes).toHaveLength(1);
      expect(changes[0]?.status).toBe('modified');

      const oxlintConfig = JSON.parse(changes[0]!.newContent);
      expect(oxlintConfig.options).toEqual({ typeAware: true });
      expect(oxlintConfig.ignorePatterns).toEqual(['dist']);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('offers React Compiler Oxlint JS plugin rules during single-package React updates', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'create-krispya-react-oxlint-config-'));
    try {
      await mkdir(join(tempDir, '.config'), { recursive: true });
      await writeFile(
        join(tempDir, '.config/oxlint.json'),
        JSON.stringify(
          {
            $schema: '../node_modules/oxlint/configuration_schema.json',
            plugins: ['unicorn', 'typescript', 'oxc', 'react'],
            rules: {
              'no-useless-escape': 'off',
            },
          },
          null,
          2
        )
      );

      const changes = await getOxlintConfigReplacementUpdates(tempDir, {
        name: 'my-app',
        linter: 'oxlint',
        formatter: 'prettier',
        packageManager: 'pnpm',
        isMonorepo: false,
        configStrategy: 'stealth',
        viteTemplate: 'react',
      });

      expect(changes).toHaveLength(1);
      expect(changes[0]?.status).toBe('modified');

      const oxlintConfig = JSON.parse(changes[0]!.newContent);
      expect(oxlintConfig.jsPlugins).toEqual([
        {
          name: 'react-hooks-js',
          specifier: 'eslint-plugin-react-hooks',
        },
      ]);
      expect(oxlintConfig.rules['react-hooks-js/set-state-in-render']).toBe('error');
      expect(oxlintConfig.rules['react-hooks-js/rules-of-hooks']).toBeUndefined();
      expect(oxlintConfig.rules['react-hooks-js/exhaustive-deps']).toBeUndefined();
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('uses workspace root config for monorepo updates', async () => {
    const expected = await planExpectedFiles({
      name: 'workspace',
      linter: 'oxlint',
      formatter: 'prettier',
      packageManager: 'pnpm',
      isMonorepo: true,
    });

    expect(expected['root-config']['.gitignore']).toEqual({
      type: 'text',
      content: [
        'node_modules',
        'dist',
        '*.tsbuildinfo',
        '.env',
        '.env.*',
        '!.env.example',
        '.pnpm-store',
        '.DS_Store',
      ].join('\n'),
    });
    expect(expected['config-packages']['.config/typescript/package.json']).toBeDefined();
    expect(expected['config-packages']['.config/prettier/prettierignore']).toEqual({
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

    const settings = readTextJson(expected.vscode['.vscode/settings.json']);
    expect(settings['oxc.configPath']).toBeUndefined();
    expect(settings['prettier.configPath']).toBeUndefined();
  });

  it('migrates package manager fields from pnpm 10 to pnpm 11', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'create-krispya-pnpm-11-'));
    try {
      await writeFile(
        join(tempDir, 'package.json'),
        JSON.stringify(
          {
            name: 'workspace',
            packageManager: 'pnpm@10.30.3',
            engines: {
              node: '>=20.0.0',
              pnpm: '>=10.0.0',
            },
            scripts: {
              build: "pnpm --filter './packages/*' run build && pnpm --filter './apps/*' run build",
              dev: "pnpm --filter './apps/*' run dev",
              test: 'pnpm -r run test',
              lint: 'oxlint -c .config/oxlint.json',
              format:
                'prettier --config .config/prettier.json --ignore-path .config/prettierignore --write .',
            },
          },
          null,
          2
        )
      );
      await writeFile(
        join(tempDir, 'pnpm-workspace.yaml'),
        [
          'manage-package-manager-versions: true',
          '',
          'packages:',
          '  - ".config/*"',
          '  - "apps/*"',
          '  - "packages/*"',
          '  - "examples/*"',
          '',
          'onlyBuiltDependencies:',
          '  - esbuild',
          '  - @swc/core',
          '  - sharp',
          '',
        ].join('\n')
      );

      const config = {
        name: 'workspace',
        linter: 'oxlint' as const,
        formatter: 'prettier' as const,
        packageManager: 'pnpm',
        packageManagerSpec: { name: 'pnpm' as const, version: '10.30.3' },
        targetPackageManagerSpec: { name: 'pnpm' as const, version: '11.2.0' },
        targetNodeVersion: '22.13',
        isMonorepo: true,
      };

      const [packageJsonChange] = await getPackageManagerConfigUpdates(tempDir, config);
      const packageJson = JSON.parse(packageJsonChange!.newContent);
      expect(packageJson.packageManager).toBe('pnpm@11.2.0');
      expect(packageJson.engines.node).toBe('>=22.13');
      expect(packageJson.engines.pnpm).toBe('>=11.0.0');

      const [workspaceChange] = await getWorkspaceConfigUpdates(tempDir, config);
      expect(workspaceChange!.newContent).toContain('pmOnFail: download');
      expect(workspaceChange!.newContent).toContain('allowBuilds:\n  esbuild: true');
      expect(workspaceChange!.newContent).toContain('  "@swc/core": true');
      expect(workspaceChange!.newContent).toContain('  sharp: true');
      expect(workspaceChange!.newContent).toContain('  - "examples/*"');
      expect(workspaceChange!.newContent).not.toContain('manage-package-manager-versions');
      expect(workspaceChange!.newContent).not.toContain('onlyBuiltDependencies');
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('migrates package manager fields from pnpm 11 to pnpm 10', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'create-krispya-pnpm-10-'));
    try {
      await writeFile(
        join(tempDir, 'package.json'),
        JSON.stringify(
          {
            name: 'workspace',
            packageManager: 'pnpm@11.2.0',
            engines: {
              pnpm: '>=11.0.0',
            },
            scripts: {
              build: "pnpm --filter './packages/*' run build && pnpm --filter './apps/*' run build",
              dev: "pnpm --filter './apps/*' run dev",
              test: 'pnpm -r run test',
              lint: 'oxlint -c .config/oxlint.json',
              format:
                'prettier --config .config/prettier.json --ignore-path .config/prettierignore --write .',
            },
          },
          null,
          2
        )
      );
      await writeFile(
        join(tempDir, 'pnpm-workspace.yaml'),
        [
          'pmOnFail: download',
          '',
          'packages:',
          '  - ".config/*"',
          '  - "apps/*"',
          '  - "packages/*"',
          '  - "examples/*"',
          '',
          'allowBuilds:',
          '  esbuild: true',
          '  sharp: true',
          '  untrusted-package: false',
          '',
        ].join('\n')
      );

      const config = {
        name: 'workspace',
        linter: 'oxlint' as const,
        formatter: 'prettier' as const,
        packageManager: 'pnpm',
        packageManagerSpec: { name: 'pnpm' as const, version: '11.2.0' },
        targetPackageManagerSpec: { name: 'pnpm' as const, version: '10.30.3' },
        isMonorepo: true,
      };

      const [packageJsonChange] = await getPackageManagerConfigUpdates(tempDir, config);
      const packageJson = JSON.parse(packageJsonChange!.newContent);
      expect(packageJson.packageManager).toBe('pnpm@10.30.3');
      expect(packageJson.engines.pnpm).toBe('>=10.0.0');

      const [workspaceChange] = await getWorkspaceConfigUpdates(tempDir, config);
      expect(workspaceChange!.newContent).toContain('manage-package-manager-versions: true');
      expect(workspaceChange!.newContent).toContain('onlyBuiltDependencies:\n  - esbuild');
      expect(workspaceChange!.newContent).toContain('  - sharp');
      expect(workspaceChange!.newContent).toContain('  - "examples/*"');
      expect(workspaceChange!.newContent).not.toContain('pmOnFail');
      expect(workspaceChange!.newContent).not.toContain('allowBuilds');
      expect(workspaceChange!.newContent).not.toContain('untrusted-package');
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('repairs mixed pnpm workspace config when targeting pnpm 11', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'create-krispya-pnpm-11-workspace-'));
    try {
      await writeFile(
        join(tempDir, 'pnpm-workspace.yaml'),
        [
          'allowBuilds:',
          '  esbuild: set this to true or false',
          '',
          'manage-package-manager-versions: true',
          '',
          'packages:',
          '  - "examples/*"',
          '',
          'onlyBuiltDependencies:',
          '  - esbuild',
          '  - sharp',
          '',
        ].join('\n')
      );

      const [workspaceChange] = await getWorkspaceConfigUpdates(tempDir, {
        name: 'workspace',
        linter: 'oxlint',
        formatter: 'prettier',
        packageManager: 'pnpm',
        packageManagerSpec: { name: 'pnpm', version: '10.30.3' },
        targetPackageManagerSpec: { name: 'pnpm', version: '11.2.0' },
        isMonorepo: false,
      });

      expect(workspaceChange!.newContent).toContain('pmOnFail: download');
      expect(workspaceChange!.newContent).toContain('allowBuilds:\n  esbuild: true');
      expect(workspaceChange!.newContent).toContain('  sharp: true');
      expect(workspaceChange!.newContent).toContain('  - "examples/*"');
      expect(workspaceChange!.newContent).not.toContain('  - ".config/*"');
      expect(workspaceChange!.newContent).not.toContain('  - "apps/*"');
      expect(workspaceChange!.newContent).not.toContain('  - "packages/*"');
      expect(workspaceChange!.newContent).not.toContain('set this to true or false');
      expect(workspaceChange!.newContent).not.toContain('manage-package-manager-versions');
      expect(workspaceChange!.newContent).not.toContain('onlyBuiltDependencies');
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});

describe('detectCurrentConfig', () => {
  let tempDir = '';

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = '';
    }
  });

  it('detects single-package package manager and config strategy', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'create-krispya-update-'));
    await mkdir(join(tempDir, '.config'), { recursive: true });
    await writeFile(
      join(tempDir, 'package.json'),
      JSON.stringify({
        name: 'my-app',
        packageManager: 'npm@11.0.0',
      })
    );
    await writeFile(join(tempDir, '.config/tsconfig.app.json'), '{}');

    const config = await detectCurrentConfig(tempDir, false);

    expect(config).toMatchObject({
      name: 'my-app',
      packageManager: 'npm',
      isMonorepo: false,
      configStrategy: 'stealth',
    });
  });

  it('detects Vite React app updates from package dependencies', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'create-krispya-update-vite-'));
    await writeFile(
      join(tempDir, 'package.json'),
      JSON.stringify({
        name: 'my-app',
        dependencies: {
          '@vitejs/plugin-react': '^5.0.0',
          react: '^19.0.0',
          vite: '^6.0.0',
        },
      })
    );

    const config = await detectCurrentConfig(tempDir, false);

    expect(config.viteTemplate).toBe('react');
  });
});
