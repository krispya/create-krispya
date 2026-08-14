import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getTypescriptNodeConfigUpdates } from '../src/cli/update-core.js';
import { renderTypescriptConfigPackage } from '../src/plan/renderers/config-packages.js';
import { renderTypescriptConfig } from '../src/plan/renderers/typescript-config.js';
import type { VirtualFile } from '../src/types.js';

function readTextJson(file: VirtualFile | undefined): Record<string, unknown> {
  if (file?.type !== 'text') throw new Error('Expected a generated text file');
  return JSON.parse(file.content) as Record<string, unknown>;
}

function readTypes(file: VirtualFile | undefined): unknown {
  const config = readTextJson(file);
  const compilerOptions = config.compilerOptions as Record<string, unknown>;
  return compilerOptions.types;
}

function readCompilerOptions(file: VirtualFile | undefined): Record<string, unknown> {
  return readTextJson(file).compilerOptions as Record<string, unknown>;
}

describe('TypeScript Node configs', () => {
  let tempDir = '';

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = '';
    }
  });

  it('generates explicit Node types for standalone config strategies', () => {
    const stealth = renderTypescriptConfig({
      baseTemplate: 'vanilla',
      configStrategy: 'stealth',
    });
    const root = renderTypescriptConfig({
      baseTemplate: 'vanilla',
      configStrategy: 'root',
    });

    expect(readTypes(stealth.files['.config/tsconfig.node.json'])).toEqual(['node']);
    expect(readTypes(root.files['tsconfig.node.json'])).toEqual(['node']);
  });

  it('generates explicit Node types for the shared monorepo config', () => {
    const files: Record<string, VirtualFile> = {};
    renderTypescriptConfigPackage(files);

    expect(readTypes(files['.config/typescript/node.json'])).toEqual(['node']);
  });

  it('uses explicit TypeScript 7 defaults only for TypeScript 7 configs', () => {
    const typescript5 = renderTypescriptConfig({
      baseTemplate: 'vanilla',
      versions: { typescript: '5.9.3' },
    });
    const typescript7 = renderTypescriptConfig({
      baseTemplate: 'vanilla',
      versions: { typescript: '7.2.4' },
    });

    expect(readCompilerOptions(typescript5.files['.config/tsconfig.app.json'])).not.toHaveProperty(
      'types'
    );
    expect(readCompilerOptions(typescript7.files['.config/tsconfig.app.json'])).toMatchObject({
      types: [],
      noUncheckedSideEffectImports: true,
      libReplacement: false,
    });

    const sharedFiles: Record<string, VirtualFile> = {};
    renderTypescriptConfigPackage(sharedFiles, { typescript: '7.2.4' });
    expect(readCompilerOptions(sharedFiles['.config/typescript/base.json'])).toMatchObject({
      types: [],
      noUncheckedSideEffectImports: true,
      libReplacement: false,
    });
  });

  it('merges Node types into an existing generated config during update', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'create-krispya-tsconfig-node-'));
    await mkdir(join(tempDir, '.config'), { recursive: true });
    await writeFile(
      join(tempDir, '.config/tsconfig.node.json'),
      JSON.stringify(
        {
          compilerOptions: {
            strict: true,
            types: ['custom-environment'],
          },
          include: ['*.config.ts'],
        },
        null,
        2
      )
    );

    const changes = await getTypescriptNodeConfigUpdates(tempDir, {
      name: 'my-app',
      linter: 'oxlint',
      formatter: 'prettier',
      packageManager: 'pnpm',
      isMonorepo: false,
      configStrategy: 'stealth',
    });

    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      path: '.config/tsconfig.node.json',
      status: 'modified',
      mergeSafe: true,
    });
    expect(JSON.parse(changes[0]!.newContent)).toEqual({
      compilerOptions: {
        strict: true,
        types: ['custom-environment', 'node'],
      },
      include: ['*.config.ts'],
    });
  });
});
