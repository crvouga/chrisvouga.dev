# Workstation agent notes

- `workstation/README.md` is the canonical context for this area — read it before modifying workstation configuration.
- Inspect existing monorepo conventions (root `README.md`, root `AGENTS.md`) before introducing new mechanisms.
- Keep `workstation/README.md` current whenever supported tools, structure, setup behavior, or conventions materially change.
- Keep workstation tooling simple; reuse existing workspace packages where appropriate; do not scaffold speculative infrastructure.
- Never commit secrets.