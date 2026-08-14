import { compareNumericSemver, getSemverMajor } from '../utils/versions.js';

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

type ParsedSemver = {
  major: number;
  minor: number;
  patch: number;
  prerelease: string[];
};

const MINUTE_IN_MS = 60 * 1000;
const SEMVER_PATTERN = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

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

function parseSemver(version: string): ParsedSemver | undefined {
  const match = version.match(SEMVER_PATTERN);
  if (match == null) return undefined;

  return {
    major: Number.parseInt(match[1], 10),
    minor: Number.parseInt(match[2], 10),
    patch: Number.parseInt(match[3], 10),
    prerelease: match[4]?.split('.') ?? [],
  };
}

function hasPrerelease(version: string): boolean {
  return (parseSemver(version)?.prerelease.length ?? 0) > 0;
}

function comparePrerelease(aParts: string[], bParts: string[]): number {
  if (aParts.length === 0 && bParts.length === 0) return 0;
  if (aParts.length === 0) return 1;
  if (bParts.length === 0) return -1;

  const maxLength = Math.max(aParts.length, bParts.length);
  for (let index = 0; index < maxLength; index += 1) {
    const aPart = aParts[index];
    const bPart = bParts[index];

    if (aPart == null) return -1;
    if (bPart == null) return 1;
    if (aPart === bPart) continue;

    const aNumber = /^\d+$/.test(aPart) ? Number.parseInt(aPart, 10) : undefined;
    const bNumber = /^\d+$/.test(bPart) ? Number.parseInt(bPart, 10) : undefined;

    if (aNumber != null && bNumber != null) return aNumber - bNumber;
    if (aNumber != null) return -1;
    if (bNumber != null) return 1;
    return aPart.localeCompare(bPart);
  }

  return 0;
}

function compareSemver(a: string, b: string): number {
  const aParsed = parseSemver(a);
  const bParsed = parseSemver(b);

  if (aParsed == null || bParsed == null) {
    return compareNumericSemver(a, b);
  }

  const majorDifference = aParsed.major - bParsed.major;
  if (majorDifference !== 0) return majorDifference;

  const minorDifference = aParsed.minor - bParsed.minor;
  if (minorDifference !== 0) return minorDifference;

  const patchDifference = aParsed.patch - bParsed.patch;
  if (patchDifference !== 0) return patchDifference;

  return comparePrerelease(aParsed.prerelease, bParsed.prerelease);
}

function getLatestChannelVersions(versions: Iterable<string>, latestVersion?: string): string[] {
  const availableVersions = [...versions];
  if (latestVersion == null) return availableVersions.filter((version) => !hasPrerelease(version));

  const latestIsPrerelease = hasPrerelease(latestVersion);
  return availableVersions.filter((version) => {
    if (!latestIsPrerelease && hasPrerelease(version)) return false;
    return compareSemver(version, latestVersion) <= 0;
  });
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
      getLatestChannelVersions(Object.keys(data.versions ?? {}), latestVersion),
      data.time,
      options
    ).sort((a, b) => compareSemver(b, a))[0];

    return latestInstallableVersion ?? fallback;
  } catch {
    return fallback;
  }
}

function getLatestMatchingMajorVersion(
  versions: Iterable<string>,
  majorVersion: string,
  time?: Record<string, string>,
  options?: NpmVersionResolutionOptions
): string | undefined {
  return getInstallableVersions(versions, time, options)
    .filter((version) => version.split('.')[0] === majorVersion)
    .filter((version) => !hasPrerelease(version))
    .sort((a, b) => compareSemver(b, a))[0];
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
