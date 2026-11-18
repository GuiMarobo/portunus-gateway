import { describe, expect, it } from 'vitest';
import { createApp } from './app.factory';
import { MemoryLogDestination } from './testing/memory-log-destination';

describe('pretty logs', () => {
  it('writes human-readable lines instead of JSON when LOG_PRETTY is on', async () => {
    const logs = new MemoryLogDestination();

    const app = await createApp({ LOG_PRETTY: 'true' }, logs);

    const mappedRoute = logs.lines().find((line) => line.includes('Mapped {/health, GET} route'));
    expect(mappedRoute).toEqual(expect.any(String));
    expect(mappedRoute?.trimStart().startsWith('{')).toBe(false);
    await app.close();
  });
});
