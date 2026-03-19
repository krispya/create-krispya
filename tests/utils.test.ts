import { afterEach, describe, expect, it, vi } from 'vitest';
import { getLatestNodeVersion, getLatestNpmMajorVersion } from '../src/utils.js';

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

describe('getLatestNpmMajorVersion', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('returns the newest version for the requested major', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue({
            json: async () => ({
                versions: {
                    '24.9.1': {},
                    '25.0.0': {},
                    '25.3.5': {},
                    '25.1.2': {},
                },
            }),
        } as Response);

        await expect(getLatestNpmMajorVersion('@types/node', '25', '25.0.0')).resolves.toBe(
            '25.3.5'
        );
    });

    it('falls back when no version matches the requested major', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue({
            json: async () => ({
                versions: {
                    '24.9.1': {},
                },
            }),
        } as Response);

        await expect(getLatestNpmMajorVersion('@types/node', '25', '25.0.0')).resolves.toBe(
            '25.0.0'
        );
    });
});
