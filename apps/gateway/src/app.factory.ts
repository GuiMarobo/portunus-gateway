import type { Type } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import type { RawEnvironment } from '@portunus/common';
import { Logger } from 'nestjs-pino';
import type { DestinationStream } from 'pino';
import { AppModule } from './app.module';
import { GatewayConfig } from './gateway-config';
import { exitCurrentProcess, type ExitProcess } from './graceful-shutdown';
import { resolveLogDestination } from './log-destination';
import { REQUEST_ID_HEADER, requestIdFromHeaders } from './request-id';

const CONNECTION_HEADER = 'connection';
const CLOSE_CONNECTION = 'close';

export async function createApp(
  environment: RawEnvironment,
  logDestination: DestinationStream,
  additionalModules: Type[] = [],
  exitProcess: ExitProcess = exitCurrentProcess,
): Promise<NestFastifyApplication> {
  const config = new GatewayConfig(environment);
  const destination = await resolveLogDestination(config, logDestination);
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule.register(config, destination, additionalModules, exitProcess),
    new FastifyAdapter({ logger: false, genReqId: requestIdFromHeaders }),
    { bufferLogs: true },
  );
  app.useLogger(app.get(Logger));
  app.flushLogs();
  const fastify = app.getHttpAdapter().getInstance();
  fastify.addHook('onRequest', (request, reply, done) => {
    reply.header(REQUEST_ID_HEADER, request.id);
    done();
  });
  closeConnectionsAfterResponseWhileClosing(app);
  await app.init();
  return app;
}

function closeConnectionsAfterResponseWhileClosing(app: NestFastifyApplication): void {
  const fastify = app.getHttpAdapter().getInstance();
  let closing = false;
  fastify.addHook('preClose', (done) => {
    closing = true;
    done();
  });
  fastify.addHook('onSend', (_request, reply, payload, done) => {
    if (closing) {
      reply.header(CONNECTION_HEADER, CLOSE_CONNECTION);
    }
    done(null, payload);
  });
}
