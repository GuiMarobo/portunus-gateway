import swc from 'unplugin-swc';
import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [swc.vite()],
  test: {
    include: ['src/**/*.spec.ts'],
    exclude: [...configDefaults.exclude, '**/*.int-spec.ts'],
    environment: 'node',
  },
});
