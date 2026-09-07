import {
  checkbox,
  confirm,
  input,
  password,
  search,
  select,
  Separator,
} from '@inquirer/prompts';

import { cliTheme, promptMessage } from './theme';

export { Separator };

export class NonInteractiveError extends Error {
  constructor(message = 'refusing to prompt in --non-interactive mode') {
    super(message);
    this.name = 'NonInteractiveError';
  }
}

function guard(nonInteractive: boolean | undefined): void {
  if (nonInteractive === true) throw new NonInteractiveError();
}

export async function askConfirm(
  name: string,
  description: string,
  defaultValue = false,
  opts?: { nonInteractive?: boolean }
): Promise<boolean> {
  guard(opts?.nonInteractive);
  return confirm({
    message: promptMessage(name, description),
    default: defaultValue,
    theme: cliTheme,
  });
}

export async function askSelect<T extends string>(opts: {
  message: string;
  description?: string;
  choices: Array<{ name: string; value: T; description?: string } | Separator>;
  default?: T;
  nonInteractive?: boolean;
}): Promise<T> {
  guard(opts.nonInteractive);
  return select({
    message: promptMessage(opts.message, opts.description),
    choices: opts.choices,
    ...(opts.default !== undefined ? { default: opts.default } : {}),
    theme: cliTheme,
  });
}

export async function askCheckbox<T extends string>(opts: {
  message: string;
  description?: string;
  choices: Array<{
    name: string;
    value: T;
    description?: string;
    checked?: boolean;
  }>;
  nonInteractive?: boolean;
}): Promise<T[]> {
  guard(opts.nonInteractive);
  return checkbox({
    message: promptMessage(opts.message, opts.description),
    choices: opts.choices,
    theme: cliTheme,
  });
}

export async function askSearch<T extends string>(opts: {
  message: string;
  choices: Array<{ name: string; value: T; description?: string }>;
  nonInteractive?: boolean;
}): Promise<T> {
  guard(opts.nonInteractive);
  return search({
    message: opts.message,
    theme: cliTheme,
    source: async (input) => {
      const term = (input ?? '').trim().toLowerCase();
      if (term.length === 0) return opts.choices;
      return opts.choices.filter((c) =>
        `${c.name} ${c.description ?? ''}`.toLowerCase().includes(term)
      );
    },
  });
}

export async function askInput(opts: {
  message: string;
  description?: string;
  default?: string;
  nonInteractive?: boolean;
  validate?: (value: string) => boolean | string | Promise<boolean | string>;
}): Promise<string> {
  guard(opts.nonInteractive);
  return input({
    message: promptMessage(opts.message, opts.description),
    ...(opts.default !== undefined ? { default: opts.default } : {}),
    ...(opts.validate !== undefined ? { validate: opts.validate } : {}),
    theme: cliTheme,
  });
}

export async function askPassword(opts: {
  message: string;
  description?: string;
  nonInteractive?: boolean;
}): Promise<string> {
  guard(opts.nonInteractive);
  return password({
    message: promptMessage(opts.message, opts.description),
    mask: '*',
    theme: cliTheme,
  });
}
