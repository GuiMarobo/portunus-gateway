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
const NO_DELAY_MS = 0;
const DEFAULT_CUT_AFTER_CHUNKS = 0;
const IMMEDIATE_STREAM: StreamPlan = { ttfbMs: NO_DELAY_MS, chunkDelayMs: NO_DELAY_MS };

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
const streamingBodySchema = z.looseObject({ stream: z.literal(true) });

export type ScenarioPreHandler = (request: FastifyRequest, reply: FastifyReply) => Promise<void>;

export interface StreamPacing {
  readonly ttfbMs: number;
  readonly chunkDelayMs: number;
}

export interface StreamPlan extends StreamPacing {
  readonly cutAfterContentChunks?: number | undefined;
}

export interface ScenarioHandling {
  readonly apply: ScenarioPreHandler;
  streamPlanOf(request: FastifyRequest): StreamPlan;
}

export function scenarioHandling({
  maxDelayMs,
  defaultRetryAfterSeconds,
  defaultScenario,
  random,
}: ScenarioPreHandlerDependencies): ScenarioHandling {
  const streamPlanByRequest = new WeakMap<FastifyRequest, StreamPlan>();
  const apply: ScenarioPreHandler = async (request, reply) => {
    const resolved = resolveScenario(request, defaultScenario, maxDelayMs);
    if (!resolved.ok) {
      await sendInvalidScenario(reply, resolved.source, resolved.problems);
      return;
    }
    const { scenario } = resolved;
    if (scenario.failure?.kind === 'stream-cut' && !isStreamingRequest(request)) {
      await sendStreamCutWithoutStream(reply);
      return;
    }
    const draw = scenario.seed === undefined ? random : mulberry32(scenario.seed);
    if (scenario.latency !== undefined) {
      const waited = await waitUnlessClosed(reply.raw, pickDelayMs(scenario.latency, draw));
      if (!waited) {
        reply.hijack();
        return;
      }
    }
    const { failure } = scenario;
    const firedFailure = failure !== undefined && draw() < failure.rate ? failure : undefined;
    if (firedFailure?.kind === 'timeout') {
      await hangUntilCeiling(reply, maxDelayMs);
      return;
    }
    if (firedFailure !== undefined && firedFailure.kind !== 'stream-cut') {
      await sendSimulatedFailure(reply, firedFailure, defaultRetryAfterSeconds);
      return;
    }
    streamPlanByRequest.set(request, {
      ttfbMs: scenario.ttfb === undefined ? NO_DELAY_MS : pickDelayMs(scenario.ttfb, draw),
      chunkDelayMs: scenario.chunkDelayMs ?? NO_DELAY_MS,
      cutAfterContentChunks:
        firedFailure === undefined
          ? undefined
          : (firedFailure.cutAfterChunks ?? DEFAULT_CUT_AFTER_CHUNKS),
    });
  };
  return {
    apply,
    streamPlanOf: (request) => streamPlanByRequest.get(request) ?? IMMEDIATE_STREAM,
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

function isStreamingRequest(request: FastifyRequest): boolean {
  return streamingBodySchema.safeParse(request.body).success;
}

function sendStreamCutWithoutStream(reply: FastifyReply): FastifyReply {
  return sendOpenAiError(reply, BAD_REQUEST_STATUS, {
    message: 'error=stream-cut only applies to streaming requests (stream: true).',
    type: 'invalid_request_error',
    param: 'stream',
    code: null,
  });
}

async function hangUntilCeiling(reply: FastifyReply, maxDelayMs: number): Promise<void> {
  reply.hijack();
  if (await waitUnlessClosed(reply.raw, maxDelayMs)) {
    reply.raw.destroy();
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
