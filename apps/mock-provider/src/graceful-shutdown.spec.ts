import type { IncomingMessage } from 'node:http';
import { setImmediate as nextTurn } from 'node:timers/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryLogDestination } from './testing/memory-log-destination';
import { type RunningMock, startMock } from './testing/running-mock';
import { type PartialUpload, startUploadingSlowly } from './testing/slow-upload';

const CHAT_COMPLETIONS_PATH = '/v1/chat/completions';
const BASE_REQUEST = {
  model: 'any-model-name',
  messages: [{ role: 'user' as const, content: 'Hello there!' }],
};
const LONG_WAIT_MS = 20_000;
const WARN_LEVEL = 40;
const SHORT_SHUTDOWN_TIMEOUT_MS = 20;

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
    vi.useRealTimers();
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

  function uploadSlowly(body: object): Promise<PartialUpload> {
    return startUploadingSlowly(mock.app.server, mock.baseUrl, body);
  }

  it('lets a normal request in flight finish with its full response while closing', async () => {
    mock = await startMock();
    const upload = await uploadSlowly(BASE_REQUEST);

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
    const neverFinishedUpload = await uploadSlowly(BASE_REQUEST);

    const closing = mock.close();

    expect(await exitCode).toBe(1);
    expect(logs.entries().filter((entry) => entry.level === WARN_LEVEL)).toMatchObject([
      { msg: 'Graceful shutdown exceeded 20ms; forcing exit' },
    ]);
    neverFinishedUpload.request.destroy();
    await expect(neverFinishedUpload.response).rejects.toThrow('socket hang up');
    await closing;
  });

  it('never forces an exit after a clean close, even once SHUTDOWN_TIMEOUT_MS has passed', async () => {
    const exitCodes: number[] = [];
    const logs = new MemoryLogDestination();
    mock = await startMock(
      { SHUTDOWN_TIMEOUT_MS: String(SHORT_SHUTDOWN_TIMEOUT_MS) },
      logs,
      (code) => exitCodes.push(code),
    );
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

    await mock.close();
    vi.advanceTimersByTime(SHORT_SHUTDOWN_TIMEOUT_MS * 2);

    expect(exitCodes).toEqual([]);
    expect(logs.entries().filter((entry) => entry.level === WARN_LEVEL)).toEqual([]);
  });

  it('serves more than 10 simultaneous simulated waits without a listener leak warning', async () => {
    const warnings: Error[] = [];
    const collectWarning = (warning: Error) => warnings.push(warning);
    process.on('warning', collectWarning);
    mock = await startMock();

    const responses = await Promise.all(
      Array.from({ length: 11 }, () => post(BASE_REQUEST, { 'x-mock-scenario': 'latency=200' })),
    );
    await nextTurn();
    process.off('warning', collectWarning);

    expect(responses.map((response) => response.status)).toEqual(Array<number>(11).fill(200));
    expect(warnings.map((warning) => warning.name)).toEqual([]);
  });

  it('refuses new connections once the app is closed', async () => {
    mock = await startMock();

    await mock.close();

    await expect(post(BASE_REQUEST)).rejects.toThrow('fetch failed');
  });
});
