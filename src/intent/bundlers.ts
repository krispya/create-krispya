import type { LibraryBundler } from '../types.js';

export const DEFAULT_LIBRARY_BUNDLER = 'tsdown' satisfies LibraryBundler;

export type LibraryBundlerPackageJson = {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
};

export type LibraryBundlerDefinition = {
  name: LibraryBundler;
  packageName: string;
  executable: string;
  prompt: {
    label: string;
    hint: string;
  };
  architectureDescription: string;
  libraryDescription: string;
  maximumTypeScriptMajor?: number;
};

export type LibraryBundlerCompatibility = {
  typescriptVersion?: string;
};

export const libraryBundlers = {
  tsdown: {
    name: 'tsdown',
    packageName: 'tsdown',
    executable: 'tsdown',
    prompt: {
      label: 'tsdown',
      hint: 'fast, Rolldown-based',
    },
    architectureDescription: 'This library uses [tsdown](https://tsdown.dev/) for building.',
    libraryDescription: '[tsdown](https://tsdown.dev/) - Fast TypeScript bundler powered by Rolldown',
  },
  unbuild: {
    name: 'unbuild',
    packageName: 'unbuild',
    executable: 'unbuild',
    prompt: {
      label: 'unbuild',
      hint: 'unjs, simple config',
    },
    architectureDescription:
      'This library uses [unbuild](https://github.com/unjs/unbuild) for building.',
    libraryDescription:
      '[unbuild](https://github.com/unjs/unbuild) - Unified JavaScript build system',
    maximumTypeScriptMajor: 6,
  },
} satisfies Record<LibraryBundler, LibraryBundlerDefinition>;

export const libraryBundlerNames = Object.freeze(Object.keys(libraryBundlers) as LibraryBundler[]);

export function isLibraryBundler(value: unknown): value is LibraryBundler {
  return typeof value === 'string' && Object.hasOwn(libraryBundlers, value);
}

export function getLibraryBundler(value: unknown = DEFAULT_LIBRARY_BUNDLER) {
  if (!isLibraryBundler(value)) {
    throw new Error(`Unsupported library bundler: ${String(value)}`);
  }

  return libraryBundlers[value];
}

function getVersionMajor(version: string | undefined): number | undefined {
  const match = version?.match(/^[~^]?v?(\d+)(?:\.|$)/);
  return match == null ? undefined : Number.parseInt(match[1], 10);
}

export function isLibraryBundlerCompatible(
  bundler: LibraryBundlerDefinition,
  compatibility: LibraryBundlerCompatibility
): boolean {
  const typescriptMajor = getVersionMajor(compatibility.typescriptVersion);
  return (
    typescriptMajor == null ||
    bundler.maximumTypeScriptMajor == null ||
    typescriptMajor <= bundler.maximumTypeScriptMajor
  );
}

export function assertLibraryBundlerCompatible(
  bundler: LibraryBundlerDefinition,
  compatibility: LibraryBundlerCompatibility
): void {
  if (isLibraryBundlerCompatible(bundler, compatibility)) return;

  const typescriptMajor = getVersionMajor(compatibility.typescriptVersion);
  throw new Error(
    `${bundler.name} does not support TypeScript ${typescriptMajor}; use ${DEFAULT_LIBRARY_BUNDLER}`
  );
}

export function getLibraryBundlerPromptOptions(compatibility: LibraryBundlerCompatibility = {}) {
  return libraryBundlerNames
    .map((name) => libraryBundlers[name])
    .filter((bundler) => isLibraryBundlerCompatible(bundler, compatibility))
    .map((bundler) => ({
      value: bundler.name,
      label: bundler.prompt.label,
      hint: bundler.prompt.hint,
    }));
}

function hasPackage(pkg: LibraryBundlerPackageJson, packageName: string): boolean {
  return (
    pkg.dependencies?.[packageName] != null ||
    pkg.devDependencies?.[packageName] != null ||
    pkg.peerDependencies?.[packageName] != null
  );
}

export function usesLibraryBundlerScript(
  bundler: LibraryBundlerDefinition,
  script: string | undefined
): script is string {
  return script === bundler.executable || script?.startsWith(`${bundler.executable} `) === true;
}

export function detectLibraryBundler(
  pkg: LibraryBundlerPackageJson
): LibraryBundlerDefinition | undefined {
  const buildScript = pkg.scripts?.build;
  return (
    libraryBundlerNames
      .map((name) => libraryBundlers[name])
      .find((bundler) => usesLibraryBundlerScript(bundler, buildScript)) ??
    libraryBundlerNames
      .map((name) => libraryBundlers[name])
      .find((bundler) => hasPackage(pkg, bundler.packageName))
  );
}
