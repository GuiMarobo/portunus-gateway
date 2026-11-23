import { EventEmitter, once } from 'node:events';
import { createServer, type AddressInfo } from 'node:net';
import { setImmediate as nextTurn } from 'node:timers/promises';
import { afterEach, describe, expect, it } from 'vitest';
import type { MockApp } from './mock-app.factory';
import { bootstrapMock, type StartupProcess } from './mock.bootstrap';
import { startUploadingSlowly } from './testing/slow-upload';

const LOOPBACK_HOST = '127.0.0.1';
const BASE_REQUEST = {
  model: 'any-model-name',
  messages: [{ role: 'user' as const, content: 'Hello there!' }],
};

interface FakeStartupProcess extends StartupProcess {
  readonly stderr: { write(chunk: string): boolean; text(): string };
  readonly signals: EventEmitter;
  readonly exitCodes: Promise<number>;
}

describe('mock bootstrap', () => {
  let app: MockApp | undefined;

  afterEach(async () => {
    await app?.server.close();
    app = undefined;
  });

  async function bootstrapOnFreePort(
    startup: FakeStartupProcess,
    environment: Record<string, string> = {},
  ): Promise<string> {
    const port = await freePort();
    app = await bootstrapMock({ HOST: LOOPBACK_HOST, PORT: String(port), ...environment }, startup);
    return `http://${LOOPBACK_HOST}:${String(port)}`;
  }

  it('exits with code 1 and reports each invalid variable without its value', async () => {
    const startup = fakeStartupProcess();

    await bootstrapMock({ PORT: 'secret-port', LOG_LEVEL: 'secret-level' }, startup);

    expect(startup.exitCode).toBe(1);
    expect(startup.stderr.text()).toMatch(/^ {2}PORT → \S/m);
    expect(startup.stderr.text()).toMatch(/^ {2}LOG_LEVEL → \S/m);
    expect(startup.stderr.text()).not.toContain('secret');
  });

  it.each(['SIGTERM', 'SIGINT'])(
    'closes the server when the process receives %s',
    async (signal) => {
      const startup = fakeStartupProcess();
      const baseUrl = await bootstrapOnFreePort(startup);
      const server = app?.server;

      startup.signals.emit(signal);
      while (server?.server.listening === true) {
        await nextTurn();
      }

      await expect(fetch(`${baseUrl}/health`)).rejects.toThrow('fetch failed');
    },
  );

  it('exits the process with code 1 when closing exceeds SHUTDOWN_TIMEOUT_MS', async () => {
    const startup = fakeStartupProcess();
    const baseUrl = await bootstrapOnFreePort(startup, { SHUTDOWN_TIMEOUT_MS: '20' });
    if (app === undefined) {
      throw new Error('mock did not start');
    }
    const neverFinishedUpload = await startUploadingSlowly(app.server, baseUrl, BASE_REQUEST);

    startup.signals.emit('SIGTERM');

    expect(await startup.exitCodes).toBe(1);
    neverFinishedUpload.request.destroy();
    await expect(neverFinishedUpload.response).rejects.toThrow('socket hang up');
  });
});

async function freePort(): Promise<number> {
  const probe = createServer().listen(0, LOOPBACK_HOST);
  await once(probe, 'listening');
  const { port } = probe.address() as AddressInfo;
  probe.close();
  await once(probe, 'close');
  return port;
}

function fakeStartupProcess(): FakeStartupProcess {
  const written: string[] = [];
  const signals = new EventEmitter();
  let reportExit: (code: number) => void = () => undefined;
  const exitCodes = new Promise<number>((resolve) => (reportExit = resolve));
  return {
    exitCode: undefined,
    stdout: { write: () => undefined },
    signals,
    exitCodes,
    once: (signal, listener) => signals.once(signal, listener),
    exit: (code) => {
      reportExit(code);
    },
    stderr: {
      write: (chunk: string) => written.push(chunk) > 0,
      text: () => written.join(''),
    },
  };
}
