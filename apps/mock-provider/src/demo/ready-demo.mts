import OpenAI, { APIConnectionTimeoutError, APIError } from 'openai';

const DEFAULT_BASE_URL = 'http://localhost:3001/v1';
const DEMO_API_KEY = 'demo-key-not-a-real-provider-key';
const DEMO_MODEL = 'gpt-4o-mini';
const EMBEDDING_MODEL = 'text-embedding-3-small';
const SCENARIO_HEADER = 'x-mock-scenario';
const CLIENT_TIMEOUT_MS = 1_000;
const RETRY_AFTER_SECONDS = '4';
const CUT_AFTER_CHUNKS = 3;
const ROLE_CHUNK_COUNT = 1;
const NORM_DECIMALS = 6;
const EXIT_FAILURE = 1;

interface DemoResult {
  readonly name: string;
  readonly ok: boolean;
  readonly detail: string;
}

type DemoCase = (client: OpenAI) => Promise<DemoResult>;

const messages = [{ role: 'user' as const, content: 'Hello, mock provider!' }];

function withScenario(scenario: string): { headers: Record<string, string> } {
  return { headers: { [SCENARIO_HEADER]: scenario } };
}

async function normalCompletion(client: OpenAI): Promise<DemoResult> {
  const completion = await client.chat.completions.create({ model: DEMO_MODEL, messages });
  const choice = completion.choices[0];
  return {
    name: 'chat completion',
    ok: choice?.finish_reason === 'stop' && completion.usage !== undefined,
    detail: `finish_reason=${String(choice?.finish_reason)} usage=${JSON.stringify(completion.usage)} content="${choice?.message.content ?? ''}"`,
  };
}

async function streamWithUsage(client: OpenAI): Promise<DemoResult> {
  const stream = await client.chat.completions.create({
    model: DEMO_MODEL,
    messages,
    stream: true,
    stream_options: { include_usage: true },
  });
  let chunks = 0;
  let content = '';
  let finishReason: string | null = null;
  let usage: OpenAI.CompletionUsage | null | undefined;
  for await (const chunk of stream) {
    chunks += 1;
    content += chunk.choices[0]?.delta.content ?? '';
    finishReason = chunk.choices[0]?.finish_reason ?? finishReason;
    usage = chunk.usage ?? usage;
  }
  return {
    name: 'stream with usage chunk',
    ok: finishReason === 'stop' && usage !== null && usage !== undefined,
    detail: `chunks=${String(chunks)} finish_reason=${String(finishReason)} final usage=${JSON.stringify(usage)} content="${content}"`,
  };
}

async function embedding(client: OpenAI): Promise<DemoResult> {
  const response = await client.embeddings.create({ model: EMBEDDING_MODEL, input: 'Hello!' });
  const vector = response.data[0]?.embedding ?? [];
  const norm = Math.sqrt(vector.reduce((sum, component) => sum + component * component, 0));
  return {
    name: 'embedding',
    ok: vector.length > 0,
    detail: `dimensions=${String(vector.length)} norm=${norm.toFixed(NORM_DECIMALS)} usage=${JSON.stringify(response.usage)}`,
  };
}

function httpError(name: string, scenario: string, expectedStatus: number): DemoCase {
  return async (client) => {
    try {
      await client.chat.completions.create({ model: DEMO_MODEL, messages }, withScenario(scenario));
      return { name, ok: false, detail: 'expected an error, got a completion' };
    } catch (error) {
      if (!isApiError(error)) {
        throw error;
      }
      const retryAfter = error.headers?.get('retry-after');
      const retryAfterDetail =
        retryAfter === null || retryAfter === undefined ? '' : ` retry-after=${retryAfter}`;
      return {
        name,
        ok: error.status === expectedStatus,
        detail: `${error.constructor.name} status=${String(error.status)}${retryAfterDetail} code=${String(error.code)} type=${String(error.type)}`,
      };
    }
  };
}

async function timeout(client: OpenAI): Promise<DemoResult> {
  const startedAt = performance.now();
  try {
    await client.chat.completions.create(
      { model: DEMO_MODEL, messages },
      { ...withScenario('error=timeout'), timeout: CLIENT_TIMEOUT_MS },
    );
    return { name: 'timeout', ok: false, detail: 'expected a timeout, got a completion' };
  } catch (error) {
    const elapsedMs = Math.round(performance.now() - startedAt);
    return {
      name: 'timeout',
      ok: error instanceof APIConnectionTimeoutError,
      detail: `${errorName(error)} after ${String(elapsedMs)} ms (client timeout ${String(CLIENT_TIMEOUT_MS)} ms)`,
    };
  }
}

async function streamCut(client: OpenAI): Promise<DemoResult> {
  const stream = await client.chat.completions.create(
    { model: DEMO_MODEL, messages, stream: true },
    withScenario(`error=stream-cut;cut-after=${String(CUT_AFTER_CHUNKS)}`),
  );
  let chunks = 0;
  try {
    for await (const chunk of stream) {
      chunks += chunk.choices.length;
    }
    return {
      name: 'stream cut',
      ok: false,
      detail: `stream ended cleanly after ${String(chunks)} chunks`,
    };
  } catch (error) {
    return {
      name: 'stream cut',
      ok: chunks === ROLE_CHUNK_COUNT + CUT_AFTER_CHUNKS,
      detail: `${errorName(error)} after ${String(chunks)} chunks (role + ${String(CUT_AFTER_CHUNKS)} content), no finish_reason nor [DONE]`,
    };
  }
}

function isApiError(error: unknown): error is APIError {
  return error instanceof APIError;
}

function errorName(error: unknown): string {
  return error instanceof Error ? `${error.constructor.name}: ${error.message}` : String(error);
}

const DEMO_CASES: readonly DemoCase[] = [
  normalCompletion,
  streamWithUsage,
  embedding,
  httpError('429 with Retry-After', `error=429;retry-after=${RETRY_AFTER_SECONDS}`, 429),
  httpError('500', 'error=500', 500),
  httpError('503', 'error=503', 503),
  timeout,
  streamCut,
];

async function runDemo(baseURL: string): Promise<void> {
  const client = new OpenAI({ baseURL, apiKey: DEMO_API_KEY, maxRetries: 0 });
  process.stdout.write(`OpenAI SDK -> ${baseURL}\n`);
  let failures = 0;
  for (const demoCase of DEMO_CASES) {
    const result = await demoCase(client);
    failures += result.ok ? 0 : 1;
    process.stdout.write(`${result.ok ? 'PASS' : 'FAIL'}  ${result.name}: ${result.detail}\n`);
  }
  process.stdout.write(
    `${String(DEMO_CASES.length - failures)}/${String(DEMO_CASES.length)} cases as expected\n`,
  );
  if (failures > 0) {
    process.exitCode = EXIT_FAILURE;
  }
}

runDemo(process.argv[2] ?? DEFAULT_BASE_URL).catch((error: unknown) => {
  process.stderr.write(`demo aborted: ${errorName(error)}\n`);
  process.exitCode = EXIT_FAILURE;
});
