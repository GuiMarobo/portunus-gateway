import { Controller, Get, Injectable, Logger, Module } from '@nestjs/common';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from './app.factory';
import { isCompletedRequestLine, MemoryLogDestination } from './testing/memory-log-destination';

const PROBE_MESSAGE = 'probe service finished its work';

@Injectable()
class ProbeService {
  private readonly logger = new Logger(ProbeService.name);

  async work(): Promise<void> {
    await Promise.resolve();
    this.logger.log(PROBE_MESSAGE);
  }
}

@Controller('probe')
class ProbeController {
  constructor(private readonly probeService: ProbeService) {}

  @Get()
  async run(): Promise<{ done: true }> {
    await this.probeService.work();
    return { done: true };
  }
}

@Module({ controllers: [ProbeController], providers: [ProbeService] })
class ProbeModule {}

describe('request context propagation', () => {
  const logs = new MemoryLogDestination();
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await createApp({ LOG_LEVEL: 'info' }, logs, [ProbeModule]);
  });

  afterAll(async () => {
    await app.close();
  });

  it('tags a log written inside a provider with the request_id of the ongoing request', async () => {
    logs.clear();
    const response = await app.inject({
      method: 'GET',
      url: '/probe',
      headers: { 'x-request-id': 'probe-request-7' },
    });
    await logs.waitForLine(isCompletedRequestLine);

    expect(response.statusCode).toBe(200);
    expect(logs.entries().filter((entry) => entry.msg === PROBE_MESSAGE)).toMatchObject([
      { request_id: 'probe-request-7' },
    ]);
  });
});
