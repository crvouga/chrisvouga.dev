/**
 * Single re-export surface for CLI presentation helpers.
 *
 * `cli/index.ts` imports presentation utilities from here so it does not
 * need to know whether a helper lives in `theme.ts` (colors/layout) or
 * `output.ts` (modes/spinners).
 */
export {
  accent,
  banner,
  cancelled,
  cliTheme,
  err,
  fail,
  goodbye,
  label,
  muted,
  ok,
  promptMessage,
  section,
  title,
  warn,
} from './theme';
export {
  printFail,
  printJson,
  printMuted,
  printOk,
  printWarn,
  resolveOutputMode,
  startSpinner,
  type OutputMode,
} from './output';
