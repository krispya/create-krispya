import { constants } from 'node:fs';
import { access, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { cwd } from 'node:process';

import { detectTooling, parseWorkspaceYamlContent } from '../index.js';
import { parseEngine, parsePackageManager } from '../package-versions.js';
import type { EngineSpec, PackageManagerSpec } from '../types.js';

export type InheritedWorkspaceSettings = {
  linter?: 'oxlint' | 'eslint' | 'biome';
  formatter?: 'oxfmt' | 'prettier' | 'biome';
  packageManager?: PackageManagerSpec;
  engine?: EngineSpec;
  pnpmManageVersions?: boolean;
};

export type ExistingConfigs = {
  linter?: 'oxlint' | 'eslint' | 'biome';
  formatter?: 'prettier' | 'biome';
  eslintConfigPath?: string;
  prettierConfigPath?: string;
  biomeConfigPath?: string;
};

export async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export function calculateWorkspaceRoot(packagePath: string): string {
  const segments = packagePath.split(/[/\\]/).filter(Boolean);
  return segments.map(() => '..').join('/');
}

export async function detectMonorepoRoot(): Promise<string | null> {
  let currentDir = cwd();
  const root = resolve('/');

  while (currentDir !== root) {
    const workspaceFile = join(currentDir, 'pnpm-workspace.yaml');
    try {
      await access(workspaceFile, constants.F_OK);
      const content = await readFile(workspaceFile, 'utf-8');
      if (content.includes('packages:')) {
        return currentDir;
      }
    } catch {
      // File doesn't exist, continue.
    }
    currentDir = dirname(currentDir);
  }

  return null;
}

export async function detectPackageRoot(): Promise<string | null> {
  let currentDir = cwd();
  const root = resolve('/');

  while (currentDir !== root) {
    if (await fileExists(join(currentDir, 'package.json'))) {
      return currentDir;
    }
    currentDir = dirname(currentDir);
  }

  return (await fileExists(join(root, 'package.json'))) ? root : null;
}

export async function parseWorkspaceDirectories(monorepoRoot: string): Promise<string[]> {
  try {
    const workspaceFile = join(monorepoRoot, 'pnpm-workspace.yaml');
    const content = await readFile(workspaceFile, 'utf-8');
    return parseWorkspaceYamlContent(content);
  } catch {
    return [];
  }
}

export async function detectWorkspaceSettings(
  monorepoRoot: string
): Promise<InheritedWorkspaceSettings> {
  try {
    const tooling = await detectTooling(monorepoRoot);

    const pkgPath = join(monorepoRoot, 'package.json');
    const content = await readFile(pkgPath, 'utf-8');
    const pkgJson = JSON.parse(content) as {
      packageManager?: string;
      engines?: Record<string, string>;
    };

    const packageManager = parsePackageManager(pkgJson.packageManager);
    const engine = parseEngine(pkgJson.engines);

    let pnpmManageVersions: boolean | undefined;
    try {
      const workspaceFile = join(monorepoRoot, 'pnpm-workspace.yaml');
      const workspaceContent = await readFile(workspaceFile, 'utf-8');
      pnpmManageVersions = workspaceContent.includes('manage-package-manager-versions: true');
    } catch {
      // pnpm-workspace.yaml doesn't exist or can't be read.
    }

    return {
      linter: tooling.linter,
      formatter: tooling.formatter,
      packageManager,
      engine,
      pnpmManageVersions,
    };
  } catch {
    return {};
  }
}

export async function detectExistingConfigs(monorepoRoot: string): Promise<ExistingConfigs> {
  const configs: ExistingConfigs = {};

  const eslintPath = join(monorepoRoot, 'eslint.config.js');
  if (await fileExists(eslintPath)) {
    configs.linter = 'eslint';
    configs.eslintConfigPath = eslintPath;
  }

  const prettierPath = join(monorepoRoot, '.prettierrc.json');
  if (await fileExists(prettierPath)) {
    configs.formatter = 'prettier';
    configs.prettierConfigPath = prettierPath;
  }

  const biomePath = join(monorepoRoot, 'biome.json');
  if (await fileExists(biomePath)) {
    configs.biomeConfigPath = biomePath;
    if (!configs.linter) configs.linter = 'biome';
    if (!configs.formatter) configs.formatter = 'biome';
  }

  return configs;
}

export async function getMonorepoScope(monorepoRoot: string): Promise<string> {
  try {
    const pkgPath = join(monorepoRoot, 'package.json');
    const content = await readFile(pkgPath, 'utf-8');
    const pkgJson = JSON.parse(content) as { name?: string };
    if (pkgJson.name) {
      return pkgJson.name.replace(/^@/, '').replace(/\/.*$/, '');
    }
  } catch {
    // Fall through to directory name.
  }
  return monorepoRoot.split(/[/\\]/).pop() ?? 'workspace';
}

export async function getWorkspacePackages(monorepoRoot: string): Promise<string[]> {
  const packagesDir = join(monorepoRoot, 'packages');

  try {
    const entries = await readdir(packagesDir, { withFileTypes: true });
    const names: string[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      try {
        const content = await readFile(join(packagesDir, entry.name, 'package.json'), 'utf-8');
        const pkg = JSON.parse(content) as { name?: string };
        if (pkg.name) names.push(pkg.name);
      } catch {
        // No package.json or invalid, skip.
      }
    }

    return names;
  } catch {
    return [];
  }
}

export async function ensureConfigInWorkspace(monorepoRoot: string): Promise<void> {
  const workspacePath = join(monorepoRoot, 'pnpm-workspace.yaml');

  let content: string;
  try {
    content = await readFile(workspacePath, 'utf-8');
  } catch {
    content = `packages:
  - '.config/*'
  - 'packages/*'
`;
    await writeFile(workspacePath, content);
    return;
  }

  if (content.includes('.config/*')) {
    return;
  }

  const lines = content.split('\n');
  const packagesIndex = lines.findIndex((line) => line.trim().startsWith('packages:'));

  if (packagesIndex === -1) {
    content = `packages:
  - '.config/*'
${content}`;
  } else {
    lines.splice(packagesIndex + 1, 0, "  - '.config/*'");
    content = lines.join('\n');
  }

  await writeFile(workspacePath, content);
}
