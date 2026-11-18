import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app.factory';
import {
  isCompletedRequestLine,
  type LogEntry,
  MemoryLogDestination,
} from './testing/memory-log-destination';

describe('request logging', () => {
  const logs = new MemoryLogDestination();
  let app: NestFastifyApplication;
  let startupLines: string[];

  beforeAll(async () => {
    app = await createApp({ LOG_LEVEL: 'trace' }, logs);
    startupLines = logs.lines();
  });

  beforeEach(() => {
    logs.clear();
  });

  afterAll(async () => {
    await app.close();
  });

  it('writes the framework startup logs as JSON lines through the same destination', () => {
    const startupEntries = startupLines.map((line) => JSON.parse(line) as LogEntry);

    expect(startupEntries.map((entry) => entry.msg)).toContainEqual(
      expect.stringContaining('Mapped {/health, GET} route'),
    );
  });

  it('writes a single JSON line per completed request with method, route, status and duration', async () => {
    await app.inject({ method: 'GET', url: '/health' });
    await logs.waitForLine(isCompletedRequestLine);

    const completed = completedRequests(logs.entries());
    expect(completed).toHaveLength(1);
    expect(completed[0]).toMatchObject({
      req: { method: 'GET', url: '/health' },
      res: { statusCode: 200 },
    });
    expect(typeof completed[0]?.responseTime).toBe('number');
  });

  it('never writes the request body to any log line', async () => {
    await app.inject({
      method: 'POST',
      url: '/health',
      payload: { prompt: 'confidential-prompt-marker' },
    });
    await logs.waitForLine(isCompletedRequestLine);

    expect(logs.lines().filter((line) => line.includes('confidential-prompt-marker'))).toEqual([]);
  });
});

function completedRequests(entries: LogEntry[]): LogEntry[] {
  return entries.filter((entry) => 'responseTime' in entry);
}
