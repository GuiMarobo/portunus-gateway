import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import type { RawEnvironment } from '@portunus/common';
import { AppModule } from './app.module';
import { GatewayConfig } from './gateway-config';

export async function createApp(environment: RawEnvironment): Promise<NestFastifyApplication> {
  const config = new GatewayConfig(environment);
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule.register(config),
    new FastifyAdapter(),
  );
  await app.init();
  return app;
}
