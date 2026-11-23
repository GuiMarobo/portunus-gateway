import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { sendInvalidParameter } from '../errors/openai-error';
import { MAX_EMBEDDING_INPUTS } from '../mock-limits';
import { SCENARIO_PATH_PARAM, type ScenarioHandling } from '../scenario/scenario-pre-handler';
import { createEmbeddingList } from './embedding-list';

const EMBEDDINGS_PATH = '/v1/embeddings';
const EMBEDDINGS_PATHS = [EMBEDDINGS_PATH, `/scenarios/:${SCENARIO_PATH_PARAM}${EMBEDDINGS_PATH}`];
const DEFAULT_ENCODING_FORMAT = 'float';
const embeddingInputText = z.string().min(1);
const embeddingInputList = z
  .array(z.string())
  .min(1)
  .max(MAX_EMBEDDING_INPUTS)
  .refine((texts) => texts.every((text) => embeddingInputText.safeParse(text).success));

function embeddingsBodySchema(maxDimensions: number) {
  return z.looseObject({
    model: z.string().min(1),
    input: z.union([embeddingInputText, embeddingInputList]),
    dimensions: z.int().positive().max(maxDimensions).nullish(),
    encoding_format: z.enum(['float', 'base64']).nullish(),
  });
}

export interface EmbeddingsRouteDependencies {
  readonly defaultDimensions: number;
  readonly maxDimensions: number;
  readonly scenario: ScenarioHandling;
}

export function registerEmbeddingsRoute(
  server: FastifyInstance,
  { defaultDimensions, maxDimensions, scenario }: EmbeddingsRouteDependencies,
): void {
  const bodySchema = embeddingsBodySchema(maxDimensions);
  EMBEDDINGS_PATHS.forEach((path) => {
    server.post(path, { preHandler: scenario.preHandler('never') }, (request, reply) => {
      const body = bodySchema.safeParse(request.body);
      if (!body.success) {
        return sendInvalidParameter(reply, body.error);
      }
      const { model, input, dimensions, encoding_format } = body.data;
      return createEmbeddingList({
        model,
        inputs: typeof input === 'string' ? [input] : input,
        dimensions: dimensions ?? defaultDimensions,
        encodingFormat: encoding_format ?? DEFAULT_ENCODING_FORMAT,
      });
    });
  });
}
