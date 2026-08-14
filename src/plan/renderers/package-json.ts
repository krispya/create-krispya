import { formatNodeTypesVersion } from '../../intent/package-versions.js';
import { LIBRARY_BUILD_OUTPUT } from '../defaults/library.js';
import { getEngineName, getEngineSpec } from '../../intent/engine.js';
import { getSemverMajorString } from '../../utils/index.js';
import {
  formatPackageManager,
  getPackageManagerProfile,
  getPackageManagerSpec,
} from '../../intent/package-manager/index.js';
import { renderPnpmWorkspaceConfig } from './pnpm-workspace-config.js';
import type { BaseTemplate, VirtualFile, ProjectOptions } from '../../types.js';
import { renderJson } from './json.js';
import { mergePackageJsonScripts, resolveDefaultPackageJsonScripts } from './package-json-scripts.js';

const DEFAULT_LIBRARY_VERSION = '0.1.0';

export type PackageJsonResult = {
  files: Record<string, VirtualFile>;
};

export type PackageJsonParams = {
  name: string;
  baseTemplate: BaseTemplate;
  language: 'javascript' | 'typescript';
  isLibrary: boolean;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  peerDependencies: Record<string, string>;
  scripts: Record<string, string>;
  options: ProjectOptions;
  /** Workspace package names to add as dependencies (for monorepo apps) */
  workspaceDependencies?: string[];
};

/**
 * Generates package.json and related package manager files.
 */
export function renderPackageJson(params: PackageJsonParams): PackageJsonResult {
  const {
    name,
    language,
    isLibrary,
    dependencies,
    devDependencies,
    peerDependencies,
    options,
    workspaceDependencies,
  } = params;

  const files: Record<string, VirtualFile> = {};
  const packageManager = getPackageManagerSpec(options.packageManager);
  const isPnpm = packageManager.name === 'pnpm';
  const resolvedScripts = mergePackageJsonScripts(
    resolveDefaultPackageJsonScripts({
      language,
      isLibrary,
      packageManagerName: packageManager.name,
    }),
    params.scripts
  );

  const packageJson: Record<string, unknown> = {
    name,
    description: 'Built with 🌹 create-krispya',
    type: 'module',
  };

  // Add library-specific fields (ESM-first)
  if (isLibrary) {
    packageJson.version = DEFAULT_LIBRARY_VERSION;
    packageJson.main = LIBRARY_BUILD_OUTPUT.main;
    packageJson.module = LIBRARY_BUILD_OUTPUT.module;
    if (language === 'typescript') {
      packageJson.types = LIBRARY_BUILD_OUTPUT.types;
    }
    packageJson.exports = {
      '.': {
        ...(language === 'typescript' && { types: LIBRARY_BUILD_OUTPUT.types }),
        import: LIBRARY_BUILD_OUTPUT.import,
        require: LIBRARY_BUILD_OUTPUT.require,
      },
    };
    packageJson.files = [LIBRARY_BUILD_OUTPUT.directory];
  }

  // Helper to sort object keys alphabetically
  const sortKeys = <T extends Record<string, string>>(obj: T): T =>
    Object.fromEntries(Object.entries(obj).sort(([a], [b]) => a.localeCompare(b))) as T;

  // Add workspace dependencies (monorepo packages)
  const allDependencies = { ...dependencies };
  if (workspaceDependencies && workspaceDependencies.length > 0) {
    for (const pkgName of workspaceDependencies) {
      allDependencies[pkgName] = 'workspace:*';
    }
  }

  const allDevDependencies = { ...devDependencies };
  const engine = getEngineSpec(options.engine);
  if (getEngineName(engine) === 'node' && engine.version) {
    allDevDependencies['@types/node'] ??= formatNodeTypesVersion(options.versions, options.engine);
  }

  packageJson.scripts = resolvedScripts;
  packageJson.dependencies = sortKeys(allDependencies);

  if (Object.keys(allDevDependencies).length > 0) {
    packageJson.devDependencies = sortKeys(allDevDependencies);
  }

  if (isLibrary && Object.keys(peerDependencies).length > 0) {
    packageJson.peerDependencies = sortKeys(peerDependencies);
  }

  // Add packageManager and engines fields (skip for monorepo sub-packages - use root config)
  const isMonorepoPackage = options.workspaceRoot != null;
  if (!isMonorepoPackage) {
    const engines: Record<string, string> = {};

    if (packageManager.version != null) {
      const majorVersion = getSemverMajorString(packageManager.version);
      engines[packageManager.name] = `>=${majorVersion}.0.0`;
      packageJson.packageManager = formatPackageManager(packageManager);
    }

    if (engine.version != null) {
      const majorVersion = getSemverMajorString(engine.version);
      engines[engine.name] = `>=${majorVersion}.0.0`;
    }

    if (Object.keys(engines).length > 0) {
      packageJson.engines = engines;
    }
  }

  files['package.json'] = {
    type: 'text',
    content: renderJson(packageJson, { inlineArrays: false }),
  };

  // Add pnpm-workspace.yaml when pnpm is selected (but not in a workspace package)
  if (isPnpm && !options.workspaceRoot) {
    files['pnpm-workspace.yaml'] = {
      type: 'text',
      content: renderPnpmWorkspaceConfig({
        profile: getPackageManagerProfile(packageManager),
        manageVersions: options.pnpmManageVersions ?? true,
      }),
    };
  }

  return { files };
}
