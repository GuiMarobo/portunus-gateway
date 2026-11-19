import { performance } from 'node:perf_hooks';
import { afterEach, describe, expect, it } from 'vitest';
import { type RunningMock, startMock } from './testing/running-mock';

const CHAT_COMPLETIONS_PATH = '/v1/chat/completions';
const VALID_BODY = JSON.stringify({
  model: 'any-model-name',
  messages: [{ role: 'user', content: 'Hello there!' }],
});

describe('scenario in the x-mock-scenario header', () => {
  let mock: RunningMock;

  afterEach(async () => {
    await mock.close();
  });

  async function postWithScenario(scenario: string) {
    const startedAt = performance.now();
    const response = await fetch(`${mock.baseUrl}${CHAT_COMPLETIONS_PATH}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer test-key',
        'x-mock-scenario': scenario,
      },
      body: VALID_BODY,
    });
    const body: unknown = await response.json();
    return {
      status: response.status,
      retryAfter: response.headers.get('retry-after'),
      body,
      elapsedMs: performance.now() - startedAt,
    };
  }

  describe('latency', () => {
    it.each([
      ['a fixed latency', 'latency=50', 50],
      ['the middle of a range when the random source gives 0.5', 'latency=40-60', 50],
    ])('delays the answer by at least %s', async (_case, scenario, minimumMs) => {
      mock = await startMock();

      const response = await postWithScenario(scenario);

      expect(response.status).toBe(200);
      expect(response.elapsedMs).toBeGreaterThanOrEqual(minimumMs);
    });
  });

  describe('rate limit', () => {
    it.each([
      ['MOCK_DEFAULT_RETRY_AFTER_SECONDS', 'error=429', '2'],
      ['the retry-after key', 'error=429;retry-after=3', '3'],
    ])('answers 429 with Retry-After taken from %s', async (_case, scenario, retryAfter) => {
      mock = await startMock({ MOCK_DEFAULT_RETRY_AFTER_SECONDS: '2' });

      const response = await postWithScenario(scenario);

      expect(response).toMatchObject({
        status: 429,
        retryAfter,
        body: {
          error: {
            message: expect.any(String) as unknown,
            type: 'requests',
            param: null,
            code: 'rate_limit_exceeded',
          },
        },
      });
    });
  });

  describe('server errors', () => {
    it.each([
      ['error=500', 500],
      ['error=503', 503],
    ])('answers %s with that status and a server_error body', async (scenario, status) => {
      mock = await startMock();

      const response = await postWithScenario(scenario);

      expect(response).toMatchObject({
        status,
        body: {
          error: {
            message: expect.any(String) as unknown,
            type: 'server_error',
            param: null,
            code: null,
          },
        },
      });
    });
  });

  describe('error rate', () => {
    it.each([
      ['applies', 'error=503;error-rate=0.6', 503],
      ['skips', 'error=503;error-rate=0.4', 200],
    ])(
      '%s the error when the random source gives 0.5 and the scenario is %s',
      async (_case, scenario, status) => {
        mock = await startMock();

        const response = await postWithScenario(scenario);

        expect(response.status).toBe(status);
      },
    );

    it('repeats the same mix of errors and answers for the same seeds', async () => {
      mock = await startMock();
      const seeds = Array.from({ length: 10 }, (_unused, index) => index + 1);
      const statusesFor = async () => {
        const responses = await Promise.all(
          seeds.map((seed) => postWithScenario(`error=503;error-rate=0.5;seed=${String(seed)}`)),
        );
        return responses.map((response) => response.status);
      };

      const firstRun = await statusesFor();
      const secondRun = await statusesFor();

      expect(secondRun).toEqual(firstRun);
      expect(new Set(firstRun)).toEqual(new Set([200, 503]));
    });
  });

  it('gives each of two simultaneous requests the behaviour of its own scenario', async () => {
    mock = await startMock();

    const [slowFailure, fastRateLimit, plain] = await Promise.all([
      postWithScenario('latency=60;error=503'),
      postWithScenario('error=429;retry-after=5'),
      postWithScenario(''),
    ]);

    expect(slowFailure.status).toBe(503);
    expect(slowFailure.elapsedMs).toBeGreaterThanOrEqual(60);
    expect(fastRateLimit).toMatchObject({ status: 429, retryAfter: '5' });
    expect(plain.status).toBe(200);
  });

  describe('invalid scenarios', () => {
    const MARKER = 'client-echo-marker';

    it.each([
      ['an unknown key', `${MARKER}=1`, 'unknown key'],
      ['an invalid value', `latency=${MARKER}`, 'latency: must be N or MIN-MAX milliseconds'],
    ])(
      'answers 400 for %s, saying what is wrong without echoing the value',
      async (_case, scenario, problem) => {
        mock = await startMock();

        const response = await postWithScenario(scenario);

        expect(response).toMatchObject({
          status: 400,
          body: {
            error: {
              message: expect.stringContaining(problem) as unknown,
              type: 'invalid_request_error',
              param: 'x-mock-scenario',
              code: null,
            },
          },
        });
        expect(JSON.stringify(response.body)).not.toContain(MARKER);
      },
    );

    it('answers 400 to a wait above MOCK_MAX_DELAY_MS', async () => {
      mock = await startMock({ MOCK_MAX_DELAY_MS: '100' });

      const response = await postWithScenario('latency=101');

      expect(response).toMatchObject({
        status: 400,
        body: {
          error: {
            message: expect.stringContaining('above the 100 ms ceiling') as unknown,
            param: 'x-mock-scenario',
          },
        },
      });
    });
  });
});
