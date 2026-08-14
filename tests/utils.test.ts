import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getLatestNodeVersion,
  getLatestNpmMajorVersion,
  getLatestNpmMajorVersionAtOrBelow,
  getLatestNpmVersion,
  DEFAULT_MINIMUM_RELEASE_AGE_MINUTES,
} from '../src/resolve/registry.js';

const NOW = Date.parse('2026-06-30T12:00:00.000Z');

function minutesAgo(minutes: number): string {
  return new Date(NOW - minutes * 60 * 1000).toISOString();
}

function mockRegistryMetadata(metadata: unknown): void {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    json: async () => metadata,
  } as Response);
}

describe('getLatestNodeVersion', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the newest release from the Node index', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      json: async () => [
        { version: 'v25.1.0', lts: false },
        { version: 'v24.12.0', lts: 'Jod' },
      ],
    } as Response);

    await expect(getLatestNodeVersion()).resolves.toBe('25.1.0');
  });

  it('falls back to 25 when the fetch fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('boom'));

    await expect(getLatestNodeVersion()).resolves.toBe('25.0.0');
  });
});

describe('getLatestNpmVersion', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the latest dist tag when no minimum release age is configured', async () => {
    mockRegistryMetadata({ version: '2.0.0' });

    await expect(
      getLatestNpmVersion('example', '1.0.0', { minimumReleaseAgeMinutes: 0 })
    ).resolves.toBe('2.0.0');
  });

  it('skips versions newer than the minimum release age', async () => {
    mockRegistryMetadata({
      'dist-tags': { latest: '2.0.0' },
      versions: {
        '1.9.0': {},
        '2.0.0': {},
      },
      time: {
        '1.9.0': minutesAgo(DEFAULT_MINIMUM_RELEASE_AGE_MINUTES + 1),
        '2.0.0': minutesAgo(60),
      },
    });

    await expect(
      getLatestNpmVersion('example', '1.0.0', {
        now: NOW,
      })
    ).resolves.toBe('1.9.0');
  });

  it('uses the latest dist tag channel when buffered latest is too new', async () => {
    mockRegistryMetadata({
      'dist-tags': {
        alpha: '3.0.0-alpha.1',
        latest: '2.0.0',
      },
      versions: {
        '1.9.0': {},
        '2.0.0': {},
        '3.0.0-alpha.1': {},
      },
      time: {
        '1.9.0': minutesAgo(DEFAULT_MINIMUM_RELEASE_AGE_MINUTES + 1),
        '2.0.0': minutesAgo(60),
        '3.0.0-alpha.1': minutesAgo(DEFAULT_MINIMUM_RELEASE_AGE_MINUTES + 1),
      },
    });

    await expect(
      getLatestNpmVersion('example', '1.0.0', {
        now: NOW,
      })
    ).resolves.toBe('1.9.0');
  });

  it('does not choose prereleases from non-latest channels', async () => {
    mockRegistryMetadata({
      'dist-tags': {
        beta: '2.0.0-beta.1',
        latest: '1.9.0',
      },
      versions: {
        '1.9.0': {},
        '2.0.0-beta.1': {},
      },
      time: {
        '1.9.0': minutesAgo(DEFAULT_MINIMUM_RELEASE_AGE_MINUTES + 1),
        '2.0.0-beta.1': minutesAgo(DEFAULT_MINIMUM_RELEASE_AGE_MINUTES + 1),
      },
    });

    await expect(
      getLatestNpmVersion('example', '1.0.0', {
        now: NOW,
      })
    ).resolves.toBe('1.9.0');
  });

  it('falls back when every version is newer than the minimum release age', async () => {
    mockRegistryMetadata({
      'dist-tags': { latest: '2.0.0' },
      versions: {
        '2.0.0': {},
      },
      time: {
        '2.0.0': minutesAgo(60),
      },
    });

    await expect(
      getLatestNpmVersion('example', '1.0.0', {
        now: NOW,
      })
    ).resolves.toBe('1.0.0');
  });
});

describe('getLatestNpmMajorVersion', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the newest version for the requested major', async () => {
    mockRegistryMetadata({
      versions: {
        '24.9.1': {},
        '25.0.0': {},
        '25.3.5': {},
        '25.1.2': {},
      },
    });

    await expect(
      getLatestNpmMajorVersion('@types/node', '25', '25.0.0', { minimumReleaseAgeMinutes: 0 })
    ).resolves.toBe('25.3.5');
  });

  it('falls back when no version matches the requested major', async () => {
    mockRegistryMetadata({
      versions: {
        '24.9.1': {},
      },
    });

    await expect(
      getLatestNpmMajorVersion('@types/node', '25', '25.0.0', { minimumReleaseAgeMinutes: 0 })
    ).resolves.toBe('25.0.0');
  });

  it('does not choose prereleases for the requested major', async () => {
    mockRegistryMetadata({
      versions: {
        '25.1.0': {},
        '25.2.0-alpha.1': {},
      },
    });

    await expect(
      getLatestNpmMajorVersion('@types/node', '25', '25.0.0', { minimumReleaseAgeMinutes: 0 })
    ).resolves.toBe('25.1.0');
  });
});

describe('getLatestNpmMajorVersionAtOrBelow', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the newest version for the requested major when available', async () => {
    mockRegistryMetadata({
      versions: {
        '25.3.5': {},
        '26.0.1': {},
        '26.1.0': {},
      },
    });

    await expect(
      getLatestNpmMajorVersionAtOrBelow('@types/node', '26', '25.0.0', {
        minimumReleaseAgeMinutes: 0,
      })
    ).resolves.toBe('26.1.0');
  });

  it('falls back to the newest lower major when the requested major is missing', async () => {
    mockRegistryMetadata({
      versions: {
        '24.12.0': {},
        '25.3.4': {},
        '25.7.0': {},
      },
    });

    await expect(
      getLatestNpmMajorVersionAtOrBelow('@types/node', '26', '25.0.0', {
        minimumReleaseAgeMinutes: 0,
      })
    ).resolves.toBe('25.7.0');
  });

  it('uses the fallback when no lower matching major exists', async () => {
    mockRegistryMetadata({
      versions: {},
    });

    await expect(
      getLatestNpmMajorVersionAtOrBelow('@types/node', '26', '25.0.0', {
        minimumReleaseAgeMinutes: 0,
      })
    ).resolves.toBe('25.0.0');
  });

  it('skips too-new versions while falling back across majors', async () => {
    mockRegistryMetadata({
      versions: {
        '25.7.0': {},
        '26.0.0': {},
        '26.1.0': {},
      },
      time: {
        '25.7.0': minutesAgo(DEFAULT_MINIMUM_RELEASE_AGE_MINUTES + 1),
        '26.0.0': minutesAgo(DEFAULT_MINIMUM_RELEASE_AGE_MINUTES + 1),
        '26.1.0': minutesAgo(60),
      },
    });

    await expect(
      getLatestNpmMajorVersionAtOrBelow('@types/node', '26', '25.0.0', {
        now: NOW,
      })
    ).resolves.toBe('26.0.0');
  });
});
