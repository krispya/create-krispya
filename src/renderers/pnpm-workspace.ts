import type { PackageManagerProfile } from '../package-managers/types.js';

export type PnpmWorkspaceConfigOptions = {
  profile: PackageManagerProfile;
  manageVersions?: boolean;
  packages?: string[];
  builtDependencies?: string[];
};

function quotePackagePattern(pattern: string): string {
  return `"${pattern}"`;
}

export function renderPnpmWorkspaceConfig(options: PnpmWorkspaceConfigOptions): string {
  const { profile, manageVersions = true, packages = [], builtDependencies = ['esbuild'] } = options;
  const lines: string[] = [];

  if (manageVersions) {
    if (profile.capabilities.pnpmWorkspaceVersionPolicy === 'pmOnFail') {
      lines.push('pmOnFail: download', '');
    } else {
      lines.push('manage-package-manager-versions: true', '');
    }
  }

  if (packages.length > 0) {
    lines.push('packages:', ...packages.map((pattern) => `  - ${quotePackagePattern(pattern)}`), '');
  }

  if (profile.capabilities.pnpmBuildDependencyPolicy === 'allowBuilds') {
    lines.push('allowBuilds:');
    for (const dependency of builtDependencies) {
      lines.push(`  ${dependency}: true`);
    }
  } else {
    lines.push('onlyBuiltDependencies:');
    for (const dependency of builtDependencies) {
      lines.push(`  - ${dependency}`);
    }
  }

  return lines.join('\n');
}
