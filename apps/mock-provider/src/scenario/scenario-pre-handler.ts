import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { mulberry32 } from '../chat/seeded-random';
import { sendOpenAiError } from '../errors/openai-error';
import type { RandomSource } from '../mock-app.factory';
import { type DelayRange, type Failure, parseScenario, type Scenario } from './scenario';
import { waitUnlessClosed } from './wait-unless-closed';

const SCENARIO_HEADER = 'x-mock-scenario';
export const SCENARIO_PATH_PARAM = 'scenario';
const SCENARIO_PATH_LABEL = `/scenarios/{${SCENARIO_PATH_PARAM}}`;
const INCLUSIVE_RANGE_OFFSET = 1;
const BAD_REQUEST_STATUS = 400;
const RATE_LIMIT_STATUS = 429;
const PROBLEM_SEPARATOR = '; ';
const INTERNAL_ERROR_STATUS = 500;
const SERVICE_UNAVAILABLE_STATUS = 503;
const RETRY_AFTER_HEADER = 'retry-after';

export interface ScenarioPreHandlerDependencies {
  readonly maxDelayMs: number;
  readonly defaultRetryAfterSeconds: number;
  readonly defaultScenario: Scenario;
  readonly random: RandomSource;
}

interface ScenarioSource {
  readonly raw: string;
  readonly param: string;
  readonly description: string;
}

const scenarioPathParamsSchema = z.object({ [SCENARIO_PATH_PARAM]: z.string() });

export type ScenarioPreHandler = (request: FastifyRequest, reply: FastifyReply) => Promise<void>;

export function scenarioPreHandler({
  maxDelayMs,
  defaultRetryAfterSeconds,
  defaultScenario,
  random,
}: ScenarioPreHandlerDependencies): ScenarioPreHandler {
  return async (request, reply) => {
    const resolved = resolveScenario(request, defaultScenario, maxDelayMs);
    if (!resolved.ok) {
      await sendInvalidScenario(reply, resolved.source, resolved.problems);
      return;
    }
    const { scenario } = resolved;
    const draw = scenario.seed === undefined ? random : mulberry32(scenario.seed);
    if (scenario.latency !== undefined) {
      const waited = await waitUnlessClosed(reply.raw, pickDelayMs(scenario.latency, draw));
      if (!waited) {
        reply.hijack();
        return;
      }
    }
    const { failure } = scenario;
    if (failure !== undefined && draw() < failure.rate) {
      await sendSimulatedFailure(reply, failure, defaultRetryAfterSeconds);
    }
  };
}

type ScenarioResolution =
  | { readonly ok: true; readonly scenario: Scenario }
  | {
      readonly ok: false;
      readonly source: ScenarioSource;
      readonly problems: readonly string[];
    };

function resolveScenario(
  request: FastifyRequest,
  defaultScenario: Scenario,
  maxDelayMs: number,
): ScenarioResolution {
  const source = scenarioSourceOf(request);
  if (source === undefined) {
    return { ok: true, scenario: defaultScenario };
  }
  const parsed = parseScenario(source.raw, { maxDelayMs });
  return parsed.ok ? parsed : { ok: false, source, problems: parsed.problems };
}

function scenarioSourceOf(request: FastifyRequest): ScenarioSource | undefined {
  const header = request.headers[SCENARIO_HEADER];
  if (typeof header === 'string') {
    return { raw: header, param: SCENARIO_HEADER, description: `${SCENARIO_HEADER} header` };
  }
  const pathParams = scenarioPathParamsSchema.safeParse(request.params);
  if (pathParams.success) {
    return {
      raw: pathParams.data[SCENARIO_PATH_PARAM],
      param: SCENARIO_PATH_LABEL,
      description: `scenario in the ${SCENARIO_PATH_LABEL} path`,
    };
  }
  return undefined;
}

function sendInvalidScenario(
  reply: FastifyReply,
  source: ScenarioSource,
  problems: readonly string[],
): FastifyReply {
  return sendOpenAiError(reply, BAD_REQUEST_STATUS, {
    message: `Invalid ${source.description}: ${problems.join(PROBLEM_SEPARATOR)}.`,
    type: 'invalid_request_error',
    param: source.param,
    code: null,
  });
}

async function sendSimulatedFailure(
  reply: FastifyReply,
  failure: Failure,
  defaultRetryAfterSeconds: number,
): Promise<void> {
  switch (failure.kind) {
    case '429':
      await sendRateLimitError(reply, failure.retryAfterSeconds ?? defaultRetryAfterSeconds);
      return;
    case '500':
      await sendOpenAiError(reply, INTERNAL_ERROR_STATUS, {
        message:
          'The server had an error while processing your request (simulated by the mock scenario).',
        type: 'server_error',
        param: null,
        code: null,
      });
      return;
    case '503':
      await sendOpenAiError(reply, SERVICE_UNAVAILABLE_STATUS, {
        message:
          'The engine is currently overloaded, please try again later (simulated by the mock scenario).',
        type: 'server_error',
        param: null,
        code: null,
      });
      return;
    default:
      return;
  }
}

function sendRateLimitError(reply: FastifyReply, retryAfterSeconds: number): FastifyReply {
  return sendOpenAiError(
    reply.header(RETRY_AFTER_HEADER, String(retryAfterSeconds)),
    RATE_LIMIT_STATUS,
    {
      message: `Rate limit reached for requests (simulated by the mock scenario). Please try again in ${String(retryAfterSeconds)}s.`,
      type: 'requests',
      param: null,
      code: 'rate_limit_exceeded',
    },
  );
}

function pickDelayMs({ min, max }: DelayRange, draw: RandomSource): number {
  if (min === max) {
    return min;
  }
  return min + Math.floor(draw() * (max - min + INCLUSIVE_RANGE_OFFSET));
}
