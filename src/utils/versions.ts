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
