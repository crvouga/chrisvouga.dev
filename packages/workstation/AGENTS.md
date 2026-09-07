# Workstation agent notes

- `packages/workstation/README.md` is the canonical context for this area — read it before modifying workstation configuration.
- Inspect existing monorepo conventions (root `README.md`, root `AGENTS.md`) before introducing new mechanisms.
- Keep `packages/workstation/README.md` current whenever supported tools, structure, setup behavior, or conventions materially change.
- Keep workstation tooling simple; reuse existing workspace packages where appropriate; do not scaffold speculative infrastructure.
- OpenCode provider config is sourced from Vault via `@pkgs/secret-store`'s `SecretStoreEntry`; see `opencode/provider-secrets.ts` (catalog) and `opencode/configure-providers.ts` (generator). The generated `~/.config/opencode/opencode.json` embeds keys (0600) and is never committed.
- OpenCode defaults to the **OpenRouter Auto Router** when the `openrouter` key is present. The Auto Router model is owned by `@pkgs/openrouter` (`packages/openrouter/`, `auto-router.ts`); the generator registers `openrouter/auto` and sets `model`/`small_model` to it. Never configure the Auto Router in the OpenRouter web UI — set the cost tier / model filters in `@pkgs/openrouter`.
- Never commit secrets.
