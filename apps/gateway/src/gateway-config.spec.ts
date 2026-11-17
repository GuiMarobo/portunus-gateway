import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import { createApp } from './app.factory';

describe('gateway configuration', () => {
  let app: NestFastifyApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it.each([
    [{}, { HOST: '0.0.0.0', PORT: 3000 }],
    [
      { HOST: '127.0.0.1', PORT: '8080' },
      { HOST: '127.0.0.1', PORT: 8080 },
    ],
  ])('reads HOST and PORT from environment %j as %j', async (environment, expected) => {
    const built = await createApp(environment);
    app = built.app;

    expect(built.config).toEqual(expected);
  });

  it('refuses to build the application when PORT is not a number', async () => {
    await expect(createApp({ PORT: 'not-a-port' })).rejects.toThrow(ZodError);
  });
});
