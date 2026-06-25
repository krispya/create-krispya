import type { PackageManagerName, PackageManagerSpec } from '../types.js';

const PACKAGE_MANAGER_NAMES = new Set<PackageManagerName>(['pnpm', 'npm', 'yarn']);

export function isPackageManagerName(value: string): value is PackageManagerName {
  return PACKAGE_MANAGER_NAMES.has(value as PackageManagerName);
}

export function parsePackageManagerSpec(value?: string): PackageManagerSpec | undefined {
  if (value == null || value.length === 0) {
    return undefined;
  }

  const atIndex = value.indexOf('@');
  const name = (atIndex === -1 ? value : value.slice(0, atIndex)) as PackageManagerName;

  if (!isPackageManagerName(name)) {
    return undefined;
  }

  if (atIndex === -1) {
    return { name };
  }

  const version = value.slice(atIndex + 1);
  return version.length > 0 ? { name, version } : { name };
}
