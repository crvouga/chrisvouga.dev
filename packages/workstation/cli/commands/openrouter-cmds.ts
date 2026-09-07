import type { GlobalOpts } from '../lib/cli-opts';
import { resolveModelCatalog } from '../lib/models';
import { currentPlatform } from '../lib/platform/index';
import { providerStatuses } from '../lib/providers-sync';
import {
  muted,
  printJson,
  resolveOutputMode,
  section,
} from '../lib/output-and-theme';

/**
 * `ws openrouter` — the OpenRouter domain. Owns the live model catalog
 * (used by `ws opencode set-model`) and the OpenRouter API key state.
 * Nothing here writes opencode.json — see `ws opencode`.
 */
export async function cmdOpenRouterStatus(opts: GlobalOpts): Promise<void> {
  const platform = currentPlatform();
  const mode = resolveOutputMode(opts.json);
  const statuses = await providerStatuses();
  const openrouter = statuses.find((p) => p.id === 'openrouter');
  const catalog = await resolveModelCatalog(platform);
  const payload = {
    key: openrouter
      ? { state: openrouter.state, vaultKey: openrouter.vaultKey }
      : { state: 'not-catalogued', vaultKey: 'OPENROUTER_API_KEY' },
    catalog: {
      source: catalog.source,
      count: catalog.models.length,
      cachePath: `${platform.cacheDir()}/ws-models.json`,
    },
  };
  if (mode === 'json') {
    printJson({ ok: true, ...payload });
    return;
  }
  section('OpenRouter', `key ${payload.key.state} · catalog ${catalog.source}`);
  console.log(
    `  key: ${muted(`${payload.key.vaultKey} [${payload.key.state}]`)}`
  );
  console.log(
    `  catalog: ${muted(`${catalog.models.length} models via ${catalog.source}`)}`
  );
  console.log(`  cache: ${muted(payload.catalog.cachePath)}`);
}

type ModelsOpts = GlobalOpts & {
  refresh?: boolean | undefined;
  query?: string | undefined;
  limit?: number | undefined;
};

export async function cmdOpenRouterModels(opts: ModelsOpts): Promise<void> {
  const platform = currentPlatform();
  const mode = resolveOutputMode(opts.json);
  const catalog = await resolveModelCatalog(platform, {
    refresh: opts.refresh,
  });
  const q = (opts.query ?? '').trim().toLowerCase();
  const filtered =
    q.length === 0
      ? catalog.models
      : catalog.models.filter((m) =>
          `${m.name} ${m.id}`.toLowerCase().includes(q)
        );
  const limit = opts.limit ?? 50;
  const shown = filtered.slice(0, limit);
  if (mode === 'json') {
    printJson({
      ok: true,
      source: catalog.source,
      total: catalog.models.length,
      shown: shown.length,
      models: shown,
    });
    return;
  }
  section(
    'OpenRouter models',
    `${filtered.length} match(es) via ${catalog.source}`
  );
  for (const m of shown) console.log(`  ${m.id} ${muted(`· ${m.name}`)}`);
  if (filtered.length > shown.length) {
    console.log(
      `  ${muted(`…and ${filtered.length - shown.length} more (use --limit / --query)`)}`
    );
  }
}
