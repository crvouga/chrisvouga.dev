const { createSharedBlocks } = require('../eslint-rules/base-config.cjs');

module.exports = [
  ...createSharedBlocks(__dirname),
  {
    files: ['**/*.test.{ts,tsx}'],
    rules: {
      'lingui/no-unlocalized-strings': 'off',
      'lingui/t-call-in-function': 'off',
      'lingui/no-trans-inside-trans': 'off',
      'lingui/no-expression-in-message': 'off',
      'lingui/no-single-tag-to-translate': 'off',
      'lingui/no-single-variables-to-translate': 'off',
      'workspaceI18n/text-must-be-trans': 'off',
    },
  },
];
