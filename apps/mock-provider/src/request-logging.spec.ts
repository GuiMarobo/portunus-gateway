import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  isCompletedRequestLine,
  type LogEntry,
  MemoryLogDestination,
} from './testing/memory-log-destination';
import { type RunningMock, startMock } from './testing/running-mock';

const REDACTED = '[Redacted]';

describe('request logging', () => {
  const logs = new MemoryLogDestination();
  let mock: RunningMock;

  beforeAll(async () => {
    mock = await startMock({}, logs);
  });

  beforeEach(() => {
    logs.clear();
  });

  afterAll(async () => {
    await mock.close();
  });

  it('writes a single JSON line per request with method, path, status, duration and the authorization redacted', async () => {
    await fetch(`${mock.baseUrl}/health?token=secret-query-marker`, {
      headers: { authorization: 'Bearer sk-authorization-secret-marker' },
    });
    await logs.waitForLine(isCompletedRequestLine);

    const requestLines = logs.entries().filter((entry) => 'req' in entry || 'res' in entry);
    expect(requestLines).toEqual([
      expect.objectContaining({
        req: expect.objectContaining({
          method: 'GET',
          url: '/health',
          headers: expect.objectContaining({ authorization: REDACTED }) as unknown,
        }) as unknown,
        res: expect.objectContaining({ statusCode: 200 }) as unknown,
        responseTime: expect.any(Number) as unknown,
      }),
    ]);
    expect(logs.lines().filter((line) => line.includes('secret'))).toEqual([]);
  });

  it('never writes the request body to any log line', async () => {
    await fetch(`${mock.baseUrl}/health`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: 'confidential-prompt-marker' }),
    });
    await logs.waitForLine(isCompletedRequestLine);

    expect(completedRequests(logs.entries())).toMatchObject([
      { req: { method: 'POST', url: '/health' } },
    ]);
    expect(logs.lines().filter((line) => line.includes('confidential-prompt-marker'))).toEqual([]);
  });
});

function completedRequests(entries: LogEntry[]): LogEntry[] {
  return entries.filter((entry) => 'responseTime' in entry);
}
