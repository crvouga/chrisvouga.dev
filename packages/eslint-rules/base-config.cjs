'use strict';

const tsParser = require('@typescript-eslint/parser');
const tsPlugin = require('@typescript-eslint/eslint-plugin');
const reactHooks = require('eslint-plugin-react-hooks');
const noOnlyTests = require('eslint-plugin-no-only-tests');
const eslintPluginNaming = require('eslint-plugin-naming');
const sizeLimits = require('./size-limits.cjs');
const a11yRestrictions = require('./a11y-restrictions.cjs');

/** Bump hooks above Expo's default severities where needed. */
const reactHooksStrictRules = {
  'react-hooks/rules-of-hooks': 'error',
  'react-hooks/exhaustive-deps': 'error',
  // Ref-mirror pattern (latestRef.current = x in render) is common for stable callbacks.
  'react-hooks/refs': 'off',
  // Data loaders often wrap synchronous `setLoading(true)` inside effects via helpers/async tasks.
  'react-hooks/set-state-in-effect': 'off',
};

/** Rules shared by every TS/TSX package (type-aware). */
function killerTypeScriptRules() {
  return {
    'no-unused-vars': 'off',
    'no-undef': 'off',
    'no-redeclare': 'off',

    '@typescript-eslint/no-unused-vars': [
      'error',
      {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      },
    ],

    '@typescript-eslint/no-floating-promises': [
      'error',
      // Explicit `void promise` marks intentional fire-and-forget (Tiger: still handle errors inside .then/.catch).
      { ignoreVoid: true, ignoreIIFE: false },
    ],
    '@typescript-eslint/no-misused-promises': [
      'error',
      {
        checksVoidReturn: false,
        checksConditionals: true,
        checksSpreads: true,
      },
    ],
    '@typescript-eslint/await-thenable': 'off',
    // Async for interface parity / fire-and-forget — require-await + return-await churn without Tiger-Style promise gains.
    '@typescript-eslint/require-await': 'off',
    '@typescript-eslint/return-await': 'off',

    '@typescript-eslint/no-unsafe-argument': 'off',
    '@typescript-eslint/no-unsafe-assignment': 'off',
    '@typescript-eslint/no-unsafe-call': 'off',
    '@typescript-eslint/no-unsafe-member-access': 'off',
    '@typescript-eslint/no-unsafe-return': 'off',
    // Too noisy with RN style arrays and design-system nominal typing; rely on no-explicit-any + no-unsafe-*.
    '@typescript-eslint/no-unsafe-type-assertion': 'off',
    '@typescript-eslint/no-unsafe-enum-comparison': 'error',
    '@typescript-eslint/no-base-to-string': 'off',
    '@typescript-eslint/restrict-template-expressions': [
      'error',
      {
        allowAny: false,
        allowBoolean: false,
        allowNullish: true,
        allowNumber: true,
      },
    ],
    '@typescript-eslint/restrict-plus-operands': 'error',

    '@typescript-eslint/switch-exhaustiveness-check': [
      'error',
      { considerDefaultExhaustiveForUnions: true },
    ],

    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/no-non-null-assertion': 'off',

    '@typescript-eslint/consistent-type-imports': [
      'error',
      { prefer: 'type-imports', fixStyle: 'separate-type-imports' },
    ],
    '@typescript-eslint/use-unknown-in-catch-callback-variable': 'error',

    'no-console': ['error', { allow: ['error', 'warn'] }],
    'no-debugger': 'error',
    'no-eval': 'error',
    'no-implied-eval': 'error',
    'no-throw-literal': 'error',
    'no-var': 'error',
    'prefer-const': 'error',
    'no-extra-boolean-cast': 'off',
    eqeqeq: ['error', 'always'],
    // Sequential awaits are intentional in migrations and boot scripts.
    // 'no-await-in-loop': 'off',
    'no-only-tests/no-only-tests': 'error',
  };
}

function defaultNamingIgnore() {
  return ['^index\\.(ts|tsx|js|jsx)$'];
}

function sharedTypeScriptRules(namingIgnore) {
  return {
    ...killerTypeScriptRules(),
    ...reactHooksStrictRules,
    ...sizeLimits.rules(),
    'naming/case': [
      'error',
      {
        match: ['kebab'],
        validateFolders: false,
        ignore: namingIgnore,
      },
    ],
    'no-restricted-syntax': ['error', ...a11yRestrictions.restrictedSyntax()],
  };
}

/**
 * Flat-config blocks for a workspace package.
 * @param {string} tsconfigRootDir `__dirname` of the package's eslint.config.js
 * @param {{ namingIgnore?: string[], mergeWithExpo?: boolean, filesGlob?: string }} [options]
 * `mergeWithExpo`: eslint-config-expo already registers `@typescript-eslint` and `react-hooks`; only add rules + extra plugins.
 * `filesGlob`: limit lint targets (e.g. only under `src/` for app packages).
 */
function createSharedBlocks(tsconfigRootDir, options = {}) {
  const namingIgnore = options.namingIgnore ?? defaultNamingIgnore();
  const mergeWithExpo = options.mergeWithExpo === true;
  const filesGlob = options.filesGlob ?? '**/*.{ts,tsx}';

  const rules = sharedTypeScriptRules(namingIgnore);

  if (mergeWithExpo) {
    return [
      {
        ignores: [
          'dist/**',
          'eslint.config.js',
          '**/.wrangler/**',
          '.wrangler/**',
        ],
      },
      {
        files: [filesGlob],
        languageOptions: {
          parserOptions: {
            projectService: true,
            tsconfigRootDir,
          },
        },
        plugins: {
          'no-only-tests': noOnlyTests,
          naming: eslintPluginNaming,
        },
        rules,
      },
      sizeLimits.testOverrides(),
    ];
  }

  const reactRules = reactHooks.configs.flat.recommended.rules;

  return [
    {
      ignores: [
        'dist/**',
        'eslint.config.js',
        '**/.wrangler/**',
        '.wrangler/**',
      ],
    },
    {
      files: [filesGlob],
      languageOptions: {
        parser: tsParser,
        parserOptions: {
          projectService: true,
          tsconfigRootDir,
        },
      },
      plugins: {
        '@typescript-eslint': tsPlugin,
        'react-hooks': reactHooks,
        'no-only-tests': noOnlyTests,
        naming: eslintPluginNaming,
      },
      rules: {
        ...reactRules,
        ...rules,
      },
    },
    sizeLimits.testOverrides(),
  ];
}

module.exports = {
  createSharedBlocks,
  killerTypeScriptRules,
  defaultNamingIgnore,
};
