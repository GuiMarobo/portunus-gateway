import type { IncomingMessage, ServerResponse } from 'node:http';
import { performance } from 'node:perf_hooks';
import { setImmediate as nextTurn } from 'node:timers/promises';
import OpenAI from 'openai';
import type {
  ChatCompletionChunk,
  ChatCompletionCreateParamsStreaming,
} from 'openai/resources/chat/completions';
import { afterEach, describe, expect, it } from 'vitest';
import { type RunningMock, startMock } from './testing/running-mock';

const CHAT_COMPLETIONS_PATH = '/v1/chat/completions';
const BASE_REQUEST = {
  model: 'any-model-name',
  messages: [{ role: 'user' as const, content: 'Hello there!' }],
};
const DONE_EVENT = '[DONE]';
const TTFB_MS = 60;
const CHUNK_DELAY_MS = 20;
const TIMER_GRANULARITY_MS = 1;
const CHUNK_DELAYS_IN_THREE_TOKEN_ANSWER = 4;

interface SseEvent {
  readonly data: string;
  readonly receivedAtMs: number;
}

interface RawStream {
  readonly status: number;
  readonly headers: Headers;
  readonly sentAtMs: number;
  readonly events: readonly SseEvent[];
  readonly malformedBlocks: readonly string[];
}

async function* textLines(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const decoder = new TextDecoder();
  let pending = '';
  for await (const bytes of body) {
    pending += decoder.decode(bytes, { stream: true });
    let newlineIndex = pending.indexOf('\n');
    while (newlineIndex !== -1) {
      yield pending.slice(0, newlineIndex);
      pending = pending.slice(newlineIndex + 1);
      newlineIndex = pending.indexOf('\n');
    }
  }
  if (pending.length > 0) {
    yield pending;
  }
}

async function readSse(body: ReadableStream<Uint8Array>) {
  const events: SseEvent[] = [];
  const malformedBlocks: string[] = [];
  let block: string[] = [];
  for await (const line of textLines(body)) {
    if (line.length > 0) {
      block.push(line);
      continue;
    }
    const [only, ...extra] = block;
    if (only?.startsWith('data: ') === true && extra.length === 0) {
      events.push({ data: only.slice('data: '.length), receivedAtMs: performance.now() });
    } else {
      malformedBlocks.push(block.join('\n'));
    }
    block = [];
  }
  if (block.length > 0) {
    malformedBlocks.push(block.join('\n'));
  }
  return { events, malformedBlocks };
}

describe('POST /v1/chat/completions with stream: true', () => {
  let mock: RunningMock;

  afterEach(async () => {
    await mock.close();
  });

  async function postRaw(body: object, scenario?: string): Promise<RawStream> {
    const sentAtMs = performance.now();
    const response = await fetch(`${mock.baseUrl}${CHAT_COMPLETIONS_PATH}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer test-key',
        ...(scenario === undefined ? {} : { 'x-mock-scenario': scenario }),
      },
      body: JSON.stringify(body),
    });
    if (response.body === null) {
      throw new Error('response has no body');
    }
    const { events, malformedBlocks } = await readSse(response.body);
    return {
      status: response.status,
      headers: response.headers,
      sentAtMs,
      events,
      malformedBlocks,
    };
  }

  it('frames every chunk as a "data: <json>" SSE event and ends with [DONE]', async () => {
    mock = await startMock();

    const stream = await postRaw({ ...BASE_REQUEST, stream: true });

    expect(stream.status).toBe(200);
    expect(stream.headers.get('content-type')).toBe('text/event-stream');
    expect(stream.headers.get('cache-control')).toBe('no-cache');
    expect(stream.malformedBlocks).toEqual([]);
    expect(stream.events.at(-1)?.data).toBe(DONE_EVENT);
    const chunks = stream.events.slice(0, -1).map((event) => JSON.parse(event.data) as unknown);
    expect(chunks.length).toBeGreaterThan(0);
    chunks.forEach((chunk) => {
      expect(chunk).toMatchObject({ object: 'chat.completion.chunk' });
    });
  });

  function clientForMock(): OpenAI {
    return new OpenAI({ baseURL: `${mock.baseUrl}/v1`, apiKey: 'test-key', maxRetries: 0 });
  }

  async function collectChunks(
    client: OpenAI,
    request: ChatCompletionCreateParamsStreaming,
  ): Promise<ChatCompletionChunk[]> {
    const chunks: ChatCompletionChunk[] = [];
    for await (const chunk of await client.chat.completions.create(request)) {
      chunks.push(chunk);
    }
    return chunks;
  }

  it.each([
    ['ends naturally', {}, 'stop'],
    ['is cut by max_tokens', { max_tokens: 3 }, 'length'],
  ])(
    'streams role, one content chunk per token and the finish, matching the non-stream answer when it %s',
    async (_case, limit, finishReason) => {
      mock = await startMock();
      const client = clientForMock();

      const chunks = await collectChunks(client, { ...BASE_REQUEST, ...limit, stream: true });
      const completion = await client.chat.completions.create({ ...BASE_REQUEST, ...limit });

      const [roleChunk, ...rest] = chunks;
      const finishChunk = rest.at(-1);
      const contentChunks = rest.slice(0, -1);
      expect(roleChunk?.choices[0]?.delta.role).toBe('assistant');
      expect(contentChunks).toHaveLength(completion.usage?.completion_tokens ?? -1);
      expect(contentChunks.map((chunk) => chunk.choices[0]?.delta.content).join('')).toBe(
        completion.choices[0]?.message.content,
      );
      expect(finishChunk?.choices).toEqual([{ index: 0, delta: {}, finish_reason: finishReason }]);
      expect(completion.choices[0]?.finish_reason).toBe(finishReason);
      expect(new Set(chunks.map((chunk) => chunk.id)).size).toBe(1);
    },
  );

  it.each([
    ['error=429', 429, 'requests', 'rate_limit_exceeded'],
    ['error=500', 500, 'server_error', null],
    ['error=503', 503, 'server_error', null],
  ])(
    'answers %s before any SSE header, with the same JSON error as without stream',
    async (scenario, status, type, code) => {
      mock = await startMock();

      const response = await fetch(`${mock.baseUrl}${CHAT_COMPLETIONS_PATH}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer test-key',
          'x-mock-scenario': scenario,
        },
        body: JSON.stringify({ ...BASE_REQUEST, stream: true }),
      });

      expect(response.status).toBe(status);
      expect(response.headers.get('content-type')).toMatch(/^application\/json/);
      expect(await response.json()).toMatchObject({ error: { type, param: null, code } });
    },
  );

  describe('pacing', () => {
    it('holds the first chunk for at least ttfb after the request is sent', async () => {
      mock = await startMock();

      const stream = await postRaw({ ...BASE_REQUEST, stream: true }, `ttfb=${String(TTFB_MS)}`);

      expect(stream.status).toBe(200);
      expect(stream.events[0]?.receivedAtMs).toBeGreaterThanOrEqual(
        stream.sentAtMs + TTFB_MS - TIMER_GRANULARITY_MS,
      );
    });

    it('holds the last of the five chunks of a three-token answer for one chunk-delay per chunk after the first', async () => {
      mock = await startMock();

      const stream = await postRaw(
        { ...BASE_REQUEST, max_tokens: 3, stream: true },
        `chunk-delay=${String(CHUNK_DELAY_MS)}`,
      );

      const chunkEvents = stream.events.filter((event) => event.data !== DONE_EVENT);
      expect(chunkEvents).toHaveLength(CHUNK_DELAYS_IN_THREE_TOKEN_ANSWER + 1);
      const last = chunkEvents.at(-1)?.receivedAtMs ?? Number.NaN;
      expect(last).toBeGreaterThanOrEqual(
        stream.sentAtMs +
          CHUNK_DELAYS_IN_THREE_TOKEN_ANSWER * (CHUNK_DELAY_MS - TIMER_GRANULARITY_MS),
      );
    });
  });

  it('stops writing and cancels the pending chunk timer when the client aborts mid-stream', async () => {
    mock = await startMock();
    const pendingTimers = () =>
      process.getActiveResourcesInfo().filter((resource) => resource === 'Timeout').length;
    const timersBeforeStream = pendingTimers();
    const serverResponseClosed = new Promise<ServerResponse>((resolve) => {
      mock.app.server.server.once(
        'request',
        (_request: IncomingMessage, response: ServerResponse) => {
          response.once('close', () => {
            resolve(response);
          });
        },
      );
    });
    const controller = new AbortController();
    const stream = await clientForMock().chat.completions.create(
      { ...BASE_REQUEST, stream: true },
      { signal: controller.signal, headers: { 'x-mock-scenario': 'chunk-delay=2000' } },
    );

    const received: ChatCompletionChunk[] = [];
    for await (const chunk of stream) {
      received.push(chunk);
      controller.abort();
    }
    const response = await serverResponseClosed;
    await nextTurn();

    expect(received.map((chunk) => chunk.choices[0]?.delta.role)).toEqual(['assistant']);
    expect(response.writableEnded).toBe(false);
    expect(pendingTimers()).toBeLessThanOrEqual(timersBeforeStream);
    mock.app.server.server.closeAllConnections();
  });

  describe('usage', () => {
    it('sends a last chunk with no choices and the usage of the non-stream answer when include_usage is true', async () => {
      mock = await startMock();
      const client = clientForMock();

      const chunks = await collectChunks(client, {
        ...BASE_REQUEST,
        stream: true,
        stream_options: { include_usage: true },
      });
      const completion = await client.chat.completions.create(BASE_REQUEST);

      expect(chunks.at(-1)).toMatchObject({ choices: [], usage: completion.usage });
      expect(chunks.slice(0, -1).every((chunk) => chunk.usage == null)).toBe(true);
    });

    it.each([
      ['stream_options is absent', {}],
      ['include_usage is false', { stream_options: { include_usage: false } }],
    ])('sends no usage chunk when %s', async (_case, options) => {
      mock = await startMock();

      const chunks = await collectChunks(clientForMock(), {
        ...BASE_REQUEST,
        ...options,
        stream: true,
      });

      expect(chunks.filter((chunk) => chunk.usage != null)).toEqual([]);
      expect(chunks.at(-1)?.choices[0]?.finish_reason).toBe('stop');
    });
  });
});
