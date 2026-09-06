import { allCommands } from "./commands/index.ts";
import { pushHistory } from "./history.ts";
import { searchableMenu } from "./menu.ts";
import {
  banner,
  cancelled,
  fail,
  goodbye,
  section,
} from "./theme.ts";
import { CommandError, type Command } from "./types.ts";

function isExitPromptError(err: unknown): boolean {
  return (
    err !== null &&
    typeof err === "object" &&
    "name" in err &&
    (err as { name: string }).name === "ExitPromptError"
  );
}

async function main(): Promise<void> {
  banner();

  for (; ;) {
    let selected: Command | null = null;
    try {
      selected = await searchableMenu(allCommands);
    } catch (err) {
      if (isExitPromptError(err)) {
        console.log("");
        goodbye();
        process.exit(0);
      }
      throw err;
    }

    if (!selected || selected.id === "exit") {
      goodbye();
      process.exit(0);
      return;
    }

    const cmd = selected;
    pushHistory(cmd.id);
    section(cmd.name, cmd.description);

    try {
      await cmd.run();
    } catch (err) {
      if (isExitPromptError(err)) {
        cancelled();
      } else if (err instanceof CommandError) {
        fail(err.message);
      } else {
        fail(err instanceof Error ? err.message : String(err));
      }
    }

    console.log("");
  }
}

main().catch((err) => {
  if (isExitPromptError(err)) {
    console.log("");
    goodbye();
    process.exit(0);
  }
  fail(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
