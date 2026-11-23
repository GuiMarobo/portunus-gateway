import { describe, expect, it } from 'vitest';
import { float32LittleEndianBase64 } from './embedding-encoding';

describe('base64 embedding encoding', () => {
  it('writes each component as a little-endian Float32, in order', () => {
    expect(float32LittleEndianBase64(Float32Array.of(1, -2))).toBe('AACAPwAAAMA=');
  });
});
