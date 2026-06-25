import type { PackageManagerName, PackageManagerSpec } from '../types.js';

export function getPackageManagerSpec(packageManager?: PackageManagerSpec): PackageManagerSpec {
  return packageManager ?? { name: 'pnpm' };
}

export function getPackageManagerName(packageManager?: PackageManagerSpec): PackageManagerName {
  return getPackageManagerSpec(packageManager).name;
}

export function formatPackageManager(packageManager?: PackageManagerSpec): string {
  const spec = getPackageManagerSpec(packageManager);
  return spec.version ? `${spec.name}@${spec.version}` : spec.name;
}
