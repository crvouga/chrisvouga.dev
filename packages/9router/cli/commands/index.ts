import type { Command } from "../types.ts";
import { appCommands } from "./app.ts";
import { combosCommands } from "./combos.ts";
import { cursorCommands } from "./cursor.ts";
import { lifecycleCommands } from "./lifecycle.ts";
import { providersCommands } from "./providers.ts";
import { secretsCommands } from "./secrets.ts";
import { setupCommands } from "./setup.ts";
import { tunnelCommands } from "./tunnel.ts";

export const exitCommand: Command = {
  id: "exit",
  name: "Exit",
  description: "Quit the 9router CLI",
  run: async () => {
    /* handled by main loop */
  },
};

export const allCommands: Command[] = [
  ...setupCommands,
  ...lifecycleCommands,
  ...appCommands,
  ...secretsCommands,
  ...tunnelCommands,
  ...providersCommands,
  ...combosCommands,
  ...cursorCommands,
  exitCommand,
];
