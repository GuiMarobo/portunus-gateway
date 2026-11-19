import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Clock, RandomSource } from '../mock-app.factory';
import { createChatCompletion } from './chat-completion';

const CHAT_COMPLETIONS_PATH = '/v1/chat/completions';
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
});

export interface ChatCompletionsRouteDependencies {
  readonly defaultCompletionTokens: number;
  readonly random: RandomSource;
  readonly clock: Clock;
}

export function registerChatCompletionsRoute(
  server: FastifyInstance,
  { defaultCompletionTokens, random, clock }: ChatCompletionsRouteDependencies,
): void {
  server.post(CHAT_COMPLETIONS_PATH, (request) =>
    createChatCompletion(chatCompletionBodySchema.parse(request.body), {
      id: completionId(random),
      createdAtSeconds: Math.floor(clock() / MILLISECONDS_PER_SECOND),
      defaultCompletionTokens,
    }),
  );
}

function completionId(random: RandomSource): string {
  const suffix = Array.from(
    { length: COMPLETION_ID_LENGTH },
    () => COMPLETION_ID_ALPHABET[Math.floor(random() * COMPLETION_ID_ALPHABET.length)],
  ).join('');
  return `${COMPLETION_ID_PREFIX}${suffix}`;
}
