import { type ClientRequest, type IncomingMessage, request } from 'node:http';
import { setImmediate as nextTurn } from 'node:timers/promises';
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryLogDestination } from './testing/memory-log-destination';
import { type RunningMock, startMock } from './testing/running-mock';

const CHAT_COMPLETIONS_PATH = '/v1/chat/completions';
const BASE_REQUEST = {
  model: 'any-model-name',
  messages: [{ role: 'user' as const, content: 'Hello there!' }],
};
const LONG_WAIT_MS = 20_000;
const WARN_LEVEL = 40;

interface PartialUpload {
  readonly request: ClientRequest;
  readonly response: Promise<IncomingMessage>;
  finish(): void;
}

function pendingTimers(): number {
  return process.getActiveResourcesInfo().filter((resource) => resource === 'Timeout').length;
}

function readBody(response: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const parts: Buffer[] = [];
    response.on('data', (part: Buffer) => parts.push(part));
    response.on('end', () => {
      resolve(Buffer.concat(parts).toString('utf8'));
    });
    response.on('error', reject);
  });
}

describe('graceful shutdown', () => {
  let mock: RunningMock;

  afterEach(async () => {
    await mock.close();
  });

  function post(body: object, headers: Record<string, string> = {}): Promise<Response> {
    return fetch(`${mock.baseUrl}${CHAT_COMPLETIONS_PATH}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer test-key',
        ...headers,
      },
      body: JSON.stringify(body),
    });
  }

  async function startUploadingSlowly(body: object): Promise<PartialUpload> {
    const payload = JSON.stringify(body);
    const splitAt = Math.floor(payload.length / 2);
    const upload = request(`${mock.baseUrl}${CHAT_COMPLETIONS_PATH}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': String(Buffer.byteLength(payload)),
        authorization: 'Bearer test-key',
      },
    });
    const response = new Promise<IncomingMessage>((resolve, reject) => {
      upload.once('response', resolve);
      upload.once('error', reject);
    });
    const received = new Promise((resolve) => mock.app.server.server.once('request', resolve));
    upload.write(payload.slice(0, splitAt));
    await received;
    return { request: upload, response, finish: () => upload.end(payload.slice(splitAt)) };
  }

  it('lets a normal request in flight finish with its full response while closing', async () => {
    mock = await startMock();
    const upload = await startUploadingSlowly(BASE_REQUEST);

    const closing = mock.close();
    upload.finish();
    const response = await upload.response;

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(await readBody(response))).toMatchObject({
      object: 'chat.completion',
      choices: [{ finish_reason: 'stop' }],
    });
    await closing;
  });

  it.each([
    ['a simulated latency', `latency=${String(LONG_WAIT_MS)}`, {}],
    ['a simulated timeout', 'error=timeout', {}],
    ['a stream before its first byte', `ttfb=${String(LONG_WAIT_MS)}`, { stream: true }],
    ['a stream between chunks', `chunk-delay=${String(LONG_WAIT_MS)}`, { stream: true }],
  ])(
    'interrupts %s in progress, dropping its connection and cancelling its timer',
    async (_case, scenario, streaming) => {
      mock = await startMock({ MOCK_MAX_DELAY_MS: String(LONG_WAIT_MS) });
      const timersBeforeRequest = pendingTimers();
      const received = new Promise((resolve) => mock.app.server.server.once('request', resolve));
      const fullBody = post(
        { ...BASE_REQUEST, ...streaming },
        { 'x-mock-scenario': scenario },
      ).then((response) => response.text());
      await received;

      await mock.close();

      await expect(fullBody).rejects.toBeInstanceOf(TypeError);
      await nextTurn();
      expect(pendingTimers()).toBeLessThanOrEqual(timersBeforeRequest);
    },
  );

  it('forces the process to exit with code 1 and warns when closing exceeds SHUTDOWN_TIMEOUT_MS', async () => {
    let reportExit: (code: number) => void = () => undefined;
    const exitCode = new Promise<number>((resolve) => (reportExit = resolve));
    const logs = new MemoryLogDestination();
    mock = await startMock({ SHUTDOWN_TIMEOUT_MS: '20' }, logs, reportExit);
    const neverFinishedUpload = await startUploadingSlowly(BASE_REQUEST);

    const closing = mock.close();

    expect(await exitCode).toBe(1);
    expect(logs.entries().filter((entry) => entry.level === WARN_LEVEL)).toMatchObject([
      { msg: 'Graceful shutdown exceeded 20ms; forcing exit' },
    ]);
    neverFinishedUpload.request.destroy();
    await expect(neverFinishedUpload.response).rejects.toThrow('socket hang up');
    await closing;
  });

  it('refuses new connections once the app is closed', async () => {
    mock = await startMock();

    await mock.close();

    await expect(post(BASE_REQUEST)).rejects.toThrow('fetch failed');
  });
});
