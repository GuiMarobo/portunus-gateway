import { generateCompletionWords } from './completion-words';
import { requestFingerprint } from './request-fingerprint';
import { countPromptTokens, type PromptMessage } from './token-count';

const COMPLETION_OBJECT = 'chat.completion';
const ASSISTANT_ROLE = 'assistant';
const WORD_SEPARATOR = ' ';
const NATURAL_FINISH_REASON = 'stop';
const LIMIT_FINISH_REASON = 'length';

export interface ChatCompletionRequest {
  readonly model: string;
  readonly messages: readonly PromptMessage[];
  readonly max_tokens?: number | null | undefined;
  readonly max_completion_tokens?: number | null | undefined;
}

export interface ChatCompletionContext {
  readonly id: string;
  readonly createdAtSeconds: number;
  readonly defaultCompletionTokens: number;
}

export interface ChatCompletionUsage {
  readonly prompt_tokens: number;
  readonly completion_tokens: number;
  readonly total_tokens: number;
}

export interface ChatCompletionChoice {
  readonly index: number;
  readonly message: { readonly role: string; readonly content: string };
  readonly finish_reason: string;
}

export interface ChatCompletion {
  readonly id: string;
  readonly object: string;
  readonly created: number;
  readonly model: string;
  readonly choices: readonly [ChatCompletionChoice];
  readonly usage: ChatCompletionUsage;
}

export function createChatCompletion(
  request: ChatCompletionRequest,
  { id, createdAtSeconds, defaultCompletionTokens }: ChatCompletionContext,
): ChatCompletion {
  const limit = requestedTokenLimit(request);
  const isCutByLimit = limit !== null && limit < defaultCompletionTokens;
  const words = generateCompletionWords(
    requestFingerprint({ model: request.model, messages: request.messages, limit }),
    isCutByLimit ? limit : defaultCompletionTokens,
  );
  const promptTokens = countPromptTokens(request.messages);
  return {
    id,
    object: COMPLETION_OBJECT,
    created: createdAtSeconds,
    model: request.model,
    choices: [
      {
        index: 0,
        message: { role: ASSISTANT_ROLE, content: words.join(WORD_SEPARATOR) },
        finish_reason: isCutByLimit ? LIMIT_FINISH_REASON : NATURAL_FINISH_REASON,
      },
    ],
    usage: {
      prompt_tokens: promptTokens,
      completion_tokens: words.length,
      total_tokens: promptTokens + words.length,
    },
  };
}

function requestedTokenLimit(request: ChatCompletionRequest): number | null {
  return request.max_completion_tokens ?? request.max_tokens ?? null;
}
