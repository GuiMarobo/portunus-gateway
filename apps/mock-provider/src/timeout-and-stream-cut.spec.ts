import type { IncomingMessage, ServerResponse } from 'node:http';
import { performance } from 'node:perf_hooks';
import { setImmediate as nextTurn } from 'node:timers/promises';
import OpenAI, { APIConnectionTimeoutError } from 'openai';
import { afterEach, describe, expect, it } from 'vitest';
import { type RunningMock, startMock } from './testing/running-mock';

const CHAT_COMPLETIONS_PATH = '/v1/chat/completions';
const BASE_REQUEST = {
  model: 'any-model-name',
  messages: [{ role: 'user' as const, content: 'Hello there!' }],
};
const SHORT_CEILING_MS = 100;
const SDK_TIMEOUT_MS = 50;

interface Chunk {
  readonly choices: readonly {
    readonly delta: { readonly role?: string };
    readonly finish_reason: string | null;
  }[];
}

interface BrokenRead {
  readonly text: string;
  readonly error: unknown;
}

describe('failures over time', () => {
  let mock: RunningMock;

  afterEach(async () => {
    await mock.close();
  });

  function post(body: object, scenario: string): Promise<Response> {
    return fetch(`${mock.baseUrl}${CHAT_COMPLETIONS_PATH}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer test-key',
        'x-mock-scenario': scenario,
      },
      body: JSON.stringify(body),
    });
  }

  describe('error=timeout', () => {
    it.each([
      ['without stream', {}],
      ['with stream', { stream: true }],
    ])(
      'sends nothing and drops the connection at MOCK_MAX_DELAY_MS %s',
      async (_case, streaming) => {
        mock = await startMock({ MOCK_MAX_DELAY_MS: String(SHORT_CEILING_MS) });
        const startedAt = performance.now();

        await expect(post({ ...BASE_REQUEST, ...streaming }, 'error=timeout')).rejects.toThrow(
          'fetch failed',
        );

        expect(performance.now() - startedAt).toBeGreaterThanOrEqual(SHORT_CEILING_MS);
      },
    );

    it('lets an SDK with a short timeout fail with its timeout error and releases the wait timer', async () => {
      mock = await startMock();
      const pendingTimers = () =>
        process.getActiveResourcesInfo().filter((resource) => resource === 'Timeout').length;
      const timersBeforeRequest = pendingTimers();
      const serverResponseClosed = nextServerResponseClose();
      const client = clientForMock({ timeout: SDK_TIMEOUT_MS });

      await expect(
        client.chat.completions.create(BASE_REQUEST, {
          headers: { 'x-mock-scenario': 'error=timeout' },
        }),
      ).rejects.toBeInstanceOf(APIConnectionTimeoutError);
      await serverResponseClosed;
      await nextTurn();

      expect(pendingTimers()).toBeLessThanOrEqual(timersBeforeRequest);
    });
  });

  describe('error=stream-cut', () => {
    it.each([
      ['cut-after=2', {}, 2],
      ['no cut-after', {}, 0],
      ['cut-after=10', { max_tokens: 3 }, 3],
    ])(
      'sends 200, the role chunk and the content chunks allowed by %s, then breaks the connection without finish nor [DONE]',
      async (cutAfter, limit, contentChunks) => {
        mock = await startMock();
        const scenario =
          cutAfter === 'no cut-after' ? 'error=stream-cut' : `error=stream-cut;${cutAfter}`;

        const response = await post({ ...BASE_REQUEST, ...limit, stream: true }, scenario);
        const received = await readUntilBroken(response);

        expect(response.status).toBe(200);
        expect(received.error).toBeInstanceOf(TypeError);
        expect(received.text).not.toContain('[DONE]');
        const chunks = sseData(received.text).map((data) => JSON.parse(data) as Chunk);
        expect(chunks).toHaveLength(1 + contentChunks);
        expect(chunks[0]?.choices[0]?.delta.role).toBe('assistant');
        expect(chunks.every((chunk) => chunk.choices[0]?.finish_reason === null)).toBe(true);
      },
    );

    it('lets the SDK read the chunks sent before the cut and then fail with a connection error', async () => {
      mock = await startMock();
      const stream = await clientForMock().chat.completions.create(
        { ...BASE_REQUEST, stream: true },
        { headers: { 'x-mock-scenario': 'error=stream-cut;cut-after=2' } },
      );
      const received: unknown[] = [];

      const iterating = (async () => {
        for await (const chunk of stream) {
          received.push(chunk);
        }
      })();

      await expect(iterating).rejects.toMatchObject({ name: 'TypeError', message: 'terminated' });
      expect(received).toHaveLength(3);
    });
  });

  it('answers 400 to error=stream-cut on a request without stream', async () => {
    mock = await startMock();

    const response = await post(BASE_REQUEST, 'error=stream-cut;cut-after=2');

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        message: 'error=stream-cut only applies to streaming requests (stream: true).',
        type: 'invalid_request_error',
        param: 'stream',
        code: null,
      },
    });
  });

  describe('error-rate with seed', () => {
    const seeds = Array.from({ length: 10 }, (_unused, index) => index + 1);

    async function outcomeOf(scenario: string): Promise<'answered' | 'failed'> {
      try {
        const response = await post({ ...BASE_REQUEST, stream: true }, scenario);
        const { error } = await readUntilBroken(response);
        return error === undefined ? 'answered' : 'failed';
      } catch {
        return 'failed';
      }
    }

    function outcomesForSeeds(failure: string): Promise<string[]> {
      return Promise.all(
        seeds.map((seed) => outcomeOf(`${failure};error-rate=0.5;seed=${String(seed)}`)),
      );
    }

    it.each([['error=timeout'], ['error=stream-cut']])(
      'repeats the same mix of failures and answers for the same seeds with %s',
      async (failure) => {
        mock = await startMock({ MOCK_MAX_DELAY_MS: String(SHORT_CEILING_MS) });

        const firstRun = await outcomesForSeeds(failure);
        const secondRun = await outcomesForSeeds(failure);

        expect(secondRun).toEqual(firstRun);
        expect(new Set(firstRun)).toEqual(new Set(['answered', 'failed']));
      },
    );
  });

  async function readUntilBroken(response: Response): Promise<BrokenRead> {
    const decoder = new TextDecoder();
    let text = '';
    const body: ReadableStream<Uint8Array> | null = response.body;
    if (body === null) {
      return { text, error: undefined };
    }
    try {
      for await (const bytes of body) {
        text += decoder.decode(bytes, { stream: true });
      }
    } catch (error) {
      return { text, error };
    }
    return { text, error: undefined };
  }

  function sseData(text: string): string[] {
    return text
      .split('\n\n')
      .filter((block) => block.startsWith('data: '))
      .map((block) => block.slice('data: '.length));
  }

  function clientForMock(options: { timeout?: number } = {}): OpenAI {
    return new OpenAI({
      baseURL: `${mock.baseUrl}/v1`,
      apiKey: 'test-key',
      maxRetries: 0,
      ...options,
    });
  }

  function nextServerResponseClose(): Promise<ServerResponse> {
    return new Promise((resolve) => {
      mock.app.server.server.once(
        'request',
        (_request: IncomingMessage, response: ServerResponse) => {
          response.once('close', () => {
            resolve(response);
          });
        },
      );
    });
  }
});
