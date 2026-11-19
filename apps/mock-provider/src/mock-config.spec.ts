import { ConfigValidationError, type RawEnvironment } from '@portunus/common';
import { describe, expect, it } from 'vitest';
import { createMockApp, type MockApp } from './mock-app.factory';
import { MemoryLogDestination } from './testing/memory-log-destination';

describe('mock configuration', () => {
  it.each([
    [
      {},
      {
        NODE_ENV: 'development',
        HOST: '0.0.0.0',
        PORT: 3001,
        LOG_LEVEL: 'info',
        LOG_PRETTY: false,
        MOCK_DEFAULT_COMPLETION_TOKENS: 16,
        MOCK_MAX_DELAY_MS: 30000,
        MOCK_DEFAULT_RETRY_AFTER_SECONDS: 1,
      },
    ],
    [
      {
        NODE_ENV: 'production',
        HOST: '127.0.0.1',
        PORT: '8081',
        LOG_LEVEL: 'silent',
        LOG_PRETTY: 'false',
      },
      {
        NODE_ENV: 'production',
        HOST: '127.0.0.1',
        PORT: 8081,
        LOG_LEVEL: 'silent',
        LOG_PRETTY: false,
      },
    ],
    [{ PORT: '1' }, { PORT: 1 }],
    [{ PORT: '65535' }, { PORT: 65535 }],
    [{ LOG_PRETTY: 'true' }, { LOG_PRETTY: true }],
    [{ MOCK_DEFAULT_COMPLETION_TOKENS: '1' }, { MOCK_DEFAULT_COMPLETION_TOKENS: 1 }],
    [{ MOCK_DEFAULT_COMPLETION_TOKENS: '4096' }, { MOCK_DEFAULT_COMPLETION_TOKENS: 4096 }],
    [{ MOCK_MAX_DELAY_MS: '1' }, { MOCK_MAX_DELAY_MS: 1 }],
    [{ MOCK_MAX_DELAY_MS: '600000' }, { MOCK_MAX_DELAY_MS: 600000 }],
    [{ MOCK_DEFAULT_RETRY_AFTER_SECONDS: '0' }, { MOCK_DEFAULT_RETRY_AFTER_SECONDS: 0 }],
    [{ MOCK_DEFAULT_RETRY_AFTER_SECONDS: '3600' }, { MOCK_DEFAULT_RETRY_AFTER_SECONDS: 3600 }],
  ])('builds the app with the configuration parsed from %j', async (environment, expected) => {
    const app = await buildApp(environment);

    expect(app.config).toEqual(expect.objectContaining(expected));
    await app.server.close();
  });

  it('lists each invalid variable with its reason without echoing the received values', async () => {
    const error = await rejectionOf(
      buildApp({ NODE_ENV: 'secret-environment', PORT: 'secret-port' }),
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
    ['PORT', '0'],
    ['PORT', '65536'],
    ['NODE_ENV', 'staging'],
    ['HOST', ''],
    ['LOG_LEVEL', 'verbose'],
    ['LOG_PRETTY', 'yes'],
    ['MOCK_DEFAULT_COMPLETION_TOKENS', '0'],
    ['MOCK_DEFAULT_COMPLETION_TOKENS', '4097'],
    ['MOCK_MAX_DELAY_MS', '0'],
    ['MOCK_MAX_DELAY_MS', '600001'],
    ['MOCK_DEFAULT_RETRY_AFTER_SECONDS', '-1'],
    ['MOCK_DEFAULT_RETRY_AFTER_SECONDS', '3601'],
  ])('refuses to build the app when %s is %j', async (variable, value) => {
    const error = await rejectionOf(buildApp({ [variable]: value }));

    expect(error).toBeInstanceOf(ConfigValidationError);
    expect(error.message).toMatch(new RegExp(`^ {2}${variable} → \\S`, 'm'));
  });

  it('refuses pretty logs in production', async () => {
    const error = await rejectionOf(buildApp({ NODE_ENV: 'production', LOG_PRETTY: 'true' }));

    expect(error).toBeInstanceOf(ConfigValidationError);
    expect(error.message).toMatch(/^ {2}LOG_PRETTY → \S/m);
  });
});

function buildApp(environment: RawEnvironment): Promise<MockApp> {
  return createMockApp({
    environment,
    logDestination: new MemoryLogDestination(),
    random: Math.random,
    clock: Date.now,
  });
}

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
