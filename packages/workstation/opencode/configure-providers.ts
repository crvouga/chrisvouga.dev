#!/usr/bin/env bun
/**
 * Generate ~/.config/opencode/opencode.json with every OpenCode provider that
 * has a valid API key in the secret store (Vault / OpenBao).
 *
 * Thin wrapper over the `ws` CLI provider sync
 * (`cli/lib/providers-sync.ts`) so the `configure:opencode` package script
 * keeps working. Prefer `ws opencode sync` / `ws providers sync`.
 *
 * Usage:
 *   bun run --filter @pkgs/workstation configure:opencode [--strict]
 */
import { currentPlatform } from '../cli/lib/platform/index';
import { syncProvidersFromVault } from '../cli/lib/providers-sync';

async function main(): Promise<void> {
  const strict = process.argv.includes('--strict');
  const result = await syncProvidersFromVault(currentPlatform(), { strict });
  if (result.configPath.length > 0) {
    console.log(`Wrote ${result.configPath}`);
  }
  console.log(`\nConnected ${result.connected.length} provider(s):`);
  for (const p of result.connected) console.log(`  ✓ ${p.id} (${p.vaultKey})`);
  if (result.skipped.length > 0) {
    console.log(`\nSkipped ${result.skipped.length} provider(s):`);
    for (const s of result.skipped) {
      console.log(`  − ${s.id}: ${s.reason}`);
    }
  }
}

await main();
