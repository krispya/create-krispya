import { describe, expect, it } from 'vitest';
import { defaultFormatterMetaConfig } from '../src/intent/defaults/formatter.js';
import { renderVscodeFiles } from '../src/plan/renderers/vscode.js';

function readJsonFile(file: { type: 'text'; content: string } | { type: 'remote'; url: string }) {
  if (file.type !== 'text') {
    throw new Error('Expected generated VS Code file to be text');
  }

  return JSON.parse(file.content);
}

describe('renderVscodeFiles', () => {
  it('adds default explorer nesting settings', () => {
    const files = renderVscodeFiles({});
    const settings = readJsonFile(files['.vscode/settings.json']);

    expect(settings['explorer.fileNesting.enabled']).toBe(true);
    expect(settings['explorer.fileNesting.expand']).toBe(false);
    expect(settings['explorer.fileNesting.patterns']).toEqual({
      '.gitignore': '.gitattributes',
      'AGENTS.md': 'CLAUDE.md',
    });
  });

  it('nests pnpm lock and workspace files under package.json', () => {
    const files = renderVscodeFiles({ packageManager: 'pnpm' });
    const settings = readJsonFile(files['.vscode/settings.json']);

    expect(settings['explorer.fileNesting.patterns']).toEqual({
      '.gitignore': '.gitattributes',
      'AGENTS.md': 'CLAUDE.md',
      'package.json': 'pnpm-lock.yaml, pnpm-workspace.yaml',
    });
  });

  it('nests npm lock files under package.json', () => {
    const files = renderVscodeFiles({ packageManager: 'npm' });
    const settings = readJsonFile(files['.vscode/settings.json']);

    expect(settings['explorer.fileNesting.patterns']).toEqual({
      '.gitignore': '.gitattributes',
      'AGENTS.md': 'CLAUDE.md',
      'package.json': 'package-lock.json, npm-shrinkwrap.json',
    });
  });

  it('nests yarn lock files under package.json', () => {
    const files = renderVscodeFiles({ packageManager: 'yarn' });
    const settings = readJsonFile(files['.vscode/settings.json']);

    expect(settings['explorer.fileNesting.patterns']).toEqual({
      '.gitignore': '.gitattributes',
      'AGENTS.md': 'CLAUDE.md',
      'package.json': 'yarn.lock',
    });
  });

  it('adds editor settings that match formatter defaults', () => {
    const files = renderVscodeFiles({});
    const settings = readJsonFile(files['.vscode/settings.json']);

    expect(settings['editor.detectIndentation']).toBe(false);
    expect(settings['editor.insertSpaces']).toBe(!defaultFormatterMetaConfig.useTabs);
    expect(settings['editor.tabSize']).toBe(defaultFormatterMetaConfig.tabWidth);
    expect(settings['files.eol']).toBe('\n');
    expect(settings['files.insertFinalNewline']).toBe(true);
    expect(settings['editor.formatOnSave']).toBeUndefined();
  });

  it('resolves single-package linter and formatter settings centrally', () => {
    const files = renderVscodeFiles({
      linter: 'oxlint',
      formatter: 'prettier',
      configStrategy: 'stealth',
    });
    const settings = readJsonFile(files['.vscode/settings.json']);
    const extensions = readJsonFile(files['.vscode/extensions.json']);

    expect(settings['oxc.enable']).toBe(true);
    expect(settings['eslint.enable']).toBe(false);
    expect(settings['biome.enabled']).toBe(false);
    expect(settings['oxc.configPath']).toBe('.config/oxlint.json');
    expect(settings['editor.defaultFormatter']).toBe('esbenp.prettier-vscode');
    expect(settings['editor.formatOnSave']).toBe(true);
    expect(settings['prettier.configPath']).toBe('.config/prettier.json');
    expect(settings['prettier.ignorePath']).toBe('.config/prettierignore');
    expect(extensions.recommendations).toEqual(['oxc.oxc-vscode', 'esbenp.prettier-vscode']);
    expect(files['.vscode/extensions.json']).toEqual({
      type: 'text',
      content: `{
  "recommendations": ["oxc.oxc-vscode", "esbenp.prettier-vscode"]
}
`,
    });
  });

  it('lets biome formatter override lint extension toggles', () => {
    const files = renderVscodeFiles({
      linter: 'eslint',
      formatter: 'biome',
      configStrategy: 'stealth',
    });
    const settings = readJsonFile(files['.vscode/settings.json']);

    expect(settings['eslint.options']).toEqual({
      overrideConfigFile: '.config/eslint.config.js',
    });
    expect(settings['eslint.enable']).toBe(false);
    expect(settings['oxc.enable']).toBe(false);
    expect(settings['biome.enabled']).toBe(true);
    expect(settings['biome.linter.configPath']).toBe('.config/biome.json');
    expect(settings['editor.defaultFormatter']).toBe('biomejs.biome');
    expect(settings['editor.formatOnSave']).toBe(true);
  });

  it('uses the same shared formatter settings for monorepos', () => {
    const files = renderVscodeFiles({
      linter: 'oxlint',
      formatter: 'oxfmt',
      isMonorepo: true,
    });
    const settings = readJsonFile(files['.vscode/settings.json']);

    expect(settings['editor.defaultFormatter']).toBe('oxc.oxc-vscode');
    expect(settings['editor.formatOnSave']).toBe(true);
    expect(settings['[markdown]']).toEqual({
      'editor.defaultFormatter': 'vscode.markdown-language-features',
    });
    expect(settings['[yaml]']).toEqual({
      'editor.defaultFormatter': 'redhat.vscode-yaml',
    });
    expect(settings['oxc.configPath']).toBeUndefined();
    expect(settings['oxc.fmt.configPath']).toBeUndefined();
  });
});
