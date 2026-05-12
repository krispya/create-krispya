import { describe, expect, it } from 'vitest';
import { planProject } from '../src/index.js';
import { defaultFormatterMetaConfig } from '../src/defaults/formatter.js';
import type { VirtualFile } from '../src/types.js';

const formatterIndent = defaultFormatterMetaConfig.useTabs
  ? '\t'
  : ' '.repeat(defaultFormatterMetaConfig.tabWidth);

function readTextFile(file: VirtualFile | undefined): string {
  if (file?.type !== 'text') {
    throw new Error('Expected generated file to be text');
  }

  return file.content;
}

describe('source file generation', () => {
  it('generates Vite-style TypeScript React app entry files', async () => {
    const { files } = await planProject({
      name: 'my-app',
      template: 'react',
    });

    expect(files['src/main.tsx']).toBeDefined();
    expect(files['src/index.tsx']).toBeUndefined();
    expect(files['src/index.css']).toBeDefined();
    expect(files['src/vite-env.d.ts']).toEqual({
      type: 'text',
      content: '/// <reference types="vite/client" />',
    });

    expect(readTextFile(files['src/main.tsx'])).toContain("import './index.css'");
    expect(readTextFile(files['index.html'])).toContain('./src/main.tsx');
  });

  it('generates preformatted Vite config files', async () => {
    const { files } = await planProject({
      name: 'my-app',
      template: 'react',
    });

    expect(readTextFile(files['vite.config.ts'])).toBe(
      [
        "import { defineConfig } from 'vite';",
        "import react, { reactCompilerPreset } from '@vitejs/plugin-react';",
        "import babel from '@rolldown/plugin-babel';",
        '',
        'export default defineConfig({',
        `${formatterIndent}base: './',`,
        `${formatterIndent}plugins: [react(), babel({ presets: [reactCompilerPreset()] })],`,
        '});',
        '',
      ].join('\n')
    );
  });

  it('generates JavaScript React app entry files without TypeScript env files', async () => {
    const { files } = await planProject({
      name: 'my-app',
      template: 'react-js',
    });

    expect(files['src/main.jsx']).toBeDefined();
    expect(files['src/app.jsx']).toBeDefined();
    expect(files['src/index.tsx']).toBeUndefined();
    expect(files['src/app.tsx']).toBeUndefined();
    expect(files['src/vite-env.d.ts']).toBeUndefined();

    expect(readTextFile(files['src/main.jsx'])).toContain("document.getElementById('root')");
    expect(readTextFile(files['src/main.jsx'])).not.toContain("document.getElementById('root')!");
    expect(readTextFile(files['index.html'])).toContain('./src/main.jsx');
  });

  it('generates vanilla app index css and Vite env types', async () => {
    const { files } = await planProject({
      name: 'my-app',
      template: 'vanilla',
    });

    expect(files['src/main.ts']).toBeDefined();
    expect(files['src/index.css']).toBeDefined();
    expect(files['src/style.css']).toBeUndefined();
    expect(files['src/vite-env.d.ts']).toBeDefined();

    expect(readTextFile(files['src/main.ts'])).toContain("import './index.css'");
    expect(readTextFile(files['src/index.css'])).toContain('box-sizing: border-box');
  });
});
