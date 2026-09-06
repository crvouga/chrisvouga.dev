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
  return buildLogger(options.name, options.level ?? 'debug', {});
}

function buildLogger(
  name: string,
  level: LogLevel,
  bindings: Record<string, unknown>
): Logger {
  const threshold = LEVEL_VALUE[level];

  function emit(
    lvl: Exclude<LogLevel, 'silent'>,
    msg: string,
    context?: Record<string, unknown>
  ): void {
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
    (console[method] as (...args: unknown[]) => void)(JSON.stringify(entry));
  }

  return {
    debug: (msg, context) => emit('debug', msg, context),
    info: (msg, context) => emit('info', msg, context),
    warn: (msg, context) => emit('warn', msg, context),
    error: (msg, context) => emit('error', msg, context),
    child: (extra) => buildLogger(name, level, { ...bindings, ...extra }),
  };
}
