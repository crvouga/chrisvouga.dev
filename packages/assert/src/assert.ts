import { registerCrashHandler as addCrashHandler, crash } from './crash/crash';
import type { CrashHandler } from './crash/crash-handler/crash-handler';
import { ValidationError } from './validation-error';

export type AssertErrorMode = 'validation' | 'crash' | 'noop';

/**
 * Assertion helper with three modes:
 * - {@link Assert.validation} throws {@link ValidationError} on failure (recoverable input checks).
 * - {@link Assert.crash} logs and terminates the process or shows a fatal UI (see `crash`).
 * - {@link Assert.noop} short-circuits every method (for hot paths where the
 *   runtime cost of validation would dominate; trades runtime safety for
 *   throughput). Type-level narrowing still applies, so callers see the
 *   asserted type even though no runtime check ran.
 */
export class Assert {
  /**
   * Returns an assert instance that throws {@link ValidationError} on failure (for recoverable input checks).
   */
  static validation(): Assert {
    return new Assert('validation');
  }

  /**
   * Returns an assert instance that uses the global crash path on failure (non-recoverable invariant violations).
   */
  static crash(): Assert {
    return new Assert('crash');
  }

  /**
   * Returns an assert instance whose methods are runtime no-ops. Type-level
   * narrowing (`asserts value is T`) still applies, so downstream callers
   * compile as if the check ran. Use only on hot paths via
   * `@pkgs/assert` `hotAssert()` — never trust input you did not
   * produce.
   */
  static noop(): Assert {
    return new Assert('noop');
  }

  static withErrorMode(errorMode: AssertErrorMode): Assert {
    return new Assert(errorMode);
  }

  /**
   * Installs a {@link CrashHandler} for {@link Assert.crash} failures. Handlers are ordered by
   * {@link CrashHandler.priority} (lower first); the first matching handler wins.
   *
   * @returns Disposer that removes this handler.
   */
  static registerCrashHandler(handler: CrashHandler): () => void {
    return addCrashHandler(handler);
  }

  /**
   * @see Assert.registerCrashHandler
   */
  registerCrashHandler(handler: CrashHandler): () => void {
    return Assert.registerCrashHandler(handler);
  }

  private constructor(private readonly errorMode: AssertErrorMode = 'crash') {}

  /**
   * `true` when this instance runs runtime checks; `false` when it's a noop
   * (so callers can short-circuit expensive validation loops before iterating).
   */
  isEnabled(): boolean {
    return this.errorMode !== 'noop';
  }

  /**
   * Asserts that `condition` is true.
   *
   * @param condition - Predicate that must hold.
   * @param message - Message when the assertion fails.
   * @param context - Optional structured context attached to the failure.
   */
  ok(
    condition: boolean,
    message: string,
    context?: Record<string, unknown>
  ): asserts condition {
    switch (this.errorMode) {
      case 'noop': {
        return;
      }
      case 'validation': {
        if (!condition) {
          throw new ValidationError(message, context);
        }
        return;
      }
      default: {
        crash(condition, message, context);
      }
    }
  }

  /**
   * Indicates unreachable code. Always fails the assertion.
   *
   * @param message - Message to describe why this code path is unreachable.
   * @param context - Optional structured context attached to the failure.
   * @throws ValidationError if in validation mode.
   * @throws Error (crashes) if in crash mode.
   */
  fail(message: string, context?: Record<string, unknown>): never {
    this.ok(false, message, context);
  }

  /**
   * Asserts that `value` is one of the strings in `values`.
   *
   * @param value - Value to check.
   * @param values - Allowed string literals.
   * @param message - Message when the assertion fails.
   */
  enum<T extends string>(
    value: unknown,
    values: T[],
    message: string
  ): asserts value is T {
    this.string(value, message);
    for (const v of values) {
      if (v === value) return;
    }
    this.ok(false, message, { value, values });
  }

  /**
   * Asserts that `value` is an array (`Array.isArray`).
   *
   * @param value - Value to check.
   * @param message - Message when the assertion fails.
   * @param context - Optional extra context (merged with `value`).
   */
  array(
    value: unknown,
    message: string,
    context?: Record<string, unknown>
  ): asserts value is unknown[] {
    this.ok(Array.isArray(value), message, { ...context, value });
  }

  /**
   * Asserts that `value` is a non-empty array.
   *
   * @param value - Value to check.
   * @param message - Message when the assertion fails.
   * @param context - Optional extra context (merged with `value`).
   */
  nonEmptyArray(
    value: unknown,
    message: string,
    context?: Record<string, unknown>
  ): asserts value is [unknown, ...unknown[]] {
    this.array(value, message);
    this.ok(value.length > 0, message, { ...context, value });
  }

  /**
   * Asserts that `value` is neither `null` nor `undefined`.
   *
   * @param value - Possibly nullish value.
   * @param message - Message when the assertion fails.
   * @param context - Optional extra context (merged with `value`).
   */
  defined<T>(
    value: T | null | undefined,
    message: string,
    context?: Record<string, unknown>
  ): asserts value is T {
    this.ok(value !== undefined && value !== null, message, {
      ...context,
      value,
    });
  }

  /**
   * Asserts strict equality (`===`) between `actual` and `expected`.
   *
   * @param actual - Observed value.
   * @param expected - Expected value.
   * @param message - Message when the assertion fails.
   * @param context - Optional extra context (merged with `actual` and `expected`).
   */
  equals(
    actual: unknown,
    expected: unknown,
    message: string,
    context?: Record<string, unknown>
  ): asserts actual is unknown {
    this.ok(actual === expected, message, { ...context, actual, expected });
  }

  /**
   * Asserts that `value` has an own or inherited property `field` (`field in value`).
   *
   * @param value - Object to inspect.
   * @param field - Property key that must be present.
   * @param message - Message when the assertion fails.
   */
  field<O extends object, K extends PropertyKey>(
    value: O,
    field: K,
    message: string
  ): asserts value is O & Record<K, unknown> {
    this.ok(field in value, message, { value, field });
  }

  /**
   * Asserts that `value` is an instance of `ctor`.
   *
   * @param value - Value to check.
   * @param ctor - Constructor function.
   * @param message - Message when the assertion fails.
   */
  instanceOf<T>(
    value: unknown,
    ctor: new (...args: unknown[]) => T,
    message: string
  ): asserts value is T {
    this.ok(value instanceof ctor, message, { value, ctor: ctor.name });
  }

  /**
   * Asserts that `value` is a non-null object and not an array.
   *
   * @param value - Value to check.
   * @param message - Message when the assertion fails.
   */
  record(
    value: unknown,
    message: string,
    context?: Record<string, unknown>
  ): asserts value is Record<string, unknown> {
    this.ok(
      value !== null && typeof value === 'object' && !Array.isArray(value),
      message,
      { ...context, value }
    );
  }

  /**
   * Asserts that `value` has runtime type `string`.
   *
   * @param value - Value to check.
   * @param message - Message when the assertion fails.
   */
  string(
    value: unknown,
    message: string,
    context?: Record<string, unknown>
  ): asserts value is string {
    this.ok(typeof value === 'string', message, { ...context, value });
  }

  /**
   * Asserts that `value` is a non-empty string.
   *
   * @param value - Value to check.
   * @param message - Message when the assertion fails.
   */
  nonEmptyString(
    value: unknown,
    message: string,
    context?: Record<string, unknown>
  ): asserts value is string {
    this.string(value, message, context);
    this.ok(value.length > 0, message, { ...context, value });
  }

  /**
   * Asserts that `value` is a finite number (not NaN, not ±Infinity).
   *
   * @param value - Value to check.
   * @param message - Message when the assertion fails.
   */
  number(value: unknown, message: string): asserts value is number {
    this.ok(typeof value === 'number', message, {
      value,
      type: typeof value,
    });
    this.ok(Number.isFinite(value), message, {
      value,
      isFinite: Number.isFinite(value),
    });
    this.ok(!Number.isNaN(value), message, {
      value,
      isNaN: Number.isNaN(value),
    });
  }

  /**
   * Asserts that `value` is a safe integer within `Number.MIN_SAFE_INTEGER`…`Number.MAX_SAFE_INTEGER`.
   *
   * @param value - Value to check.
   * @param message - Message when the assertion fails.
   */
  integer(value: unknown, message: string): asserts value is number {
    this.number(value, message);
    this.ok(
      value >= Number.MIN_SAFE_INTEGER && value <= Number.MAX_SAFE_INTEGER,
      message,
      {
        value,
        min: Number.MIN_SAFE_INTEGER,
        max: Number.MAX_SAFE_INTEGER,
      }
    );
    this.ok(Number.isSafeInteger(value), message, {
      value,
      isSafeInteger: Number.isSafeInteger(value),
    });
  }

  /**
   * Asserts that `value` is a non-negative number (i.e., `value >= 0`).
   *
   * @param value - Value to check.
   * @param message - Message when the assertion fails.
   */
  nonNegative(value: unknown, message: string): asserts value is number {
    this.number(value, message);
    this.ok(value >= 0, message, {
      value,
      isNonNegative: value >= 0,
    });
  }

  /**
   * Asserts that `value` is a non-negative integer (i.e., a safe integer >= 0).
   *
   * @param value - Value to check.
   * @param message - Message when the assertion fails.
   */
  nonNegativeInteger(value: unknown, message: string): asserts value is number {
    this.integer(value, message);
    this.nonNegative(value, message);
  }

  /**
   * Asserts that `fn` completes without throwing.
   *
   * @param fn - Function to invoke.
   * @param message - Message when `fn` throws.
   * @param context - Optional extra context (the caught `error` is merged in on failure).
   */
  notThrows(
    fn: () => unknown,
    message: string,
    context?: Record<string, unknown>
  ): asserts fn is () => unknown {
    if (!this.isEnabled()) return;
    try {
      fn();
      return;
    } catch (error) {
      this.ok(false, message, { ...context, error });
    }
  }

  /**
   * Asserts that `values` is an array and runs `fn` as a per-element assertion (narrows the element type).
   *
   * @param values - Array to check and iterate.
   * @param fn - Assertion callback invoked for each element.
   */
  all<T extends U, U = unknown>(
    values: U[] | U,
    fn: (value: U) => asserts value is T extends U ? T : never
  ): asserts values is T[] {
    if (!this.isEnabled()) return;
    this.array(values, 'values must be an array');
    for (const value of values) {
      fn(value);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic higher-order wrapper; parameters/return tied via Parameters<> / ReturnType<>
  fn<TFunc extends (...args: any) => any>(
    checks: {
      fn: TFunc;
      pre?: (...args: Parameters<TFunc>) => void;
      post?: (returnValue: ReturnType<TFunc>) => void;
    },
    message?: string,
    context?: Record<string, unknown>
  ): (...args: Parameters<TFunc>) => ReturnType<TFunc> {
    if (!this.isEnabled()) return checks.fn;
    return (...args: Parameters<TFunc>) => {
      if (checks.pre) {
        this.notThrows(
          () => checks.pre?.(...args),
          message ?? 'Pre-check failed',
          context
        );
      }
      try {
        const returnValue = checks.fn(...args);
        if (checks.post) {
          this.notThrows(
            () => checks.post?.(returnValue),
            message ?? 'Post-check failed',
            context
          );
        }
        return returnValue;
      } catch (error) {
        this.ok(false, message ?? 'Function failed', { ...context, error });
      }
    };
  }
}
