import type { PackageManagerProfile, PackageManagerSpec } from '../../types.js';
import { getSemverMajor } from '../../utils/index.js';

export function getYarnProfile(spec: PackageManagerSpec): PackageManagerProfile {
  const major = getSemverMajor(spec.version);

  // Yarn 1 (classic) behaves like a plain package manager. Modern Yarn (2+)
  // defaults to Plug'n'Play, which breaks common tooling, so profiles request
  // the node-modules linker instead. An unversioned spec is treated as modern.
  if (major != null && major < 2) {
    return {
      ...spec,
      major,
      capabilities: {},
      requirements: {},
    };
  }

  return {
    ...spec,
    major,
    capabilities: {
      yarnNodeLinker: 'node-modules',
    },
    requirements: {
      node: '18.12',
    },
  };
}
