import type { ChatCompletion } from './chat-completion';

const CHUNK_OBJECT = 'chat.completion.chunk';
const ASSISTANT_ROLE = 'assistant';
const WORD_SEPARATOR = ' ';
const CHOICE_INDEX = 0;

export interface ChunkOptions {
  readonly includeUsage: boolean;
}

export function chatCompletionChunks(
  completion: ChatCompletion,
  { includeUsage }: ChunkOptions,
): object[] {
  const [choice] = completion.choices;
  const envelope = {
    id: completion.id,
    object: CHUNK_OBJECT,
    created: completion.created,
    model: completion.model,
    ...(includeUsage ? { usage: null } : {}),
  };
  const withDelta = (delta: object, finishReason: string | null) => ({
    ...envelope,
    choices: [{ index: CHOICE_INDEX, delta, finish_reason: finishReason }],
  });
  const words = choice.message.content.split(WORD_SEPARATOR);
  return [
    withDelta({ role: ASSISTANT_ROLE, content: '' }, null),
    ...words.map((word, position) =>
      withDelta({ content: position === 0 ? word : `${WORD_SEPARATOR}${word}` }, null),
    ),
    withDelta({}, choice.finish_reason),
    ...(includeUsage ? [{ ...envelope, choices: [], usage: completion.usage }] : []),
  ];
}
