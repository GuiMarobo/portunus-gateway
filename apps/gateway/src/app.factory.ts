import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { loadConfig, type RawEnvironment } from '@portunus/common';
import { AppModule } from './app.module';
import { gatewayConfigSchema, type GatewayConfig } from './gateway-config.schema';

export interface GatewayApplication {
  readonly app: NestFastifyApplication;
  readonly config: GatewayConfig;
}

export async function createApp(environment: RawEnvironment): Promise<GatewayApplication> {
  const config = loadConfig(gatewayConfigSchema, environment);
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter());
  await app.init();
  return { app, config };
}
