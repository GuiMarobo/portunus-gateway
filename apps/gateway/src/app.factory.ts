import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import type { RawEnvironment } from '@portunus/common';
import { Logger } from 'nestjs-pino';
import type { DestinationStream } from 'pino';
import { AppModule } from './app.module';
import { GatewayConfig } from './gateway-config';
import { resolveLogDestination } from './log-destination';

export async function createApp(
  environment: RawEnvironment,
  logDestination: DestinationStream,
): Promise<NestFastifyApplication> {
  const config = new GatewayConfig(environment);
  const destination = await resolveLogDestination(config, logDestination);
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule.register(config, destination),
    new FastifyAdapter({ logger: false }),
    { bufferLogs: true },
  );
  app.useLogger(app.get(Logger));
  app.flushLogs();
  await app.init();
  return app;
}
