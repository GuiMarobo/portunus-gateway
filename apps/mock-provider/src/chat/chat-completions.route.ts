import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { sendInvalidParameter } from '../errors/openai-error';
import type { Clock, RandomSource } from '../mock-app.factory';
import { SCENARIO_PATH_PARAM, type ScenarioHandling } from '../scenario/scenario-pre-handler';
import { createChatCompletion } from './chat-completion';
import { chatCompletionChunks } from './chat-completion-chunks';
import { sendServerSentEvents } from './server-sent-events';

const SUPPORTED_CHOICE_COUNT = 1;

const CHAT_COMPLETIONS_PATH = '/v1/chat/completions';
const CHAT_COMPLETIONS_PATHS = [
  CHAT_COMPLETIONS_PATH,
  `/scenarios/:${SCENARIO_PATH_PARAM}${CHAT_COMPLETIONS_PATH}`,
];
const COMPLETION_ID_PREFIX = 'chatcmpl-';
const COMPLETION_ID_LENGTH = 24;
const COMPLETION_ID_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const MILLISECONDS_PER_SECOND = 1000;
const ROLE_CHUNK_COUNT = 1;

const tokenLimitSchema = z.int().positive().nullish();

const chatCompletionBodySchema = z.looseObject({
  model: z.string().min(1),
  messages: z.array(z.looseObject({ role: z.string(), content: z.string() })).min(1),
  max_tokens: tokenLimitSchema,
  max_completion_tokens: tokenLimitSchema,
  n: z.literal(SUPPORTED_CHOICE_COUNT).nullish(),
  stream: z.boolean().nullish(),
  stream_options: z.looseObject({ include_usage: z.boolean().nullish() }).nullish(),
});

export interface ChatCompletionsRouteDependencies {
  readonly defaultCompletionTokens: number;
  readonly random: RandomSource;
  readonly clock: Clock;
  readonly scenario: ScenarioHandling;
}

export function registerChatCompletionsRoute(
  server: FastifyInstance,
  { defaultCompletionTokens, random, clock, scenario }: ChatCompletionsRouteDependencies,
): void {
  CHAT_COMPLETIONS_PATHS.forEach((path) => {
    server.post(path, { preHandler: scenario.apply }, async (request, reply) => {
      const body = chatCompletionBodySchema.safeParse(request.body);
      if (!body.success) {
        return sendInvalidParameter(reply, body.error);
      }
      const completion = createChatCompletion(body.data, {
        id: completionId(random),
        createdAtSeconds: Math.floor(clock() / MILLISECONDS_PER_SECOND),
        defaultCompletionTokens,
      });
      if (body.data.stream !== true) {
        return completion;
      }
      const chunks = chatCompletionChunks(completion, {
        includeUsage: body.data.stream_options?.include_usage === true,
      });
      const { cutAfterContentChunks, ...pacing } = scenario.streamPlanOf(request);
      reply.hijack();
      if (cutAfterContentChunks === undefined) {
        await sendServerSentEvents(reply.raw, chunks, pacing);
        return reply;
      }
      const contentChunks = Math.min(cutAfterContentChunks, completion.usage.completion_tokens);
      await sendServerSentEvents(
        reply.raw,
        chunks.slice(0, ROLE_CHUNK_COUNT + contentChunks),
        pacing,
        'cut',
      );
      return reply;
    });
  });
}

function completionId(random: RandomSource): string {
  const suffix = Array.from(
    { length: COMPLETION_ID_LENGTH },
    () => COMPLETION_ID_ALPHABET[Math.floor(random() * COMPLETION_ID_ALPHABET.length)],
  ).join('');
  return `${COMPLETION_ID_PREFIX}${suffix}`;
}
