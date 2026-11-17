import 'reflect-metadata';
import { ConfigValidationError } from '@portunus/common';
import { createApp } from './app.factory';
import { GatewayConfig } from './gateway-config';

const INVALID_CONFIGURATION_EXIT_CODE = 1;

async function bootstrap(): Promise<void> {
  const app = await createApp(process.env);
  const { PORT, HOST } = app.get(GatewayConfig);
  await app.listen(PORT, HOST);
}

function handleStartupFailure(error: unknown): void {
  if (!(error instanceof ConfigValidationError)) {
    throw error;
  }
  process.stderr.write(`${error.message}\n`);
  process.exitCode = INVALID_CONFIGURATION_EXIT_CODE;
}

bootstrap().catch(handleStartupFailure);
