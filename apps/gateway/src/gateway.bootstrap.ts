import { ConfigValidationError, type RawEnvironment } from '@portunus/common';
import { destination } from 'pino';
import { createApp } from './app.factory';
import { GatewayConfig } from './gateway-config';

const INVALID_CONFIGURATION_EXIT_CODE = 1;

export interface StartupProcess {
  exitCode?: number | string | null | undefined;
  readonly stderr: { write(chunk: string): boolean };
}

export async function bootstrapGateway(
  environment: RawEnvironment,
  startupProcess: StartupProcess,
): Promise<void> {
  try {
    const app = await createApp(environment, destination());
    const { PORT, HOST } = app.get(GatewayConfig);
    await app.listen(PORT, HOST);
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
