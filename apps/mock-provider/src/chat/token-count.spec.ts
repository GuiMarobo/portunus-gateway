import { describe, expect, it } from 'vitest';
import { countPromptTokens } from './token-count';

describe('prompt token count', () => {
  it.each([
    ['12 characters', ['Hello there!'], 6],
    ['13 characters rounds the quarter up', ['Hello, there!'], 7],
    ['an empty message still costs its fixed overhead', [''], 3],
    ['each message is rounded on its own', ['a', 'b'], 8],
  ])('%s → %i tokens', (_case, contents, expected) => {
    const messages = contents.map((content) => ({ role: 'user', content }));

    expect(countPromptTokens(messages)).toBe(expected);
  });
});
