import { defineConfig } from 'vitest/config';
import shared from './vitest.shared.mts';

const INTEGRATION_TIMEOUT_MS = 120_000;

export default defineConfig({
  plugins: shared.plugins,
  ssr: shared.ssr,
  test: {
    include: ['{apps,libs}/*/src/**/*.int-spec.ts'],
    environment: 'node',
    testTimeout: INTEGRATION_TIMEOUT_MS,
    hookTimeout: INTEGRATION_TIMEOUT_MS,
  },
});
