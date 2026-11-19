import { ConfigValidationError, type RawEnvironment } from '@portunus/common';
import { createMockApp, type LogDestination } from './mock-app.factory';

const INVALID_CONFIGURATION_EXIT_CODE = 1;

export interface StartupProcess {
  exitCode?: number | string | null | undefined;
  readonly stdout: LogDestination;
  readonly stderr: { write(chunk: string): boolean };
}

export async function bootstrapMock(
  environment: RawEnvironment,
  startupProcess: StartupProcess,
): Promise<void> {
  try {
    const { server, config } = await createMockApp({
      environment,
      logDestination: startupProcess.stdout,
      random: Math.random,
      clock: Date.now,
    });
    await server.listen({ host: config.HOST, port: config.PORT });
  } catch (error) {
    reportStartupFailure(error, startupProcess);
  }
}

function reportStartupFailure(error: unknown, startupProcess: StartupProcess): void {
  if (!(error instanceof ConfigValidationError)) {
    throw error;
  }
  startupProcess.stderr.write(`${error.message}\n`);
  startupProcess.exitCode = INVALID_CONFIGURATION_EXIT_CODE;
}
