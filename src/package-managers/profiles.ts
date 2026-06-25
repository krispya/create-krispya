import type { PackageManagerSpec } from '../types.js';
import { getSemverMajor } from '../utils/index.js';
import { getPnpmProfile } from './pnpm.js';
import type { PackageManagerProfile } from './types.js';

export function getPackageManagerProfile(spec: PackageManagerSpec): PackageManagerProfile {
  const major = getSemverMajor(spec.version);

  if (spec.name === 'pnpm') {
    return getPnpmProfile(spec);
  }

  return {
    ...spec,
    major,
    capabilities: {},
  };
}
