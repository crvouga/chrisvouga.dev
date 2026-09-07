import { search } from '@inquirer/prompts';

import { cliTheme, MENU_PAGE_SIZE } from './lib/theme';

export type MenuCommand = {
  id: string;
  name: string;
  description: string;
  run: () => Promise<void>;
};

function matches(cmd: MenuCommand, term: string): boolean {
  const q = term.trim().toLowerCase();
  if (q.length === 0) return true;
  const hay = `${cmd.name} ${cmd.description} ${cmd.id}`.toLowerCase();
  return q.split(/\s+/).every((token) => hay.includes(token));
}

function compareCommands(a: MenuCommand, b: MenuCommand): number {
  // `exit` always sorts last so it never floats mid-list.
  if (a.id === 'exit' && b.id !== 'exit') return 1;
  if (b.id === 'exit' && a.id !== 'exit') return -1;
  return a.name.localeCompare(b.name);
}

export async function searchableMenu(
  commands: MenuCommand[]
): Promise<MenuCommand | null> {
  const byId = new Map(commands.map((c) => [c.id, c]));
  const choice = await search({
    message: 'Choose a command',
    pageSize: MENU_PAGE_SIZE,
    theme: cliTheme,
    source: async (input) => {
      const term = input ?? '';
      return commands
        .filter((c) => matches(c, term))
        .sort(compareCommands)
        .map((cmd) => ({
          name: cmd.name,
          value: cmd.id,
          description: cmd.description,
        }));
    },
  });
  if (!choice) return null;
  return byId.get(choice) ?? null;
}
