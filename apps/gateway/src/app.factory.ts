import type { Type } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import type { RawEnvironment } from '@portunus/common';
import { Logger } from 'nestjs-pino';
import type { DestinationStream } from 'pino';
import { AppModule } from './app.module';
import { GatewayConfig } from './gateway-config';
import { resolveLogDestination } from './log-destination';
import { REQUEST_ID_HEADER, requestIdFromHeaders } from './request-id';

export async function createApp(
  environment: RawEnvironment,
  logDestination: DestinationStream,
  additionalModules: Type[] = [],
): Promise<NestFastifyApplication> {
  const config = new GatewayConfig(environment);
  const destination = await resolveLogDestination(config, logDestination);
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule.register(config, destination, additionalModules),
    new FastifyAdapter({ logger: false, genReqId: requestIdFromHeaders }),
    { bufferLogs: true },
  );
  app.useLogger(app.get(Logger));
  app.flushLogs();
  app
    .getHttpAdapter()
    .getInstance()
    .addHook('onRequest', (request, reply, done) => {
      reply.header(REQUEST_ID_HEADER, request.id);
      done();
    });
  await app.init();
  return app;
}
