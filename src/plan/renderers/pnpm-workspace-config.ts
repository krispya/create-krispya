import type { PackageManagerProfile } from '../../types.js';

export type PnpmWorkspaceConfigOptions = {
  profile: PackageManagerProfile;
  manageVersions?: boolean;
  packages?: string[];
  buildDependencies?: Record<string, boolean>;
};

function formatPnpmWorkspaceYamlKey(key: string): string {
  return key.startsWith('@') ? JSON.stringify(key) : key;
}

export function renderPnpmWorkspaceConfig(options: PnpmWorkspaceConfigOptions): string {
  const {
    profile,
    manageVersions = true,
    packages = [],
    buildDependencies = { esbuild: true },
  } = options;
  const lines: string[] = [];

  if (manageVersions) {
    if (profile.capabilities.pnpmWorkspaceVersionPolicy === 'pmOnFail') {
      lines.push('pmOnFail: download', '');
    } else {
      lines.push('manage-package-manager-versions: true', '');
    }
  }

  if (packages.length > 0) {
    lines.push('packages:', ...packages.map((pattern) => `  - "${pattern}"`), '');
  }

  if (profile.capabilities.pnpmBuildDependencyPolicy === 'allowBuilds') {
    lines.push('allowBuilds:');
    for (const [dependency, allowed] of Object.entries(buildDependencies)) {
      lines.push(`  ${formatPnpmWorkspaceYamlKey(dependency)}: ${allowed ? 'true' : 'false'}`);
    }
  } else {
    const allowedDependencies = Object.entries(buildDependencies)
      .filter(([, allowed]) => allowed)
      .map(([dependency]) => dependency);

    lines.push('onlyBuiltDependencies:');
    for (const dependency of allowedDependencies) {
      lines.push(`  - ${dependency}`);
    }
  }

  return lines.join('\n');
}
