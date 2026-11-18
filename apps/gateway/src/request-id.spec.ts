import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from './app.factory';
import { resolveRequestId } from './request-id';
import { MemoryLogDestination } from './testing/memory-log-destination';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const LONGEST_ACCEPTED_ID = 'a'.repeat(128);
const TOO_LONG_ID = 'a'.repeat(129);

describe('resolveRequestId', () => {
  it.each([
    ['letters, digits, dot, underscore and dash', 'Client-req_42.v1'],
    ['exactly 128 characters', LONGEST_ACCEPTED_ID],
  ])('reuses a client id made of %s', (_description, clientId) => {
    expect(resolveRequestId(clientId)).toBe(clientId);
  });

  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['129 characters long', TOO_LONG_ID],
    ['carrying a line break', 'abc\n{"level":30,"msg":"forged"}'],
    ['carrying a forbidden character', 'abc def'],
    ['sent more than once', ['first-id', 'second-id']],
  ])('generates a UUID v4 when the client id is %s', (_description, clientId) => {
    expect(resolveRequestId(clientId)).toMatch(UUID_V4);
  });
});

describe('x-request-id response header', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await createApp({ LOG_LEVEL: 'silent' }, new MemoryLogDestination());
  });

  afterAll(async () => {
    await app.close();
  });

  it.each([
    ['an existing route', '/health'],
    ['an unknown route answered with 404', '/does-not-exist'],
  ])('carries a generated UUID v4 on %s', async (_description, url) => {
    const response = await app.inject({ method: 'GET', url });

    expect(response.headers['x-request-id']).toMatch(UUID_V4);
  });

  it('echoes a valid client id unchanged', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { 'x-request-id': 'client-trace.42' },
    });

    expect(response.headers['x-request-id']).toBe('client-trace.42');
  });
});
