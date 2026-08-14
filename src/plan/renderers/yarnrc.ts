import type { PackageManagerProfile } from '../../types.js';

export type YarnrcConfigOptions = {
  profile: PackageManagerProfile;
};

export function renderYarnrcConfig(options: YarnrcConfigOptions): string | undefined {
  const { profile } = options;

  if (profile.capabilities.yarnNodeLinker == null) {
    return undefined;
  }

  return `nodeLinker: ${profile.capabilities.yarnNodeLinker}`;
}
