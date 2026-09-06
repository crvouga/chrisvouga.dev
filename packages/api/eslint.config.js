const {
  createSharedBlocks,
} = require('../../pkgs/eslint-rules/base-config.cjs');

module.exports = [
  ...createSharedBlocks(__dirname, {
    filesGlob: '{src,scripts}/**/*.{ts,tsx}',
  }),
];
