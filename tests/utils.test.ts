import { afterEach, describe, expect, it, vi } from 'vitest';
import { getLatestNodeVersion } from '../src/utils.js';

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
