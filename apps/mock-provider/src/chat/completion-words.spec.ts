import { describe, expect, it } from 'vitest';
import { COMPLETION_VOCABULARY, generateCompletionWords } from './completion-words';

const SEED = Buffer.from('a fixed seed for the generator');
const OTHER_SEED = Buffer.from('another seed for the generator');
const WORD_COUNT = 16;

describe('completion words', () => {
  it('draws exactly the requested number of words, all from the fixed vocabulary', () => {
    const words = generateCompletionWords(SEED, 7);

    expect(words).toHaveLength(7);
    for (const word of words) {
      expect(COMPLETION_VOCABULARY).toContain(word);
    }
  });

  it('draws the same words for the same seed and other words for another seed', () => {
    const words = generateCompletionWords(SEED, WORD_COUNT);

    expect(generateCompletionWords(Buffer.from(SEED), WORD_COUNT)).toEqual(words);
    expect(generateCompletionWords(OTHER_SEED, WORD_COUNT)).not.toEqual(words);
  });
});
