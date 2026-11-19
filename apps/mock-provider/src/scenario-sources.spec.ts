import OpenAI from 'openai';
import { afterEach, assert, describe, expect, it } from 'vitest';
import { type RunningMock, startMock } from './testing/running-mock';

const CHAT_COMPLETIONS_PATH = '/v1/chat/completions';
const VALID_BODY = JSON.stringify({
  model: 'any-model-name',
  messages: [{ role: 'user', content: 'Hello there!' }],
});

describe('scenario sources', () => {
  let mock: RunningMock;

  afterEach(async () => {
    await mock.close();
  });

  async function post(path: string, headers: Record<string, string> = {}) {
    const response = await fetch(`${mock.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer test-key', ...headers },
      body: VALID_BODY,
    });
    const body: unknown = await response.json();
    return { status: response.status, retryAfter: response.headers.get('retry-after'), body };
  }

  describe('scenario in the /scenarios/{scenario} path prefix', () => {
    it.each([
      ['written raw', 'error=503', 503, null],
      ['escaped', 'error%3D503%3Berror-rate%3D1', 503, null],
      [
        'longer than 100 characters',
        'latency=10-10;ttfb=10-10;chunk-delay=10;tokens=5;error=429;error-rate=1.00;retry-after=7;seed=4294967295',
        429,
        '7',
      ],
    ])('applies a scenario %s', async (_case, scenario, status, retryAfter) => {
      mock = await startMock();

      const response = await post(`/scenarios/${scenario}${CHAT_COMPLETIONS_PATH}`);

      expect(response).toMatchObject({ status, retryAfter });
    });

    it('reaches the official SDK configured with a base URL ending in the scenario prefix', async () => {
      mock = await startMock();
      const client = new OpenAI({
        baseURL: `${mock.baseUrl}/scenarios/error=429;retry-after=4/v1`,
        apiKey: 'test-key',
        maxRetries: 0,
      });

      const failure = await client.chat.completions
        .create({ model: 'any-model-name', messages: [{ role: 'user', content: 'Hello there!' }] })
        .catch((error: unknown) => error);

      assert(failure instanceof OpenAI.RateLimitError);
      expect(failure.status).toBe(429);
      expect(failure.headers.get('retry-after')).toBe('4');
    });
  });

  it('answers 400 to an invalid scenario in the path, naming the path as the param', async () => {
    mock = await startMock();

    const response = await post(`/scenarios/client-echo-marker=1${CHAT_COMPLETIONS_PATH}`);

    expect(response).toMatchObject({
      status: 400,
      body: {
        error: {
          message: expect.stringContaining('unknown key') as unknown,
          type: 'invalid_request_error',
          param: '/scenarios/{scenario}',
          code: null,
        },
      },
    });
    expect(JSON.stringify(response.body)).not.toContain('client-echo-marker');
  });

  describe('instance default in MOCK_DEFAULT_SCENARIO', () => {
    it.each([
      ['applies the default scenario', 'error=503', 503],
      ['answers normally when the default is empty', '', 200],
    ])('%s to a request without header or path prefix', async (_case, defaultScenario, status) => {
      mock = await startMock({ MOCK_DEFAULT_SCENARIO: defaultScenario });

      const response = await post(CHAT_COMPLETIONS_PATH);

      expect(response.status).toBe(status);
    });

    it('leaves GET /health untouched', async () => {
      mock = await startMock({ MOCK_DEFAULT_SCENARIO: 'error=503' });

      const response = await fetch(`${mock.baseUrl}/health`);

      expect(response.status).toBe(200);
    });
  });

  describe('precedence of whole scenarios: header > path > environment', () => {
    const HEADER_SCENARIO = 'error=500';
    const PATH_PREFIX = '/scenarios/error=503';
    const ENVIRONMENT = { MOCK_DEFAULT_SCENARIO: 'error=429' };

    it.each([
      ['header over path', {}, true, PATH_PREFIX, 500],
      ['path over environment', ENVIRONMENT, false, PATH_PREFIX, 503],
      ['header over environment', ENVIRONMENT, true, '', 500],
      ['header over path and environment', ENVIRONMENT, true, PATH_PREFIX, 500],
    ])('applies %s', async (_case, environment, withHeader, prefix, status) => {
      mock = await startMock(environment);

      const response = await post(
        `${prefix}${CHAT_COMPLETIONS_PATH}`,
        withHeader ? { 'x-mock-scenario': HEADER_SCENARIO } : {},
      );

      expect(response.status).toBe(status);
    });
  });
});
