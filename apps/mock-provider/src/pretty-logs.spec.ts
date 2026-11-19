import { describe, expect, it } from 'vitest';
import { isCompletedRequestLine, MemoryLogDestination } from './testing/memory-log-destination';
import { startMock } from './testing/running-mock';

describe('pretty logs', () => {
  it('writes human-readable lines instead of JSON when LOG_PRETTY is on', async () => {
    const logs = new MemoryLogDestination();
    const mock = await startMock({ LOG_PRETTY: 'true' }, logs);

    await fetch(`${mock.baseUrl}/health`);
    const completed = await logs.waitForLine(isCompletedRequestLine);

    expect(completed.trimStart().startsWith('{')).toBe(false);
    await mock.close();
  });
});
