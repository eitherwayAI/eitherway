import blitzPlugin from '@blitz/eslint-plugin';
import { jsFileExtensions } from '@blitz/eslint-plugin/dist/configs/javascript.js';
import { getNamingConventionRule, tsFileExtensions } from '@blitz/eslint-plugin/dist/configs/typescript.js';

export default [
  {
    ignores: ['**/dist', '**/node_modules', '**/eitherway/build'],
  },
  ...blitzPlugin.configs.recommended(),
  {
    rules: {
      '@blitz/catch-error-name': 'off',
      '@typescript-eslint/no-this-alias': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      'prettier/prettier': 'off',
      'eol-last': 'off',
      'no-trailing-spaces': 'off',
      indent: 'off',
      '@typescript-eslint/indent': 'off',
      'linebreak-style': 'off',
      'max-len': 'off',
      'no-multiple-empty-lines': 'off',
      'space-before-function-paren': 'off',
      'comma-dangle': 'off',
      semi: 'off',
      quotes: 'off',
      'object-curly-spacing': 'off',
      'array-bracket-spacing': 'off',
      'space-in-parens': 'off',
      'key-spacing': 'off',
      'keyword-spacing': 'off',
      'space-before-blocks': 'off',
      'space-infix-ops': 'off',
      'no-multi-spaces': 'off',
      'jsdoc/check-alignment': 'off',
      'jsdoc/check-indentation': 'off',
      'jsdoc/newline-after-description': 'off',
      'jsdoc/require-jsdoc': 'off',
      'jsdoc/valid-types': 'off',
      'valid-jsdoc': 'off',
      'require-jsdoc': 'off',
      'spaced-comment': 'off',
      'multiline-comment-style': 'off',
    },
  },
  {
    files: ['**/*.tsx'],
    rules: {
      ...getNamingConventionRule({}, true),
    },
  },
  {
    files: ['**/*.d.ts'],
    rules: {
      '@typescript-eslint/no-empty-object-type': 'off',
    },
  },
  {
    files: [...tsFileExtensions, ...jsFileExtensions, '**/*.tsx'],
    ignores: ['functions/*'],
    rules: {
      'no-restricted-imports': 'off',
    },
  },
];
