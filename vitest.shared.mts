import swc from 'unplugin-swc';
import { configDefaults, defineConfig } from 'vitest/config';

const WORKSPACE_SOURCE_CONDITION = '@portunus/source';
const VITE_DEFAULT_SERVER_CONDITIONS = ['module', 'node', 'development|production'];

export default defineConfig({
  plugins: [swc.vite()],
  ssr: {
    resolve: {
      conditions: [WORKSPACE_SOURCE_CONDITION, ...VITE_DEFAULT_SERVER_CONDITIONS],
    },
  },
  test: {
    include: ['src/**/*.spec.ts'],
    exclude: [...configDefaults.exclude, '**/*.int-spec.ts'],
    environment: 'node',
  },
});
