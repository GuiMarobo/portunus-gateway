import { requestFingerprint } from '../chat/request-fingerprint';
import { mulberry32 } from '../chat/seeded-random';

const SEED_BYTE_OFFSET = 0;
const COMPONENT_SCALE = 2;
const COMPONENT_SHIFT = 1;

export interface EmbeddingVectorRequest {
  readonly model: string;
  readonly text: string;
  readonly dimensions: number;
}

export function embeddingVector({ model, text, dimensions }: EmbeddingVectorRequest): Float32Array {
  const random = mulberry32(requestFingerprint({ model, text }).readUInt32LE(SEED_BYTE_OFFSET));
  const vector = new Float32Array(dimensions);
  let squaredNorm = 0;
  for (let index = 0; index < dimensions; index++) {
    const component = random() * COMPONENT_SCALE - COMPONENT_SHIFT;
    vector[index] = component;
    squaredNorm += component * component;
  }
  const norm = Math.sqrt(squaredNorm);
  for (const [index, component] of vector.entries()) {
    vector[index] = component / norm;
  }
  return vector;
}
