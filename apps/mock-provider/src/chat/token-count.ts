const CHARACTERS_PER_TOKEN = 4;
const TOKENS_PER_MESSAGE = 3;

export interface PromptMessage {
  readonly content: string;
}

export function countPromptTokens(messages: readonly PromptMessage[]): number {
  return messages.reduce(
    (total, { content }) => total + countTextTokens(content) + TOKENS_PER_MESSAGE,
    0,
  );
}

export function countEmbeddingInputTokens(inputs: readonly string[]): number {
  return inputs.reduce((total, input) => total + countTextTokens(input), 0);
}

function countTextTokens(text: string): number {
  return Math.ceil(text.length / CHARACTERS_PER_TOKEN);
}
