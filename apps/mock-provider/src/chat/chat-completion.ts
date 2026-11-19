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

export function createChatCompletion(
  request: ChatCompletionRequest,
  { id, createdAtSeconds, defaultCompletionTokens }: ChatCompletionContext,
) {
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
