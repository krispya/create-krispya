export const DEFAULT_MINIMUM_RELEASE_AGE_MINUTES = 1440;

export type NpmVersionResolutionOptions = {
  minimumReleaseAgeMinutes?: number;
  now?: number;
};

type NpmPackageMetadata = {
  'dist-tags'?: Record<string, string>;
  versions?: Record<string, unknown>;
  time?: Record<string, string>;
};

const MINUTE_IN_MS = 60 * 1000;

function getMinimumReleaseAgeMinutes(options?: NpmVersionResolutionOptions): number {
  return Math.max(0, options?.minimumReleaseAgeMinutes ?? DEFAULT_MINIMUM_RELEASE_AGE_MINUTES);
}

function isVersionOldEnough(
  version: string,
  time: Record<string, string> | undefined,
  options?: NpmVersionResolutionOptions
): boolean {
  const minimumReleaseAgeMinutes = getMinimumReleaseAgeMinutes(options);
  if (minimumReleaseAgeMinutes === 0) return true;

  const publishedAt = time?.[version];
  if (publishedAt == null) return false;

  const publishedTime = Date.parse(publishedAt);
  if (!Number.isFinite(publishedTime)) return false;

  return (options?.now ?? Date.now()) - publishedTime >= minimumReleaseAgeMinutes * MINUTE_IN_MS;
}

function getInstallableVersions(
  versions: Iterable<string>,
  time: Record<string, string> | undefined,
  options?: NpmVersionResolutionOptions
): string[] {
  return [...versions].filter((version) => isVersionOldEnough(version, time, options));
}

async function fetchNpmPackageMetadata(packageName: string): Promise<NpmPackageMetadata> {
  const response = await fetch(`https://registry.npmjs.org/${packageName}`);
  return (await response.json()) as NpmPackageMetadata;
}

/**
 * Fetches the latest version of an npm package from the registry.
 */
export async function getLatestNpmVersion(
  packageName: string,
  fallback: string,
  options?: NpmVersionResolutionOptions
): Promise<string> {
  try {
    if (getMinimumReleaseAgeMinutes(options) === 0) {
      const response = await fetch(`https://registry.npmjs.org/${packageName}/latest`);
      const data = (await response.json()) as { version: string };
      return data.version;
    }

    const data = await fetchNpmPackageMetadata(packageName);
    const latestVersion = data['dist-tags']?.latest;
    if (latestVersion != null && isVersionOldEnough(latestVersion, data.time, options)) {
      return latestVersion;
    }

    const latestInstallableVersion = getInstallableVersions(
      Object.keys(data.versions ?? {}),
      data.time,
      options
    ).sort((a, b) => compareNumericSemver(b, a))[0];

    return latestInstallableVersion ?? fallback;
  } catch {
    return fallback;
  }
}

export function getSemverMajor(version?: string): number | undefined {
  if (version == null) return undefined;
  const major = Number.parseInt(version, 10);
  return Number.isFinite(major) ? major : undefined;
}

export function getSemverMajorString(version: string): string {
  return String(getSemverMajor(version) ?? version.split('.')[0]);
}

export function compareNumericSemver(a: string, b: string): number {
  const aParts = a.split('.').map((part) => Number.parseInt(part, 10) || 0);
  const bParts = b.split('.').map((part) => Number.parseInt(part, 10) || 0);
  const maxLength = Math.max(aParts.length, bParts.length);

  for (let index = 0; index < maxLength; index += 1) {
    const difference = (aParts[index] ?? 0) - (bParts[index] ?? 0);
    if (difference !== 0) {
      return difference;
    }
  }

  return 0;
}

function getLatestMatchingMajorVersion(
  versions: Iterable<string>,
  majorVersion: string,
  time?: Record<string, string>,
  options?: NpmVersionResolutionOptions
): string | undefined {
  return getInstallableVersions(versions, time, options)
    .filter((version) => version.split('.')[0] === majorVersion)
    .sort((a, b) => compareNumericSemver(b, a))[0];
}

/**
 * Fetches the latest npm version within a specific major version.
 */
export async function getLatestNpmMajorVersion(
  packageName: string,
  majorVersion: string,
  fallback: string,
  options?: NpmVersionResolutionOptions
): Promise<string> {
  try {
    const data = await fetchNpmPackageMetadata(packageName);
    const latestMatchingVersion = getLatestMatchingMajorVersion(
      Object.keys(data.versions ?? {}),
      majorVersion,
      data.time,
      options
    );

    return latestMatchingVersion ?? fallback;
  } catch {
    return fallback;
  }
}

/**
 * Fetches the latest npm version within the requested major, falling back to lower majors.
 */
export async function getLatestNpmMajorVersionAtOrBelow(
  packageName: string,
  majorVersion: string,
  fallback: string,
  options?: NpmVersionResolutionOptions
): Promise<string> {
  try {
    const data = await fetchNpmPackageMetadata(packageName);
    const versions = Object.keys(data.versions ?? {});
    const requestedMajor = getSemverMajor(majorVersion);

    if (requestedMajor !== undefined) {
      for (let major = requestedMajor; major >= 0; major -= 1) {
        const latestMatchingVersion = getLatestMatchingMajorVersion(
          versions,
          String(major),
          data.time,
          options
        );
        if (latestMatchingVersion != null) {
          return latestMatchingVersion;
        }
      }
    }

    return fallback;
  } catch {
    return fallback;
  }
}

export async function getLatestPnpmVersion(): Promise<string> {
  return getLatestNpmVersion('pnpm', '10.11.0');
}

export async function getLatestYarnVersion(): Promise<string> {
  return getLatestNpmVersion('yarn', '4.6.0');
}

export async function getLatestNpmCliVersion(): Promise<string> {
  return getLatestNpmVersion('npm', '11.0.0');
}

export async function getLatestNodeVersion(): Promise<string> {
  try {
    const response = await fetch('https://nodejs.org/dist/index.json');
    const data = (await response.json()) as Array<{
      version: string;
      lts: boolean | string;
    }>;
    const latestVersion = data[0];
    if (latestVersion) {
      return latestVersion.version.replace(/^v/, '');
    }
    return '25.0.0';
  } catch {
    return '25.0.0';
  }
}
