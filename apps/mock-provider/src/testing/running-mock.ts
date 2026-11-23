import type { RawEnvironment } from '@portunus/common';
import type { ExitProcess } from '../graceful-shutdown';
import { createMockApp, type MockApp } from '../mock-app.factory';
import { MemoryLogDestination } from './memory-log-destination';

const LOOPBACK_HOST = '127.0.0.1';
const EPHEMERAL_PORT = 0;
const FIXED_RANDOM_VALUE = 0.5;
const FIXED_EPOCH_MS = Date.UTC(2026, 0, 1);

export interface RunningMock {
  readonly baseUrl: string;
  readonly app: MockApp;
  close(): Promise<void>;
}

export async function startMock(
  environment: RawEnvironment = {},
  logDestination: MemoryLogDestination = new MemoryLogDestination(),
  exitProcess: ExitProcess = () => undefined,
): Promise<RunningMock> {
  const app = await createMockApp({
    environment,
    logDestination,
    random: () => FIXED_RANDOM_VALUE,
    clock: () => FIXED_EPOCH_MS,
    exitProcess,
  });
  const baseUrl = await app.server.listen({ host: LOOPBACK_HOST, port: EPHEMERAL_PORT });
  return { baseUrl, app, close: () => app.server.close() };
}
