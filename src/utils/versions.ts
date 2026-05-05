/**
 * Fetches the latest version of an npm package from the registry.
 */
export async function getLatestNpmVersion(packageName: string, fallback: string): Promise<string> {
    try {
        const response = await fetch(`https://registry.npmjs.org/${packageName}/latest`);
        const data = (await response.json()) as { version: string };
        return data.version;
    } catch {
        return fallback;
    }
}

function compareNumericSemver(a: string, b: string): number {
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

/**
 * Fetches the latest npm version within a specific major version.
 */
export async function getLatestNpmMajorVersion(
    packageName: string,
    majorVersion: string,
    fallback: string
): Promise<string> {
    try {
        const response = await fetch(`https://registry.npmjs.org/${packageName}`);
        const data = (await response.json()) as { versions?: Record<string, unknown> };
        const latestMatchingVersion = Object.keys(data.versions ?? {})
            .filter((version) => version.split('.')[0] === majorVersion)
            .sort((a, b) => compareNumericSemver(b, a))[0];

        return latestMatchingVersion ?? fallback;
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
