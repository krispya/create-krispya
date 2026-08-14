import type { EngineSpec, PackageVersions, VersionRangePrefix } from '../types.js';

type PackageVersionDefinition = {
  fallbackVersion: string;
  prefix?: VersionRangePrefix;
};

const PACKAGE_VERSION_DEFINITIONS: Record<string, PackageVersionDefinition> = {
  '@babel/core': { fallbackVersion: '7.29.0' },
  '@biomejs/biome': { fallbackVersion: '2.0.0' },
  '@react-three/drei': { fallbackVersion: '10.0.0' },
  '@react-three/fiber': { fallbackVersion: '9.0.0' },
  '@react-three/handle': { fallbackVersion: '6.6.16' },
  '@react-three/offscreen': { fallbackVersion: '0.0.8' },
  '@react-three/postprocessing': { fallbackVersion: '3.0.4' },
  '@react-three/rapier': { fallbackVersion: '2.1.0' },
  '@react-three/uikit': { fallbackVersion: '0.8.15' },
  '@react-three/xr': { fallbackVersion: '6.6.16' },
  '@rolldown/plugin-babel': { fallbackVersion: '0.2.3' },
  '@testing-library/dom': { fallbackVersion: '10.4.0' },
  '@testing-library/react': { fallbackVersion: '16.2.0' },
  '@types/babel__core': { fallbackVersion: '7.20.5' },
  '@types/node': { fallbackVersion: '25.3.5' },
  '@types/react': { fallbackVersion: '19.0.0' },
  '@types/react-dom': { fallbackVersion: '19.0.0' },
  '@types/three': { fallbackVersion: '0.175.0', prefix: '~' },
  '@vitejs/plugin-basic-ssl': { fallbackVersion: '2.0.0' },
  '@vitejs/plugin-react': { fallbackVersion: '6.0.1' },
  '@viverse/cli': { fallbackVersion: '0.9.5-beta.8' },
  eslint: { fallbackVersion: '9.17.0' },
  'eslint-plugin-react-hooks': { fallbackVersion: '7.1.1' },
  'babel-plugin-react-compiler': { fallbackVersion: '1.0.0' },
  jsdom: { fallbackVersion: '26.0.0' },
  koota: { fallbackVersion: '0.4.0' },
  leva: { fallbackVersion: '0.10.0' },
  oxfmt: { fallbackVersion: '0.21.0' },
  oxlint: { fallbackVersion: '1.36.0' },
  'oxlint-tsgolint': { fallbackVersion: '0.22.1' },
  prettier: { fallbackVersion: '3.4.2' },
  react: { fallbackVersion: '19.0.0' },
  'react-dom': { fallbackVersion: '19.0.0' },
  three: { fallbackVersion: '0.175.0', prefix: '~' },
  tsdown: { fallbackVersion: '0.22.14' },
  typescript: { fallbackVersion: '5.9.3' },
  'typescript-eslint': { fallbackVersion: '8.18.0' },
  unbuild: { fallbackVersion: '3.5.0' },
  vite: { fallbackVersion: '8.0.12' },
  vitest: { fallbackVersion: '4.0.0' },
  zustand: { fallbackVersion: '5.0.3' },
};

export function getPackageFallbackVersion(packageName: string): string {
  const definition = PACKAGE_VERSION_DEFINITIONS[packageName];
  if (definition == null) {
    throw new Error(`Missing package version definition for ${packageName}`);
  }
  return definition.fallbackVersion;
}

export function getResolvedPackageVersion(versions: PackageVersions, packageName: string): string {
  return versions[packageName] ?? getPackageFallbackVersion(packageName);
}

export function formatResolvedPackageVersion(
  versions: PackageVersions,
  packageName: string,
  prefix?: VersionRangePrefix
): string {
  const resolvedPrefix = prefix ?? PACKAGE_VERSION_DEFINITIONS[packageName]?.prefix ?? '^';
  return `${resolvedPrefix}${getResolvedPackageVersion(versions, packageName)}`;
}

export function assignResolvedPackageVersion(
  target: Record<string, string>,
  versions: PackageVersions,
  packageName: string,
  prefix?: VersionRangePrefix
): void {
  target[packageName] = formatResolvedPackageVersion(versions, packageName, prefix);
}

export function formatNodeTypesVersion(versions: PackageVersions = {}, _engine?: EngineSpec): string {
  const resolvedVersion = versions['@types/node'];
  if (resolvedVersion != null) {
    return `^${resolvedVersion}`;
  }

  return formatResolvedPackageVersion(versions, '@types/node');
}
