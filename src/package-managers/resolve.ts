import type { ProjectOptions } from '../types.js';
import {
  getLatestNpmCliVersion,
  getLatestNpmMajorVersion,
  getLatestPnpmVersion,
  getLatestYarnVersion,
} from '../utils/index.js';
import { getPackageManagerProfile } from './profiles.js';
import { getPackageManagerSpec } from './spec.js';
import type { PackageManagerProfile } from './types.js';

export async function resolvePackageManager(options: ProjectOptions) {
  const packageManager = getPackageManagerSpec(options.packageManager);
  if (packageManager.version == null) {
    if (packageManager.name === 'pnpm') {
      packageManager.version = await getLatestPnpmVersion();
    } else if (packageManager.name === 'yarn') {
      packageManager.version = await getLatestYarnVersion();
    } else if (packageManager.name === 'npm') {
      packageManager.version = await getLatestNpmCliVersion();
    }
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
