import { ConfigValidationError, type RawEnvironment } from '@portunus/common';
import type { FastifyInstance } from 'fastify';
import { createMockApp, type LogDestination, type MockApp } from './mock-app.factory';

const INVALID_CONFIGURATION_EXIT_CODE = 1;
const SHUTDOWN_SIGNALS = ['SIGTERM', 'SIGINT'] as const;

type ShutdownSignal = (typeof SHUTDOWN_SIGNALS)[number];

export interface StartupProcess {
  exitCode?: number | string | null | undefined;
  readonly stdout: LogDestination;
  readonly stderr: { write(chunk: string): boolean };
  once(signal: ShutdownSignal, listener: () => void): unknown;
  exit(code: number): void;
}

export async function bootstrapMock(
  environment: RawEnvironment,
  startupProcess: StartupProcess,
): Promise<MockApp | undefined> {
  try {
    const app = await createMockApp({
      environment,
      logDestination: startupProcess.stdout,
      random: Math.random,
      clock: Date.now,
      exitProcess: (code) => {
        startupProcess.exit(code);
      },
    });
    closeOnShutdownSignals(app.server, startupProcess);
    await app.server.listen({ host: app.config.HOST, port: app.config.PORT });
    return app;
  } catch (error) {
    reportStartupFailure(error, startupProcess);
    return undefined;
  }
}

function closeOnShutdownSignals(server: FastifyInstance, startupProcess: StartupProcess): void {
  for (const signal of SHUTDOWN_SIGNALS) {
    startupProcess.once(signal, () => {
      void server.close();
    });
  }
}

function reportStartupFailure(error: unknown, startupProcess: StartupProcess): void {
  if (!(error instanceof ConfigValidationError)) {
    throw error;
  }
  startupProcess.stderr.write(`${error.message}\n`);
  startupProcess.exitCode = INVALID_CONFIGURATION_EXIT_CODE;
}
