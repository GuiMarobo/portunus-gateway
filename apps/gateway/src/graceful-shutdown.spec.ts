import { Controller, Get, Module } from '@nestjs/common';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { Server } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from './app.factory';
import type { ExitProcess } from './graceful-shutdown';
import { type LogEntry, MemoryLogDestination } from './testing/memory-log-destination';

const LOOPBACK_HOST = '127.0.0.1';
const EPHEMERAL_PORT = 0;
const WARN_LEVEL = 40;

class SlowRequestGate {
  private enter: () => void = () => undefined;
  private release: () => void = () => undefined;
  readonly entered = new Promise<void>((resolve) => (this.enter = resolve));
  private readonly released = new Promise<void>((resolve) => (this.release = resolve));

  async pass(): Promise<void> {
    this.enter();
    await this.released;
  }

  open(): void {
    this.release();
  }
}

let gate = new SlowRequestGate();

@Controller('slow')
class SlowController {
  @Get()
  async respond(): Promise<{ finished: true }> {
    await gate.pass();
    return { finished: true };
  }
}

@Module({ controllers: [SlowController] })
class SlowModule {}

const logs = new MemoryLogDestination();

async function listeningApp(
  environment: Record<string, string>,
  exitProcess: ExitProcess = () => undefined,
): Promise<{ app: NestFastifyApplication; slowUrl: string }> {
  const app = await createApp(
    { LOG_LEVEL: 'info', ...environment },
    logs,
    [SlowModule],
    exitProcess,
  );
  await app.listen(EPHEMERAL_PORT, LOOPBACK_HOST);
  return { app, slowUrl: `${await app.getUrl()}/slow` };
}

async function untilStopsListening(server: Server): Promise<void> {
  while (server.listening) {
    await new Promise(setImmediate);
  }
}

function logMessages(): unknown[] {
  return logs.entries().map((entry: LogEntry) => entry.msg);
}

describe('graceful shutdown', () => {
  afterEach(() => {
    logs.clear();
    gate.open();
    gate = new SlowRequestGate();
  });

  it('lets a request in flight when the server stops listening finish before the application closes', async () => {
    const { app, slowUrl } = await listeningApp({});
    const inFlight = fetch(slowUrl);
    await gate.entered;

    const closing = app.close();
    await untilStopsListening(app.getHttpServer());
    gate.open();
    const response = await inFlight;

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ finished: true });
    await closing;
    expect(logMessages()).toContain('Graceful shutdown completed');
  });

  it('forces the process to exit with code 1 and warns when closing exceeds the deadline', async () => {
    let reportExit: (code: number) => void = () => undefined;
    const exitCode = new Promise<number>((resolve) => (reportExit = resolve));
    const { app, slowUrl } = await listeningApp({ SHUTDOWN_TIMEOUT_MS: '20' }, reportExit);
    const inFlight = fetch(slowUrl);
    await gate.entered;

    const closing = app.close();

    expect(await exitCode).toBe(1);
    expect(logs.entries().filter((entry) => entry.level === WARN_LEVEL)).toMatchObject([
      { context: 'GracefulShutdown', msg: 'Graceful shutdown exceeded 20ms; forcing exit' },
    ]);
    gate.open();
    await (await inFlight).text();
    await closing;
  });
});
