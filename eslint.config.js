import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';
import vue from 'eslint-plugin-vue';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

const noSql = {
  selector:
    "CallExpression[callee.type='MemberExpression'][callee.property.name=/^(prepare|batch|exec)$/]",
  message: 'El acceso a D1 pertenece a infrastructure/repositories; usa un puerto del repositorio.',
};

export default defineConfig(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.wrangler/**',
      '.credentials/**',
      'artifacts/**',
      'coverage/**',
    ],
  },
  { files: ['**/*.{js,mjs,ts,vue}'], extends: [js.configs.recommended] },
  { files: ['**/*.{ts,vue}'], extends: [tseslint.configs.recommended] },
  vue.configs['flat/recommended'],
  { files: ['**/*.{js,mjs}'], languageOptions: { globals: globals.node } },
  { files: ['apps/web/src/**/*.{ts,vue}'], languageOptions: { globals: globals.browser } },
  { files: ['**/*.vue'], languageOptions: { parserOptions: { parser: tseslint.parser } } },
  {
    files: ['**/*.{ts,vue}'],
    rules: {
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['apps/api/src/{domain,application}/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                'hono',
                'hono/*',
                'better-auth',
                'better-auth/*',
                '**/infrastructure/**',
                '**/presentation/**',
                '**/config/**',
                '**/composition',
              ],
              message:
                'Dominio y aplicación dependen de contratos y puertos, no de HTTP ni de adaptadores.',
            },
          ],
        },
      ],
      'no-restricted-syntax': ['error', noSql],
    },
  },
  {
    files: ['apps/api/src/presentation/**/*.ts'],
    rules: { 'no-restricted-syntax': ['error', noSql] },
  },
  {
    files: ['apps/api/src/presentation/http/controllers/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/infrastructure/**', '**/config/**'],
              message: 'Los controladores invocan servicios de aplicación.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['apps/api/src/infrastructure/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/presentation/**', '**/application/services/**'],
              message:
                'Los adaptadores implementan puertos; no llaman a controladores ni servicios.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['apps/web/src/presentation/**/*.{ts,vue}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/infrastructure/**'],
              message: 'La presentación utiliza composables y stores de aplicación.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['apps/web/src/application/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/presentation/**'],
              message: 'La aplicación no depende de vistas ni componentes.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['apps/web/src/infrastructure/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/presentation/**', '**/application/**'],
              message: 'Los adaptadores no dependen de la presentación ni de los casos de uso.',
            },
          ],
        },
      ],
    },
  },
  // Las respuestas heterogéneas del cliente de pruebas son intencionalmente dinámicas.
  { files: ['tests/api.test.ts'], rules: { '@typescript-eslint/no-explicit-any': 'off' } },
  prettier,
);
