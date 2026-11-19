import type { RawEnvironment } from '@portunus/common';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerChatCompletionsRoute } from './chat/chat-completions.route';
import { requireBearerAuthorization } from './errors/bearer-authorization';
import { answerErrorsInOpenAiFormat } from './errors/openai-error-handlers';
import { resolveLogDestination } from './log-destination';

const HEALTH_PATH = '/health';
import { loadMockConfig, type MockConfig } from './mock-config';
import { loggerOptions, SingleLineRequestLogController } from './request-logging';
import { scenarioPreHandler } from './scenario/scenario-pre-handler';

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
  random,
  clock,
}: MockAppDependencies): Promise<MockApp> {
  const config = loadMockConfig(environment);
  const server = Fastify({
    logger: loggerOptions(config, await resolveLogDestination(config, logDestination)),
    logController: new SingleLineRequestLogController(),
  });
  answerErrorsInOpenAiFormat(server);
  requireBearerAuthorization(server, [HEALTH_PATH]);
  server.get(HEALTH_PATH, () => ({ status: 'ok' }));
  registerChatCompletionsRoute(server, {
    defaultCompletionTokens: config.MOCK_DEFAULT_COMPLETION_TOKENS,
    random,
    clock,
    applyScenario: scenarioPreHandler({
      maxDelayMs: config.MOCK_MAX_DELAY_MS,
      defaultRetryAfterSeconds: config.MOCK_DEFAULT_RETRY_AFTER_SECONDS,
      random,
    }),
  });
  await server.ready();
  return { server, config };
}
