import { describe, expect, it } from 'vitest';
import { embeddingVector } from './embedding-vector';

const DIMENSIONS = 8;
const UNIT_NORM_DECIMALS = 6;
const BASE = { model: 'text-embedding-3-small', text: 'Hello there!', dimensions: DIMENSIONS };

describe('embedding vector', () => {
  it('is the same vector every time for the same model and text', () => {
    expect(embeddingVector(BASE)).toEqual(embeddingVector({ ...BASE }));
  });

  it.each([
    ['another text', { ...BASE, text: 'Hello there?' }],
    ['another model', { ...BASE, model: 'text-embedding-3-large' }],
  ])('changes with %s', (_case, changed) => {
    expect(embeddingVector(changed)).not.toEqual(embeddingVector(BASE));
  });

  it.each([[1], [3], [1536]])('has %i dimensions and unit norm', (dimensions) => {
    const vector = embeddingVector({ ...BASE, dimensions });

    const norm = Math.hypot(...vector);
    expect(vector).toHaveLength(dimensions);
    expect(norm).toBeCloseTo(1, UNIT_NORM_DECIMALS);
  });
});
