import { Controller, Get, Header, Module } from '@nestjs/common';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app.factory';
import {
  isCompletedRequestLine,
  type LogEntry,
  MemoryLogDestination,
} from './testing/memory-log-destination';

const REDACTED = '[Redacted]';

@Controller('session')
class SessionController {
  @Get()
  @Header('set-cookie', 'session=set-cookie-secret-marker')
  open(): { opened: true } {
    return { opened: true };
  }
}

@Module({ controllers: [SessionController] })
class SessionModule {}

describe('request logging', () => {
  const logs = new MemoryLogDestination();
  let app: NestFastifyApplication;
  let startupLines: string[];

  beforeAll(async () => {
    app = await createApp({ LOG_LEVEL: 'trace' }, logs, [SessionModule]);
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

  it('tags the completed request line with the request_id returned to the client', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' });
    await logs.waitForLine(isCompletedRequestLine);

    expect(response.headers['x-request-id']).toEqual(expect.any(String));
    expect(completedRequests(logs.entries())).toMatchObject([
      { request_id: response.headers['x-request-id'] },
    ]);
  });

  it('logs the route path without the query string', async () => {
    await app.inject({ method: 'GET', url: '/health?token=secret-query-marker' });
    await logs.waitForLine(isCompletedRequestLine);

    expect(completedRequests(logs.entries())).toMatchObject([{ req: { url: '/health' } }]);
    expect(logs.lines().filter((line) => line.includes('secret-query-marker'))).toEqual([]);
  });

  it('redacts credential headers from the request and the response', async () => {
    await app.inject({
      method: 'GET',
      url: '/session',
      headers: {
        authorization: 'Bearer sk-authorization-secret-marker',
        'x-api-key': 'x-api-key-secret-marker',
        cookie: 'session=cookie-secret-marker',
      },
    });
    await logs.waitForLine(isCompletedRequestLine);

    expect(completedRequests(logs.entries())).toMatchObject([
      {
        req: {
          headers: { authorization: REDACTED, 'x-api-key': REDACTED, cookie: REDACTED },
        },
        res: { headers: { 'set-cookie': REDACTED } },
      },
    ]);
    expect(logs.lines().filter((line) => line.includes('secret-marker'))).toEqual([]);
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
