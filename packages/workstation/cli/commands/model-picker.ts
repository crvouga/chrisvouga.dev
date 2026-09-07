import { search } from '@inquirer/prompts';

import { filterModels, resolveModelRef, type ModelEntry } from '../lib/models';
import type { ModelSlot } from '../lib/opencode-config';
import { NonInteractiveError } from '../lib/prompt';
import { cliTheme, MENU_PAGE_SIZE } from '../lib/theme';

export type PickModelOpts = {
  slot: ModelSlot;
  current: string | null;
  catalog: readonly ModelEntry[];
  connectedProviders: readonly string[];
  nonInteractive?: boolean | undefined;
};

function toChoices(
  models: readonly ModelEntry[],
  connected: readonly string[]
): Array<{ name: string; value: string; description: string }> {
  return models.map((m) => {
    const ref = resolveModelRef(m.id, connected);
    // Names are not unique across providers (e.g. base vs batch vs
    // contributor variants), so every row carries its catalog id.
    return { name: `${m.name} (${m.id})`, value: ref, description: ref };
  });
}

/**
 * Searchable model picker for one slot. The list height is bounded
 * (`MENU_PAGE_SIZE`) so prior output stays visible without scrolling.
 */
export async function pickModel(opts: PickModelOpts): Promise<string> {
  if (opts.nonInteractive === true) throw new NonInteractiveError();
  const hint = opts.current ?? 'unset';
  return search({
    message: `Model for ${opts.slot} (current: ${hint})`,
    pageSize: MENU_PAGE_SIZE,
    theme: cliTheme,
    source: async (input) => {
      const filtered = filterModels(opts.catalog, input ?? '');
      const ordered = moveCurrentFirst(filtered, opts.current);
      return toChoices(ordered, opts.connectedProviders);
    },
  });
}

/** Keep the current selection findable: first when unfiltered. Pure. */
export function moveCurrentFirst(
  models: readonly ModelEntry[],
  current: string | null
): ModelEntry[] {
  if (current === null) return [...models];
  const match = models.find(
    (m) => m.id === current || `openrouter/${m.id}` === current
  );
  if (match === undefined) return [...models];
  return [match, ...models.filter((m) => m !== match)];
}
