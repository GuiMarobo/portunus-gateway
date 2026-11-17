import { Injectable, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { ConfigValidationError } from '@portunus/common';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from './app.factory';
import { AppModule } from './app.module';
import { GatewayConfig } from './gateway-config';

describe('gateway configuration', () => {
  let app: NestFastifyApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it.each([
    [{}, { NODE_ENV: 'development', HOST: '0.0.0.0', PORT: 3000 }],
    [
      { NODE_ENV: 'production', HOST: '127.0.0.1', PORT: '8080' },
      { NODE_ENV: 'production', HOST: '127.0.0.1', PORT: 8080 },
    ],
    [{ PORT: '1' }, { NODE_ENV: 'development', HOST: '0.0.0.0', PORT: 1 }],
    [{ PORT: '65535' }, { NODE_ENV: 'development', HOST: '0.0.0.0', PORT: 65535 }],
  ])(
    'provides the configuration parsed from %j to the container',
    async (environment, expected) => {
      app = await createApp(environment);

      expect(app.get(GatewayConfig)).toEqual(expected);
    },
  );

  it('lists each invalid variable with its reason without echoing the received values', async () => {
    const error = await rejectionOf(
      createApp({ NODE_ENV: 'secret-environment', PORT: 'secret-port' }),
    );

    expect(error).toBeInstanceOf(ConfigValidationError);
    expect(error.message.split('\n')).toEqual([
      'Invalid configuration:',
      expect.stringMatching(/^ {2}NODE_ENV → \S/),
      expect.stringMatching(/^ {2}PORT → \S/),
    ]);
    expect(error.message).not.toContain('secret');
  });

  it.each([
    ['PORT', 'abc'],
    ['PORT', '8080.5'],
    ['PORT', '0'],
    ['PORT', '65536'],
    ['PORT', ''],
    ['NODE_ENV', 'staging'],
    ['HOST', ''],
  ])('refuses to build the application when %s is %j', async (variable, value) => {
    const error = await rejectionOf(createApp({ [variable]: value }));

    expect(error).toBeInstanceOf(ConfigValidationError);
    expect(error.message).toMatch(new RegExp(`^ {2}${variable} → \\S`, 'm'));
  });

  it('injects the typed configuration into a constructor by its type alone', async () => {
    @Injectable()
    class ConfigConsumer {
      constructor(readonly config: GatewayConfig) {}
    }

    @Module({
      imports: [AppModule.register(new GatewayConfig({ PORT: '8080' }))],
      providers: [ConfigConsumer],
    })
    class ConsumerModule {}

    const context = await NestFactory.createApplicationContext(ConsumerModule, { logger: false });

    expect(context.get(ConfigConsumer).config.PORT).toBe(8080);
    await context.close();
  });
});

async function rejectionOf(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof Error) {
      return error;
    }
  }
  throw new Error('expected the promise to reject with an Error');
}
