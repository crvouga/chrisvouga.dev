import { assert } from '@pkgs/assert';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

export interface Logger {
  debug(msg: string, context?: Record<string, unknown>): void;
  info(msg: string, context?: Record<string, unknown>): void;
  warn(msg: string, context?: Record<string, unknown>): void;
  error(msg: string, context?: Record<string, unknown>): void;
  child(bindings: Record<string, unknown>): Logger;
}

const LEVEL_VALUE: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  silent: 4,
};

const CONSOLE_METHOD: Record<Exclude<LogLevel, 'silent'>, keyof Console> = {
  debug: 'debug',
  info: 'info',
  warn: 'warn',
  error: 'error',
};

export interface CreateLoggerOptions {
  name: string;
  level?: LogLevel;
}

export function createLogger(options: CreateLoggerOptions): Logger {
  assert.record(options, 'createLogger: options must be an object');
  assert.nonEmptyString(options.name, 'createLogger: name must be non-empty');
  assert.defined(
    options.level ?? 'debug',
    'createLogger: level fallback valid'
  );
  const level = options.level ?? 'debug';
  assert.enum(
    level,
    ['debug', 'info', 'warn', 'error', 'silent'],
    'createLogger: unknown level'
  );
  return buildLogger(options.name, level, {});
}

function buildLogger(
  name: string,
  level: LogLevel,
  bindings: Record<string, unknown>
): Logger {
  assert.nonEmptyString(name, 'buildLogger: name must be non-empty');
  assert.enum(
    level,
    ['debug', 'info', 'warn', 'error', 'silent'],
    'buildLogger: unknown level'
  );
  assert.record(bindings, 'buildLogger: bindings must be an object');
  const threshold = LEVEL_VALUE[level];
  assert.defined(threshold, 'buildLogger: threshold must exist for level');
  assert.number(threshold, 'buildLogger: threshold must be a number');
  assert.equals(
    LEVEL_VALUE[level],
    threshold,
    'buildLogger: threshold invariant'
  );

  function emit(
    lvl: Exclude<LogLevel, 'silent'>,
    msg: string,
    context?: Record<string, unknown>
  ): void {
    assert.enum(lvl, ['debug', 'info', 'warn', 'error'], 'emit: unknown level');
    assert.string(msg, 'emit: msg must be a string');
    assert.ok(
      context === undefined ||
        (typeof context === 'object' && context !== null),
      'emit: context must be an object when provided'
    );
    if (LEVEL_VALUE[lvl] < threshold) return;

    const entry = {
      level: lvl,
      time: new Date().toISOString(),
      name,
      msg,
      ...bindings,
      ...context,
    };

    const method = CONSOLE_METHOD[lvl];
    assert.defined(method, 'emit: console method must exist for level');
    (console[method] as (...args: unknown[]) => void)(JSON.stringify(entry));
  }

  return {
    debug: (msg, context) => emit('debug', msg, context),
    info: (msg, context) => emit('info', msg, context),
    warn: (msg, context) => emit('warn', msg, context),
    error: (msg, context) => emit('error', msg, context),
    child: (extra) => {
      assert.record(extra, 'child: bindings must be an object');
      const merged = { ...bindings, ...extra };
      assert.record(merged, 'child: merged bindings must be an object');
      return buildLogger(name, level, merged);
    },
  };
}
