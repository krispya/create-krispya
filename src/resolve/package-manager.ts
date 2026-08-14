import type { ProjectOptions } from '../types.js';
import { getLatestNpmMajorVersion, getLatestPnpmVersion, getLatestYarnVersion } from './registry.js';
import { getPackageManagerProfile } from '../intent/package-manager/profiles.js';
import { getPackageManagerSpec } from '../intent/package-manager/spec.js';
import type { PackageManagerProfile } from '../types.js';

export async function resolvePackageManager(options: ProjectOptions) {
  const packageManager = getPackageManagerSpec(options.packageManager);
  if (packageManager.version == null) {
    if (packageManager.name === 'pnpm') {
      packageManager.version = await getLatestPnpmVersion();
    } else if (packageManager.name === 'yarn') {
      packageManager.version = await getLatestYarnVersion();
    }
    // npm ships with Node, and the registry's latest npm is usually ahead of
    // every node-bundled npm — pinning it by default makes fresh projects warn
    // with EBADENGINE on install. Only pin npm when a version is requested.
  } else if (/^\d+$/.test(packageManager.version)) {
    const fallback = `${packageManager.version}.0.0`;
    packageManager.version = await getLatestNpmMajorVersion(
      packageManager.name,
      packageManager.version,
      fallback
    );
  }

  return packageManager;
}

export async function resolvePackageManagerProfile(
  options: ProjectOptions
): Promise<PackageManagerProfile> {
  return getPackageManagerProfile(await resolvePackageManager(options));
}
