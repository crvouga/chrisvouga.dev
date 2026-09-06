import { confirm, input, password, select, Separator } from "@inquirer/prompts";
import { cliTheme, promptMessage } from "./theme.ts";

export { Separator };

/** Confirm with a name and short description. */
export async function askConfirm(
  name: string,
  description: string,
  defaultValue = false,
): Promise<boolean> {
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
}): Promise<T> {
  return select({
    message: promptMessage(opts.message, opts.description),
    choices: opts.choices,
    default: opts.default,
    theme: cliTheme,
  });
}

export async function askInput(opts: {
  message: string;
  description?: string;
  default?: string;
  validate?: (value: string) => boolean | string | Promise<boolean | string>;
}): Promise<string> {
  return input({
    message: promptMessage(opts.message, opts.description),
    default: opts.default,
    validate: opts.validate,
    theme: cliTheme,
  });
}

export async function askPassword(opts: {
  message: string;
  description?: string;
}): Promise<string> {
  return password({
    message: promptMessage(opts.message, opts.description),
    mask: "*",
    theme: cliTheme,
  });
}
