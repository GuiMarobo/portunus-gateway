import { describe, expect, it } from 'vitest';
import { createApp } from './app.factory';
import { MemoryLogDestination } from './testing/memory-log-destination';

describe('log level', () => {
  it('drops the info startup logs when LOG_LEVEL is warn', async () => {
    const logs = new MemoryLogDestination();

    const app = await createApp({ LOG_LEVEL: 'warn' }, logs);

    expect(logs.lines()).toEqual([]);
    await app.close();
  });
});
