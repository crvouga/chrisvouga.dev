import { search } from '@inquirer/prompts';

import { loadHistory } from './history';
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
      const filtering = term.trim().length > 0;
      const items: Array<{ name: string; value: string; description: string }> =
        [];
      if (!filtering) {
        const recent = loadHistory()
          .map((id) => byId.get(id))
          .filter((c): c is MenuCommand => c !== undefined && c.id !== 'exit');
        for (const cmd of recent) {
          items.push({
            name: cmd.name,
            value: `recent:${cmd.id}`,
            description: cmd.description,
          });
        }
      }
      const visible = commands
        .filter((c) => matches(c, term))
        .sort((a, b) => a.name.localeCompare(b.name));
      for (const cmd of visible) {
        items.push({
          name: cmd.name,
          value: cmd.id,
          description: cmd.description,
        });
      }
      return items;
    },
  });
  if (!choice) return null;
  const id = choice.startsWith('recent:')
    ? choice.slice('recent:'.length)
    : choice;
  return byId.get(id) ?? null;
}
