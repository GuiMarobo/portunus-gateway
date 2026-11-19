import type { RawEnvironment } from '@portunus/common';
import Fastify, { type FastifyInstance } from 'fastify';
import { resolveLogDestination } from './log-destination';
import { loadMockConfig, type MockConfig } from './mock-config';
import { loggerOptions, SingleLineRequestLogController } from './request-logging';

export type RandomSource = () => number;
export type Clock = () => number;

export interface LogDestination {
  write(line: string): void;
}

export interface MockAppDependencies {
  readonly environment: RawEnvironment;
  readonly logDestination: LogDestination;
  readonly random: RandomSource;
  readonly clock: Clock;
}

export interface MockApp {
  readonly server: FastifyInstance;
  readonly config: MockConfig;
}

export async function createMockApp({
  environment,
  logDestination,
}: MockAppDependencies): Promise<MockApp> {
  const config = loadMockConfig(environment);
  const server = Fastify({
    logger: loggerOptions(config, await resolveLogDestination(config, logDestination)),
    logController: new SingleLineRequestLogController(),
  });
  server.get('/health', () => ({ status: 'ok' }));
  await server.ready();
  return { server, config };
}
