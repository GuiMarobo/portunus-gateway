import eslint from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import prettier from 'eslint-config-prettier/flat';
import tseslint from 'typescript-eslint';

const FRAMEWORK_AND_DRIVER_PACKAGES = [
  '@nestjs/*',
  'fastify',
  'drizzle-orm',
  'ioredis',
  'amqplib',
  'bullmq',
];

const CONFIGURATION_ENTRY_POINTS = 'apps/*/src/main.ts';

const OUTER_LAYERS_OF_DOMAIN = '(^|/)(application|infrastructure|presentation)(/|$)';
const OUTER_LAYERS_OF_APPLICATION = '(^|/)(infrastructure|presentation)(/|$)';

export default defineConfig(
  globalIgnores(['**/dist/', '**/coverage/']),
  eslint.configs.recommended,
  tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: [
            '*.mjs',
            '*.mts',
            'apps/*/vitest.config.mts',
            'libs/*/vitest.config.mts',
          ],
          defaultProject: 'tsconfig.base.json',
        },
      },
    },
    rules: {
      'no-console': 'error',
      'no-restricted-properties': [
        'error',
        {
          object: 'process',
          property: 'env',
          message:
            'Only the entry point reads process.env; inject the validated config class instead.',
        },
      ],
      '@typescript-eslint/no-extraneous-class': [
        'error',
        { allowWithDecorator: true, allowConstructorOnly: true },
      ],
    },
  },
  {
    files: [CONFIGURATION_ENTRY_POINTS],
    rules: {
      'no-restricted-properties': 'off',
    },
  },
  {
    files: ['**/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: FRAMEWORK_AND_DRIVER_PACKAGES,
              message: 'domain/ is pure TypeScript: no framework or driver imports.',
            },
            {
              regex: OUTER_LAYERS_OF_DOMAIN,
              message: 'domain/ must not depend on outer layers.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['**/application/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: OUTER_LAYERS_OF_APPLICATION,
              message: 'application/ depends only on domain/ ports, never on adapters.',
            },
          ],
        },
      ],
    },
  },
  prettier,
);
