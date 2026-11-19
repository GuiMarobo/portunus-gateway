const CHARACTERS_PER_TOKEN = 4;
const TOKENS_PER_MESSAGE = 3;

export interface PromptMessage {
  readonly content: string;
}

export function countPromptTokens(messages: readonly PromptMessage[]): number {
  return messages.reduce((total, message) => total + countMessageTokens(message), 0);
}

function countMessageTokens({ content }: PromptMessage): number {
  return Math.ceil(content.length / CHARACTERS_PER_TOKEN) + TOKENS_PER_MESSAGE;
}
