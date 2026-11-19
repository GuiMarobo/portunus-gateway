import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { sendOpenAiError } from '../errors/openai-error';
import type { Clock, RandomSource } from '../mock-app.factory';
import { SCENARIO_PATH_PARAM, type ScenarioPreHandler } from '../scenario/scenario-pre-handler';
import { createChatCompletion } from './chat-completion';

const SUPPORTED_CHOICE_COUNT = 1;
const BAD_REQUEST_STATUS = 400;
const PARAM_PATH_SEPARATOR = '.';

const CHAT_COMPLETIONS_PATH = '/v1/chat/completions';
const CHAT_COMPLETIONS_PATHS = [
  CHAT_COMPLETIONS_PATH,
  `/scenarios/:${SCENARIO_PATH_PARAM}${CHAT_COMPLETIONS_PATH}`,
];
const COMPLETION_ID_PREFIX = 'chatcmpl-';
const COMPLETION_ID_LENGTH = 24;
const COMPLETION_ID_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const MILLISECONDS_PER_SECOND = 1000;

const tokenLimitSchema = z.int().positive().nullish();

const chatCompletionBodySchema = z.looseObject({
  model: z.string().min(1),
  messages: z.array(z.looseObject({ role: z.string(), content: z.string() })).min(1),
  max_tokens: tokenLimitSchema,
  max_completion_tokens: tokenLimitSchema,
  n: z.literal(SUPPORTED_CHOICE_COUNT).nullish(),
});

export interface ChatCompletionsRouteDependencies {
  readonly defaultCompletionTokens: number;
  readonly random: RandomSource;
  readonly clock: Clock;
  readonly applyScenario: ScenarioPreHandler;
}

export function registerChatCompletionsRoute(
  server: FastifyInstance,
  { defaultCompletionTokens, random, clock, applyScenario }: ChatCompletionsRouteDependencies,
): void {
  CHAT_COMPLETIONS_PATHS.forEach((path) => {
    server.post(path, { preHandler: applyScenario }, (request, reply) => {
      const body = chatCompletionBodySchema.safeParse(request.body);
      if (!body.success) {
        return sendInvalidParameter(reply, body.error);
      }
      return createChatCompletion(body.data, {
        id: completionId(random),
        createdAtSeconds: Math.floor(clock() / MILLISECONDS_PER_SECOND),
        defaultCompletionTokens,
      });
    });
  });
}

function sendInvalidParameter(reply: FastifyReply, error: z.ZodError): FastifyReply {
  const param = error.issues[0]?.path.join(PARAM_PATH_SEPARATOR) ?? null;
  return sendOpenAiError(reply, BAD_REQUEST_STATUS, {
    message: `Missing or invalid value for parameter '${param ?? ''}'.`,
    type: 'invalid_request_error',
    param,
    code: null,
  });
}

function completionId(random: RandomSource): string {
  const suffix = Array.from(
    { length: COMPLETION_ID_LENGTH },
    () => COMPLETION_ID_ALPHABET[Math.floor(random() * COMPLETION_ID_ALPHABET.length)],
  ).join('');
  return `${COMPLETION_ID_PREFIX}${suffix}`;
}
