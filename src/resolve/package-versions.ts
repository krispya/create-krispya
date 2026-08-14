import type { EngineSpec, Formatter, Linter, PackageVersions, ProjectOptions } from '../types.js';
import { getBaseTemplate, getLanguageFromTemplate, shouldEnableReactCompiler } from '../types.js';
import { getLibraryBundler } from '../intent/bundlers.js';
import { getEngineName, getEngineSpec } from '../intent/engine.js';
import { getPackageManagerName } from '../intent/package-manager/index.js';
import { getPackageFallbackVersion } from '../intent/package-versions.js';
import { getSemverMajorString } from '../utils/index.js';
import {
  getLatestNodeVersion,
  getLatestNpmMajorVersionAtOrBelow,
  getLatestNpmVersion,
} from './registry.js';

function addPackageName(
  packageNames: Set<string>,
  explicitVersions: Set<string>,
  packageName: string
): void {
  if (!explicitVersions.has(packageName)) {
    packageNames.add(packageName);
  }
}

function getExplicitVersionPackages(options: ProjectOptions): Set<string> {
  return new Set([
    ...Object.keys(options.dependencies ?? {}),
    ...Object.keys(options.versions ?? {}),
  ]);
}

async function resolveNodeTypesVersion(
  engine?: EngineSpec,
  versions: PackageVersions = {}
): Promise<string | undefined> {
  if (versions['@types/node'] != null) {
    return versions['@types/node'];
  }

  const engineSpec = getEngineSpec(engine);
  if (engineSpec.name !== 'node') {
    return undefined;
  }

  const nodeVersion = engineSpec.version ?? (await getLatestNodeVersion());
  const majorVersion = getSemverMajorString(nodeVersion);
  return getLatestNpmMajorVersionAtOrBelow(
    '@types/node',
    majorVersion,
    getPackageFallbackVersion('@types/node')
  );
}

export async function resolvePackageVersions(
  packageNames: Iterable<string>,
  existingVersions: PackageVersions = {}
): Promise<PackageVersions> {
  const versions: PackageVersions = { ...existingVersions };
  const uniquePackageNames = [...new Set(packageNames)];

  await Promise.all(
    uniquePackageNames.map(async (packageName) => {
      if (versions[packageName] != null) return;

      versions[packageName] = await getLatestNpmVersion(
        packageName,
        getPackageFallbackVersion(packageName)
      );
    })
  );

  return versions;
}

export async function resolveProjectPackageVersions(
  options: ProjectOptions
): Promise<PackageVersions> {
  const packageNames = collectProjectPackageNames(options);
  const versions = await resolvePackageVersions(
    packageNames.filter((packageName) => packageName !== '@types/node'),
    options.versions
  );
  const nodeTypesVersion = await resolveNodeTypesVersion(options.engine, versions);

  if (nodeTypesVersion != null) {
    versions['@types/node'] = nodeTypesVersion;
  }

  return versions;
}

export async function resolveMonorepoRootPackageVersions(params: {
  linter: Linter;
  formatter: Formatter;
  engine?: EngineSpec;
  versions?: PackageVersions;
}): Promise<PackageVersions> {
  const packageNames = new Set<string>();
  const explicitVersions = new Set(Object.keys(params.versions ?? {}));
  addPackageName(packageNames, explicitVersions, getLinterPackage(params.linter));
  if (params.linter === 'oxlint') {
    addPackageName(packageNames, explicitVersions, 'oxlint-tsgolint');
  }
  if (params.formatter !== 'biome' || params.linter !== 'biome') {
    addPackageName(packageNames, explicitVersions, getFormatterPackage(params.formatter));
  }
  const versions = await resolvePackageVersions(packageNames, params.versions);
  const nodeTypesVersion = await resolveNodeTypesVersion(params.engine, versions);

  if (nodeTypesVersion != null) {
    versions['@types/node'] = nodeTypesVersion;
  }

  return versions;
}

function collectProjectPackageNames(options: ProjectOptions): string[] {
  const packageNames = new Set<string>();
  const explicitVersions = getExplicitVersionPackages(options);
  const template = options.template ?? 'vanilla';
  const baseTemplate = getBaseTemplate(template);
  const language = getLanguageFromTemplate(template);
  const isLibrary = options.projectType === 'library';
  const isReact = baseTemplate === 'react' || baseTemplate === 'r3f';
  const isR3f = baseTemplate === 'r3f';
  const isTypescript = language === 'typescript';
  const useReactCompiler = shouldEnableReactCompiler(options);
  const inWorkspace = options.workspaceRoot != null;
  const testing = options.testing ?? (isLibrary ? 'vitest' : 'none');
  const linter = options.linter ?? 'oxlint';
  const formatter = options.formatter ?? 'prettier';
  const bundler = getLibraryBundler(options.libraryBundler);
  const packageManager = getPackageManagerName(options.packageManager);
  const engine = getEngineSpec(options.engine);

  if (getEngineName(engine) === 'node') {
    addPackageName(packageNames, explicitVersions, '@types/node');
  }

  if (isTypescript) {
    addPackageName(packageNames, explicitVersions, 'typescript');
  }

  if (!isLibrary) {
    addPackageName(packageNames, explicitVersions, 'vite');
  }

  if (isReact) {
    if (!isLibrary) {
      addPackageName(packageNames, explicitVersions, 'react');
      addPackageName(packageNames, explicitVersions, 'react-dom');
      addPackageName(packageNames, explicitVersions, '@vitejs/plugin-react');
      if (useReactCompiler) {
        addPackageName(packageNames, explicitVersions, '@babel/core');
        addPackageName(packageNames, explicitVersions, '@rolldown/plugin-babel');
        addPackageName(packageNames, explicitVersions, 'babel-plugin-react-compiler');
      }
    }

    if (isTypescript) {
      addPackageName(packageNames, explicitVersions, '@types/react');
      addPackageName(packageNames, explicitVersions, '@types/react-dom');
      if (useReactCompiler) {
        addPackageName(packageNames, explicitVersions, '@types/babel__core');
      }
    }
  }

  if (isR3f) {
    if (!isLibrary) {
      addPackageName(packageNames, explicitVersions, 'three');
      addPackageName(packageNames, explicitVersions, '@react-three/fiber');
    }

    if (isTypescript) {
      addPackageName(packageNames, explicitVersions, '@types/three');
    }

    if (isEnabledOption(options.drei)) {
      addPackageName(packageNames, explicitVersions, '@react-three/drei');
    }
    if (isEnabledOption(options.handle)) {
      addPackageName(packageNames, explicitVersions, '@react-three/handle');
    }
    if (isEnabledOption(options.koota)) {
      addPackageName(packageNames, explicitVersions, 'koota');
    }
    if (isEnabledOption(options.leva)) {
      addPackageName(packageNames, explicitVersions, 'leva');
    }
    if (isEnabledOption(options.rapier)) {
      addPackageName(packageNames, explicitVersions, '@react-three/rapier');
    }
    if (isEnabledOption(options.uikit)) {
      addPackageName(packageNames, explicitVersions, '@react-three/uikit');
    }
    if (isEnabledOption(options.zustand)) {
      addPackageName(packageNames, explicitVersions, 'zustand');
    }
    if (isEnabledOption(options.xr)) {
      addPackageName(packageNames, explicitVersions, '@react-three/xr');
      addPackageName(packageNames, explicitVersions, '@vitejs/plugin-basic-ssl');
    }
    if (!isEnabledOption(options.xr) && isEnabledOption(options.offscreen)) {
      addPackageName(packageNames, explicitVersions, '@react-three/offscreen');
    }
    if (!isEnabledOption(options.xr) && isEnabledOption(options.postprocessing)) {
      addPackageName(packageNames, explicitVersions, '@react-three/postprocessing');
    }
    if (isEnabledOption(options.viverse) && packageManager === 'npm') {
      addPackageName(packageNames, explicitVersions, '@viverse/cli');
    }
  }

  if (testing === 'vitest') {
    addPackageName(packageNames, explicitVersions, 'vitest');
    if (isReact) {
      addPackageName(packageNames, explicitVersions, '@testing-library/react');
      addPackageName(packageNames, explicitVersions, '@testing-library/dom');
      addPackageName(packageNames, explicitVersions, 'jsdom');
    }
  }

  if (linter === 'eslint') {
    addPackageName(packageNames, explicitVersions, 'eslint');
    if (isTypescript) {
      addPackageName(packageNames, explicitVersions, 'typescript-eslint');
    }
    if (isReact) {
      addPackageName(packageNames, explicitVersions, 'eslint-plugin-react-hooks');
    }
  } else if (linter === 'oxlint') {
    if (!inWorkspace) {
      addPackageName(packageNames, explicitVersions, 'oxlint');
      if (isTypescript) {
        addPackageName(packageNames, explicitVersions, 'oxlint-tsgolint');
      }
      if (useReactCompiler) {
        addPackageName(packageNames, explicitVersions, 'eslint-plugin-react-hooks');
      }
    }
  } else if (linter === 'biome') {
    addPackageName(packageNames, explicitVersions, '@biomejs/biome');
  }

  if (formatter === 'prettier') {
    addPackageName(packageNames, explicitVersions, 'prettier');
  } else if (formatter === 'oxfmt') {
    if (!inWorkspace) {
      addPackageName(packageNames, explicitVersions, 'oxfmt');
    }
  } else if (formatter === 'biome') {
    addPackageName(packageNames, explicitVersions, '@biomejs/biome');
  }

  if (isLibrary) {
    addPackageName(packageNames, explicitVersions, bundler.packageName);
  }

  return [...packageNames];
}

function getLinterPackage(linter: Linter): string {
  if (linter === 'biome') {
    return '@biomejs/biome';
  }
  return linter;
}

function getFormatterPackage(formatter: Formatter): string {
  if (formatter === 'biome') {
    return '@biomejs/biome';
  }
  return formatter;
}

function isEnabledOption(option: unknown): boolean {
  return option != null && option !== false;
}
