import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app.factory';

describe('GET /health', () => {
  let app: NestFastifyApplication;

  beforeEach(async () => {
    app = await createApp({});
  });

  afterEach(async () => {
    await app.close();
  });

  it('responds 200 with status ok', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
  });

  it('is not served under the /v1 prefix', async () => {
    const response = await app.inject({ method: 'GET', url: '/v1/health' });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ statusCode: 404, error: 'Not Found' });
  });
});
