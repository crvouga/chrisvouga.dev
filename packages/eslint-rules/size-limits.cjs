'use strict';

/**
 * Shared best-practice size limits for files, functions, and complexity.
 *
 * Thresholds and structure follow Tiger Style: hard limits over soft taste,
 * named constants instead of magic numbers, and load-time assertions so a
 * misconfigured limit fails loudly instead of silently disabling enforcement.
 *
 * Severity is `'error'` deliberately — make the standard load-bearing.
 * Demote to `'warn'` only as a temporary measure while paying down a
 * pre-existing backlog; do not leave it that way.
 */

const assert = require('node:assert/strict');

const SEVERITY = 'error';

// Hard limits, ordered coarsest (file) to finest (line). Tiger Style caps
// functions at 70 lines and keeps cyclomatic complexity tight; tests still
// honor the structural caps but exempt size (see `testOverrides`).
const FILE_MAX_LINES = 500;
const FUNCTION_MAX_LINES = 70;
const FUNCTION_MAX_PARAMS = 4;
const FUNCTION_MAX_DEPTH = 4;
const FUNCTION_MAX_STATEMENTS = 25;
const FUNCTION_MAX_NESTED_CALLBACKS = 3;
const FUNCTION_CYCLOMATIC_COMPLEXITY = 10;
const FILE_MAX_CLASSES = 1;
const LINE_MAX_STATEMENTS = 1;

assertPositiveInteger(FILE_MAX_LINES, 'FILE_MAX_LINES');
assertPositiveInteger(FUNCTION_MAX_LINES, 'FUNCTION_MAX_LINES');
assertPositiveInteger(FUNCTION_MAX_PARAMS, 'FUNCTION_MAX_PARAMS');
assertPositiveInteger(FUNCTION_MAX_DEPTH, 'FUNCTION_MAX_DEPTH');
assertPositiveInteger(FUNCTION_MAX_STATEMENTS, 'FUNCTION_MAX_STATEMENTS');
assertPositiveInteger(
  FUNCTION_MAX_NESTED_CALLBACKS,
  'FUNCTION_MAX_NESTED_CALLBACKS'
);
assertPositiveInteger(
  FUNCTION_CYCLOMATIC_COMPLEXITY,
  'FUNCTION_CYCLOMATIC_COMPLEXITY'
);
assertPositiveInteger(FILE_MAX_CLASSES, 'FILE_MAX_CLASSES');
assertPositiveInteger(LINE_MAX_STATEMENTS, 'LINE_MAX_STATEMENTS');

// A function cannot legitimately be larger than the file that contains it.
// Catching this at load time prevents a typo from silently widening the rule.
assert.ok(
  FUNCTION_MAX_LINES <= FILE_MAX_LINES,
  `FUNCTION_MAX_LINES (${FUNCTION_MAX_LINES}) must be <= FILE_MAX_LINES (${FILE_MAX_LINES})`
);
assert.ok(
  ['error', 'warn', 'off'].includes(SEVERITY),
  `SEVERITY must be 'error' | 'warn' | 'off', got ${SEVERITY}`
);

function assertPositiveInteger(value, name) {
  assert.equal(typeof name, 'string');
  assert.ok(name.length > 0, 'name must be non-empty');
  assert.equal(typeof value, 'number', `${name} must be a number`);
  assert.ok(Number.isFinite(value), `${name} must be finite`);
  assert.ok(Number.isInteger(value), `${name} must be an integer`);
  assert.ok(value > 0, `${name} must be > 0, got ${value}`);
}

function rules() {
  return {
    'max-lines': [
      SEVERITY,
      { max: FILE_MAX_LINES, skipBlankLines: true, skipComments: true },
    ],
    'max-lines-per-function': [
      SEVERITY,
      {
        max: FUNCTION_MAX_LINES,
        skipBlankLines: true,
        skipComments: true,
        IIFEs: true,
      },
    ],
    'max-params': [SEVERITY, FUNCTION_MAX_PARAMS],
    'max-depth': [SEVERITY, FUNCTION_MAX_DEPTH],
    'max-statements': [SEVERITY, FUNCTION_MAX_STATEMENTS],
    'max-nested-callbacks': [SEVERITY, FUNCTION_MAX_NESTED_CALLBACKS],
    complexity: [SEVERITY, FUNCTION_CYCLOMATIC_COMPLEXITY],
    'max-classes-per-file': [SEVERITY, FILE_MAX_CLASSES],
    'max-statements-per-line': [SEVERITY, { max: LINE_MAX_STATEMENTS }],
  };
}

// Tests legitimately contain long describe/it blocks and many assertions;
// size caps there generate noise without surfacing real bugs. The structural
// caps (complexity, depth, params, classes-per-file) stay on because those
// still detect smells in test code.
function testOverrides() {
  return {
    files: [
      '**/*.test.ts',
      '**/*.test.tsx',
      '**/*.spec.ts',
      '**/*.spec.tsx',
      '**/__tests__/**',
      '**/__fixtures__/**',
      '**/testing/**',
    ],
    rules: {
      'max-lines': 'off',
      'max-lines-per-function': 'off',
      'max-statements': 'off',
      'max-nested-callbacks': 'off',
    },
  };
}

module.exports = { rules, testOverrides };
