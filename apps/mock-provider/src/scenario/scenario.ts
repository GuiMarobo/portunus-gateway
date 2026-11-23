import { z } from 'zod';
import { MAX_COMPLETION_TOKENS, MAX_RETRY_AFTER_SECONDS } from '../mock-limits';

const ENTRY_SEPARATOR = ';';
const KEY_VALUE_SEPARATOR = '=';
const NOT_FOUND = -1;
const FIRST_ENTRY_NUMBER = 1;
const DEFAULT_ERROR_RATE = 1;
const MIN_ERROR_RATE = 0;
const MAX_ERROR_RATE = 1;
const MIN_TOKENS = 1;
const MIN_CHUNKS = 0;
const MIN_RETRY_AFTER_SECONDS = 0;
const MIN_SEED = 0;
const MAX_SEED = 2 ** 32 - 1;
const DELAY_PATTERN = /^(?<min>\d+)(?:-(?<max>\d+))?$/;
const DECIMAL_INTEGER = /^\d+$/;
const DECIMAL_NUMBER = /^\d+(?:\.\d+)?$/;
const FAILURE_KINDS = ['429', '500', '503', 'timeout', 'stream-cut'] as const;
const SCENARIO_KEYS = [
  'latency',
  'ttfb',
  'chunk-delay',
  'tokens',
  'error',
  'error-rate',
  'retry-after',
  'cut-after',
  'seed',
] as const;
const UNKNOWN_KEY_PROBLEM = `unknown key; allowed keys are ${SCENARIO_KEYS.join(', ')}`;
const DELAY_FORMAT_MESSAGE = 'must be N or MIN-MAX milliseconds';
const INVERTED_RANGE_MESSAGE = 'range is inverted (MIN above MAX)';

export type FailureKind = (typeof FAILURE_KINDS)[number];

export interface DelayRange {
  readonly min: number;
  readonly max: number;
}

export type Failure =
  | { readonly kind: '429'; readonly rate: number; readonly retryAfterSeconds?: number | undefined }
  | {
      readonly kind: 'stream-cut';
      readonly rate: number;
      readonly cutAfterChunks?: number | undefined;
    }
  | { readonly kind: '500' | '503' | 'timeout'; readonly rate: number };

export interface Scenario {
  readonly latency?: DelayRange | undefined;
  readonly ttfb?: DelayRange | undefined;
  readonly chunkDelayMs?: number | undefined;
  readonly tokens?: number | undefined;
  readonly failure?: Failure | undefined;
  readonly seed?: number | undefined;
}

export interface ScenarioLimits {
  readonly maxDelayMs: number;
}

export type ScenarioParseResult =
  | { readonly ok: true; readonly scenario: Scenario }
  | { readonly ok: false; readonly problems: readonly string[] };

interface SplitEntries {
  readonly fields: Record<string, string>;
  readonly problems: readonly string[];
}

export function parseScenario(raw: string, limits: ScenarioLimits): ScenarioParseResult {
  const { fields, problems } = splitEntries(raw);
  const result = scenarioInputSchema(limits).safeParse(fields);
  const allProblems = [
    ...new Set([...problems, ...(result.success ? [] : describeIssues(result.error))]),
  ];
  if (!result.success || allProblems.length > 0) {
    return { ok: false, problems: allProblems };
  }
  return { ok: true, scenario: toScenario(result.data) };
}

function splitEntries(raw: string): SplitEntries {
  const fields = new Map<string, string>();
  const problems: string[] = [];
  raw
    .split(ENTRY_SEPARATOR)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .forEach((entry, index) => {
      const separatorIndex = entry.indexOf(KEY_VALUE_SEPARATOR);
      if (separatorIndex === NOT_FOUND) {
        problems.push(`entry ${String(index + FIRST_ENTRY_NUMBER)} is not in key=value form`);
        return;
      }
      const key = entry.slice(0, separatorIndex).trim();
      if (fields.has(key)) {
        problems.push(isScenarioKey(key) ? `${key}: appears more than once` : UNKNOWN_KEY_PROBLEM);
        return;
      }
      fields.set(key, entry.slice(separatorIndex + 1).trim());
    });
  return { fields: Object.fromEntries(fields), problems };
}

function isScenarioKey(key: string): key is (typeof SCENARIO_KEYS)[number] {
  return (SCENARIO_KEYS as readonly string[]).includes(key);
}

function describeIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) =>
    issue.code === 'unrecognized_keys'
      ? UNKNOWN_KEY_PROBLEM
      : `${String(issue.path[0])}: ${issue.message}`,
  );
}

function boundedInteger(min: number, max: number) {
  const message = `must be an integer from ${String(min)} to ${String(max)}`;
  return z
    .string()
    .regex(DECIMAL_INTEGER, message)
    .transform(Number)
    .pipe(z.number().min(min, message).max(max, message));
}

function ceilingMessage(maxDelayMs: number): string {
  return `above the ${String(maxDelayMs)} ms ceiling (MOCK_MAX_DELAY_MS)`;
}

function delayMilliseconds(maxDelayMs: number) {
  return z
    .string()
    .regex(DECIMAL_INTEGER, 'must be N milliseconds')
    .transform(Number)
    .pipe(z.number().max(maxDelayMs, ceilingMessage(maxDelayMs)));
}

function delayRange(maxDelayMs: number) {
  return z
    .string()
    .transform((text, context): DelayRange => {
      const bounds = DELAY_PATTERN.exec(text)?.groups;
      if (bounds?.min === undefined) {
        context.addIssue({ code: 'custom', message: DELAY_FORMAT_MESSAGE });
        return z.NEVER;
      }
      const min = Number(bounds.min);
      return { min, max: bounds.max === undefined ? min : Number(bounds.max) };
    })
    .refine((range) => range.min <= range.max, INVERTED_RANGE_MESSAGE)
    .refine((range) => range.max <= maxDelayMs, ceilingMessage(maxDelayMs));
}

function scenarioInputSchema({ maxDelayMs }: ScenarioLimits) {
  return z
    .strictObject({
      latency: delayRange(maxDelayMs).optional(),
      ttfb: delayRange(maxDelayMs).optional(),
      'chunk-delay': delayMilliseconds(maxDelayMs).optional(),
      tokens: boundedInteger(MIN_TOKENS, MAX_COMPLETION_TOKENS).optional(),
      error: z
        .enum(FAILURE_KINDS, { error: `must be one of ${FAILURE_KINDS.join(', ')}` })
        .optional(),
      'error-rate': z
        .string()
        .regex(DECIMAL_NUMBER, errorRateMessage())
        .transform(Number)
        .pipe(z.number().min(MIN_ERROR_RATE).max(MAX_ERROR_RATE, errorRateMessage()))
        .optional(),
      'retry-after': boundedInteger(MIN_RETRY_AFTER_SECONDS, MAX_RETRY_AFTER_SECONDS).optional(),
      'cut-after': boundedInteger(MIN_CHUNKS, MAX_COMPLETION_TOKENS).optional(),
      seed: boundedInteger(MIN_SEED, MAX_SEED).optional(),
    })
    .superRefine((input, context) => {
      const requirements = [
        {
          key: 'error-rate',
          present: input['error-rate'] !== undefined,
          met: input.error !== undefined,
          needs: 'error',
        },
        {
          key: 'retry-after',
          present: input['retry-after'] !== undefined,
          met: input.error === '429',
          needs: 'error=429',
        },
        {
          key: 'cut-after',
          present: input['cut-after'] !== undefined,
          met: input.error === 'stream-cut',
          needs: 'error=stream-cut',
        },
      ];
      requirements
        .filter(({ present, met }) => present && !met)
        .forEach(({ key, needs }) => {
          context.addIssue({ code: 'custom', path: [key], message: `requires ${needs}` });
        });
    });
}

function errorRateMessage(): string {
  return `must be a number from ${String(MIN_ERROR_RATE)} to ${String(MAX_ERROR_RATE)}`;
}

type ScenarioInput = z.output<ReturnType<typeof scenarioInputSchema>>;

function toScenario(input: ScenarioInput): Scenario {
  return {
    latency: input.latency,
    ttfb: input.ttfb,
    chunkDelayMs: input['chunk-delay'],
    tokens: input.tokens,
    failure: toFailure(input),
    seed: input.seed,
  };
}

function toFailure(input: ScenarioInput): Failure | undefined {
  if (input.error === undefined) {
    return undefined;
  }
  const rate = input['error-rate'] ?? DEFAULT_ERROR_RATE;
  switch (input.error) {
    case '429':
      return { kind: input.error, rate, retryAfterSeconds: input['retry-after'] };
    case 'stream-cut':
      return { kind: input.error, rate, cutAfterChunks: input['cut-after'] };
    default:
      return { kind: input.error, rate };
  }
}
