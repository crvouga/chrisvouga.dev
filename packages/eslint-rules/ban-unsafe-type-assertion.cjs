/**
 * Type-aware ESLint fragments for `@typescript-eslint/no-unsafe-type-assertion`.
 * Merge into your package's existing TypeScript file block so parserOptions stay intact.
 *
 * @param {string} tsconfigRootDir - `__dirname` of the package eslint.config.js
 */
const tsPlugin = require('@typescript-eslint/eslint-plugin');

function parserOptions(tsconfigRootDir) {
  return {
    projectService: true,
    tsconfigRootDir,
  };
}

function plugins() {
  return {
    '@typescript-eslint': tsPlugin,
  };
}

function rules() {
  return {
    '@typescript-eslint/no-unsafe-type-assertion': 'error',
  };
}

module.exports = { parserOptions, plugins, rules };
