import type { RawEnvironment } from '@portunus/common';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerChatCompletionsRoute } from './chat/chat-completions.route';
import { registerEmbeddingsRoute } from './embeddings/embeddings.route';
import { requireBearerAuthorization } from './errors/bearer-authorization';
import { answerErrorsInOpenAiFormat } from './errors/openai-error-handlers';
import { resolveLogDestination } from './log-destination';

import { loadMockConfig, type MockConfig } from './mock-config';
import { loggerOptions, SingleLineRequestLogController } from './request-logging';
import { scenarioHandling } from './scenario/scenario-pre-handler';

const HEALTH_PATH = '/health';
const MAX_SCENARIO_PATH_SEGMENT_LENGTH = 1024;

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
    routerOptions: { maxParamLength: MAX_SCENARIO_PATH_SEGMENT_LENGTH },
  });
  answerErrorsInOpenAiFormat(server);
  requireBearerAuthorization(server, [HEALTH_PATH]);
  server.get(HEALTH_PATH, () => ({ status: 'ok' }));
  const scenario = scenarioHandling({
    maxDelayMs: config.MOCK_MAX_DELAY_MS,
    defaultRetryAfterSeconds: config.MOCK_DEFAULT_RETRY_AFTER_SECONDS,
    defaultScenario: config.MOCK_DEFAULT_SCENARIO,
    random,
  });
  registerChatCompletionsRoute(server, {
    defaultCompletionTokens: config.MOCK_DEFAULT_COMPLETION_TOKENS,
    random,
    clock,
    scenario,
  });
  registerEmbeddingsRoute(server, {
    defaultDimensions: config.MOCK_EMBEDDING_DIMENSIONS,
    maxDimensions: config.MOCK_MAX_EMBEDDING_DIMENSIONS,
    scenario,
  });
  await server.ready();
  return { server, config };
}
