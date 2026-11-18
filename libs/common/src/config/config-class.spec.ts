import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { configClass } from './config-class';

class PortConfig extends configClass(z.object({ PORT: z.string() })) {}

describe('configClass', () => {
  it('rejects changes to a loaded configuration at runtime', () => {
    const config = new PortConfig({ PORT: '8080' });

    expect(() => {
      Object.assign(config, { PORT: '9090' });
    }).toThrow(TypeError);
    expect(config.PORT).toBe('8080');
  });
});
