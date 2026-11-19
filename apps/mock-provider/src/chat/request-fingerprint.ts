import { createHash } from 'node:crypto';

const FINGERPRINT_ALGORITHM = 'sha256';

export function canonicalJson(value: unknown): string {
  return JSON.stringify(withSortedKeys(value));
}

export function requestFingerprint(value: unknown): Buffer {
  return createHash(FINGERPRINT_ALGORITHM).update(canonicalJson(value)).digest();
}

function withSortedKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(withSortedKeys);
  }
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, withSortedKeys(value[key])]),
    );
  }
  return value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
