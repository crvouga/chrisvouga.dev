import chalk from "chalk";

/** Soft cyan / gray palette — readable on light and dark terminals. */
export const accent = chalk.cyan;
export const muted = chalk.dim;
export const title = chalk.bold.white;
export const ok = chalk.green;
export const err = chalk.red;
export const warn = chalk.yellow;
export const label = chalk.bold.cyan;

/** Shared Inquirer theme for search / select / confirm / input / password. */
export const cliTheme = {
  prefix: {
    idle: accent("◆"),
    done: muted("◇"),
  },
  icon: {
    cursor: accent("❯"),
  },
  style: {
    answer: (text: string) => ok(text),
    message: (text: string, status?: "idle" | "done" | "loading") =>
      status === "done" ? muted(text) : title(text),
    error: (text: string) => err(text),
    help: (text: string) => muted(text),
    highlight: (text: string) => accent(text),
    description: (text: string) => muted(text),
    disabled: (text: string) => muted(text),
    searchTerm: (text: string) => chalk.bold.cyan(text),
    keysHelpTip: (keys: [key: string, action: string][]) => {
      if (!keys.length) {
        return muted("↑↓ · type to filter · ⏎ · ⌃C");
      }
      return muted(
        keys.map(([key, action]) => `${key} ${action}`).join(" · "),
      );
    },
  },
};

export function banner(): void {
  console.log("");
  console.log(`${accent("╭")} ${label("9router")} ${muted("local ops")}`);
  console.log(
    `${accent("╰")} ${muted("type to filter · ↑↓ navigate · ⏎ run · ⌃C quit")}`,
  );
  console.log("");
}

export function section(name: string, description?: string): void {
  console.log("");
  console.log(`${accent("▶")} ${title(name)}`);
  if (description) {
    console.log(`  ${muted(description)}`);
  }
  console.log("");
}

export function goodbye(): void {
  console.log(muted("Bye."));
}

export function cancelled(): void {
  console.log(warn("\nCancelled."));
}

export function fail(message: string): void {
  console.error(`\n${err("ERROR")} ${message}`);
}

export function promptMessage(name: string, description?: string): string {
  if (!description) return name;
  return `${title(name)}\n  ${muted(description)}`;
}
