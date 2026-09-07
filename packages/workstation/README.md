# Workstation

Portable local-machine and developer-environment configuration, managed as one subsystem of the `workspace` monorepo.

This is the canonical, high-level architectural context for `packages/workstation/`. A fresh agent (or human) can start here without prior conversation history.

## Purpose

`packages/workstation/` is the source of truth for machine configuration that is useful across machines — things like editor/agent configuration, shell and Git settings, CLI tool config, and local service setup. It holds **portable source configuration**, not machine-specific state.

The current practice: keep configuration in this monorepo, link it into the home directory with symlinks, and let every machine converge to the same checked-in source. Checked-in files should make it obvious which filesystem location each one maps to.

## Why it lives in the monorepo

Keeping workstation configuration inside `workspace` means it can reuse what already exists here:

- shared packages and `lib/` TypeScript helpers
- the shared TypeScript / Bun / task conventions
- the same task tooling (`bun run <script>`)
- the existing self-hosted secret store (Vault) and its client (`lib/vault-kv.ts`)
- the same source control and CI conventions as the rest of the workspace

There is no separate dotfiles repository and no separate secret system.

## Scope

`packages/workstation/` may eventually manage:

- OpenCode (current), and other editors (VS Code, etc.)
- shell configuration
- Git configuration
- CLI tools and application configuration
- development-environment configuration
- package installation
- macOS configuration and local services
- machine bootstrap
- credentials sourced from the existing secret store

Only the currently-listed managed configuration below is implemented. Nothing else is scaffolded yet.

## Current managed configuration

- **OpenCode click-to-focus notifications** — native macOS notifications when an OpenCode agent needs attention, with click-to-focus of the right VS Code window, the opencode terminal editor tab, and the attention session. See [OpenCode](#opencode).
- **OpenCode LLM provider connections (from the secret store)** — every OpenCode provider with a valid API key in Vault is wired into `~/.config/opencode/opencode.json`, so `opencode /models` lists all connected models. See [OpenCode providers](#opencode-providers).

## Non-goals

At this stage, `packages/workstation/` is explicitly **not**:

- full machine imaging
- generic configuration management (no Ansible, Nix, Home Manager, chezmoi, GNU Stow, or similar)
- a cross-platform abstraction (macOS only for now)
- secret storage (that is the existing Vault subsystem)
- management of every application
- a general-purpose dotfiles framework
- infrastructure/code for hypothetical future tools

## Structure

```
packages/workstation/
├── README.md                          # this file — canonical context
├── AGENTS.md                          # short agent instructions → points here
├── package.json                       # workspace pkg (deps: secret-store, vault) + configure:opencode script
├── setup.ts                           # idempotent links + notifier build + provider config (bun run workstation:setup)
└── opencode/
    ├── plugins/
    │   └── notifications.ts           # global OpenCode notification plugin (source of truth)
    ├── provider-secrets.ts            # OpenCode provider → Vault key catalog (SecretStoreEntry + docs)
    ├── configure-providers.ts         # reads Vault, writes ~/.config/opencode/opencode.json (0600)
    ├── bin/
    │   ├── opencode-notifier          # CLI shim → OpenCodeNotifier.app (source of truth)
    │   └── focus-opencode             # notification click handler (source of truth)
    └── notifier/
        └── OpenCodeNotifier.swift     # UNUserNotificationCenter accessory app (source of truth)
```

Checked-in → home-directory mapping (installed by setup):

| Checked-in (repo)                                               | Home directory                                                                                  |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `packages/workstation/opencode/plugins/notifications.ts`        | `~/.config/opencode/plugins/notifications.ts` (symlink)                                         |
| `packages/workstation/opencode/bin/opencode-notifier`           | `~/.config/opencode/bin/opencode-notifier` (symlink)                                            |
| `packages/workstation/opencode/bin/focus-opencode`              | `~/.config/opencode/bin/focus-opencode` (symlink)                                               |
| `packages/workstation/opencode/notifier/OpenCodeNotifier.swift` | compiled to `~/.config/opencode/bin/OpenCodeNotifier.app` (generated artifact, never committed) |

## Setup

Initializes workstation-managed configuration under the user's home directory:

```bash
bun install && bun run workstation:setup
```

The command is idempotent and safe to run repeatedly (e.g. after cloning on a fresh machine, or after changing the notifier Swift source):

- derives the `packages/workstation/` root from the location of `setup.ts` (works from any current working directory)
- creates missing parent directories under `$HOME`
- installs managed configuration as **symlinks** pointing into the repository
- an existing, correct symlink is treated as success (no-op)
- compiles `OpenCodeNotifier.swift` into `~/.config/opencode/bin/OpenCodeNotifier.app` with `swiftc` (ad-hoc codesigned, `LSUIElement` — no Dock icon); rebuilds only when the source hash changes; skips with a warning when `swiftc` is missing (the plugin then falls back to plain notifications)
- generates `~/.config/opencode/opencode.json` from the secret store (best-effort — see [OpenCode providers](#opencode-providers))
- refuses to overwrite anything not managed by this repository and exits with an actionable error message on conflict
- never requires `sudo` and never touches configuration outside `$HOME`

What it changes in `$HOME` today:

- creates `~/.config/opencode/plugins/` and `~/.config/opencode/bin/` if needed
- links the plugin and CLI scripts (see table above)
- builds `OpenCodeNotifier.app` and writes `~/.config/opencode/bin/.opencode-notifier.hash`
- writes `~/.config/opencode/opencode.json` (0600) with provider connections sourced from Vault

## OpenCode

OpenCode loads global plugins from `~/.config/opencode/plugins/` automatically. The notification plugin (`notifications.ts`) detects attention events and posts notifications through the OpenCodeNotifier daemon; if the notifier is unavailable or fails, it falls back to a plain `osascript` notification (no click actions). Notification problems can never fail an OpenCode session — every step is best-effort and non-critical.

- **Checked-in plugin path:** `packages/workstation/opencode/plugins/notifications.ts`
- **Resulting global plugin path:** `~/.config/opencode/plugins/notifications.ts` (a symlink)
- **Events that generate notifications:**

  | Event                             | Notification                        |
  | --------------------------------- | ----------------------------------- |
  | `session.idle`                    | `OpenCode` / `Session finished`     |
  | `session.error`                   | `OpenCode` / `Session error`        |
  | `permission.asked`                | `OpenCode` / `Permission required`  |
  | agent invokes the `question` tool | `OpenCode` / `Agent has a question` |

- **Question detection:** the built-in `question` tool (`tool.execute.before` hook with `tool === "question"`). A question waits for user input but is not necessarily a permission request, so it is detected from the tool invocation itself. When a `permission.asked` event follows for the `question` permission, the plugin suppresses the redundant "Permission required" notification — one question produces exactly one useful notification.
- **Payload:** each notification carries `{kind, title, message, subtitle, sessionID, directory, sessionTitle}` — `subtitle` is the session title (best-effort SDK lookup, 500ms timeout) so you can eyeball which session needs you; `directory` and `sessionTitle` drive click-to-focus. Notifications use the sessionID as identifier/thread, so a new event for the same session **replaces** the previous banner instead of stacking.

### Click-to-focus architecture

```
session.idle / session.error / permission.asked / question tool
        │
        ▼
notifications.ts ──spawn──▶ ~/.config/opencode/bin/opencode-notifier --post <json>
        │                              │
        │                              ▼  unix socket ~/.cache/opencode-notifier.sock
        │                     OpenCodeNotifier.app (daemon, accessory app, UNUserNotificationCenter)
        │                              │  posts native banner
        ▼                              ▼
   osascript fallback          user clicks the banner
        (plain banner)                 │
                                       ▼
                     daemon runs ~/.config/opencode/bin/focus-opencode
                        --kind K --session S --dir D --title T
                                       │
                     1. `code <dir>`  → focuses (or opens) the VS Code window
                                       │    for that project — no permissions needed
                     2. System Events keystrokes (one-time Accessibility grant):
                        ctrl+tab → type session title (or "opencode") → Enter
                        → focuses the opencode terminal editor tab
                                       │
                     Done — the TUI shows the session that needs attention
```

Why this shape:

- `terminal-notifier` is **not** used: it depends on the deprecated `NSUserNotification` API and its click actions do not work on macOS 26. OpenCodeNotifier uses `UNUserNotificationCenter` and is vendored in this repo (~200 lines Swift, built by setup) — no external binary gets notification or shell-exec permissions.
- `code <folder>` is the official CLI behavior: it focuses the existing window that has the folder open (and opens one if none exists). This is the permission-free window-targeting step.
- The keystroke step is guarded: it only runs when VS Code is frontmost, and it is skipped when the window title already shows the opencode terminal (meaning the terminal editor tab is already active). This guarantees the typed type-ahead text never lands inside the TUI prompt input.
- The session inside the TUI is not externally targetable on OpenCode 1.18.29 (no session-select route on the server, no tab keybinds in this TUI version), so the click handler focuses the right terminal and lets the TUI land you on the session — deterministic when you run one terminal per session, and the notification subtitle tells you which session it was.
- `focus-opencode` always exits 0; a missing Accessibility grant degrades to "window focus only" with a one-line stderr hint.

### macOS permissions (one-time)

- **Notifications → OpenCodeNotifier**: allow when the first prompt appears (or System Settings → Notifications → OpenCodeNotifier). Until granted, banners are dropped silently while the rest of the pipeline keeps working.
- **Accessibility / Automation**: the first banner click runs keystrokes via System Events; macOS will prompt to allow OpenCodeNotifier to control System Events / VS Code. Grant it. Without it, clicking still focuses the correct VS Code **window** (the `code <dir>` step needs no permissions) — the terminal-tab pick is skipped with a stderr hint.
- Notification Center settings (Focus/Do Not Disturb, banner style) affect visibility as with any app.

## OpenCode providers

Every OpenCode provider whose API key exists in the secret store is wired into the global OpenCode config so `opencode /models` lists the connected models. This is the first concrete use of the secret-store integration (see [Secret integration](#secret-integration)).

- **Catalog:** `packages/workstation/opencode/provider-secrets.ts` — a declarative list mapping each OpenCode provider id to its Vault key, expressed as `@pkgs/secret-store`'s `SecretStoreEntry` (key + required + validation + documentation).
- **Generator:** `packages/workstation/opencode/configure-providers.ts` — reads `secret/data/personal/{config}` (default `prd`, overridable via `VAULT_*` env or `.vault.yaml`), validates each value through its `SecretStoreEntry`, and writes `~/.config/opencode/opencode.json` with `provider.<id>.options.apiKey` set inline. Custom/local providers (Ollama, LM Studio) also get `npm` + `baseURL` + `models`.
- **Delivery:** keys are embedded in the generated config, written **0600** into `$HOME`, never committed. The config is merged with any existing `opencode.json` (your other settings are preserved) and is only overwritten if it parses as JSON — a malformed/foreign config is refused rather than clobbered.
- **Non-destructive:** providers with a missing or invalid key are **skipped** (not dropped) and reported with the entry's documentation so you know how to add/rotate the key. A missing key never aborts the run; an unavailable Vault is a warning (use `--strict` to make it fatal).
- **Vault path:** the full catalog lives at `secret/data/personal/prd` (verified; the UI URL `/ui/vault/secrets/secret/show/secret` is a different entry that only holds `OPENAI_API_KEY` + `OPENROUTER_API_KEY`). Add keys there then re-run.

### How the keys get in

```bash
vault login -method=userpass username=crvouga     # once (or export VAULT_TOKEN)
bun run workstation:setup                          # runs the config step best-effort
bun run --filter @pkgs/workstation configure:opencode   # or run it directly
```

The config step is also invoked (best-effort, never fails setup) at the end of `workstation:setup`.

### Adding or debugging a provider

`SecretStoreEntry` carries documentation fields — `description`, `obtainUrl` (link to create/rotate a key), `docsUrl`, `vaultUiPath`, `validExample`, and `invalidHint` — that the generator prints for skipped providers. To add a provider, append an entry to `provider-secrets.ts` (a `SecretStoreEntry` plus optional `npm`/`baseURL`/`models`), add the key in Vault, and re-run.

## Testing

- **Symlink setup:**
  ```bash
  bun run workstation:setup
  ls -la ~/.config/opencode/plugins/ ~/.config/opencode/bin/
  ```
- **Idempotent setup:** run `bun run workstation:setup` twice — the second run reports `[unchanged]` for links and the app.
- **Notifier daemon (no OpenCode needed):**
  ```bash
  ~/.config/opencode/bin/opencode-notifier --post '{"kind":"finished","title":"OpenCode","message":"Session finished","subtitle":"infra","sessionID":"ses_test","directory":"'"$PWD"'"}'
  pgrep -fl OpenCodeNotifier       # daemon running
  ls ~/.cache/opencode-notifier.sock
  ```
  A banner should appear (after notifications are allowed); clicking it should focus the right VS Code window and terminal tab.
- **Focus script directly:**
  ```bash
  ~/.config/opencode/bin/focus-opencode --kind finished --session ses_test --dir /path/to/project
  ```
- **End-to-end:** start an OpenCode session in another window, let it finish → `Session finished` banner (subtitle = session title) → click → VS Code focuses on that project's window and the opencode terminal tab.
- **Fallbacks:** with the daemon killed (`pkill -f OpenCodeNotifier.*daemon`), the plugin posts plain `osascript` notifications instead.
- **Conflict safety:**
  ```bash
  mkdir -p ~/.config/opencode/plugins
  echo not-managed > ~/.config/opencode/plugins/notifications.ts
  bun run workstation:setup          # must FAIL, must not overwrite
  rm ~/.config/opencode/plugins/notifications.ts
  bun run workstation:setup          # succeeds again
  ```
- **Type check:** `bun run typecheck` (also runs in the Deploy fleet CI) covers `packages/workstation/**/*.ts`.
- **Provider config:**
  ```bash
  bun run --filter @pkgs/workstation configure:opencode
  ls -l ~/.config/opencode/opencode.json            # -rw------- (0600)
  jq '.provider | keys | length' ~/.config/opencode/opencode.json   # number connected
  opencode debug config                             # resolved providers listed
  ```
  Re-running is idempotent and only adds providers that have a valid key.

## Adding another workstation-managed tool

Keep the convention simple — no generic provider/plugin interface:

1. Create a clearly named directory under `packages/workstation/` for the tool.
2. Store only portable source configuration there.
3. Extend `packages/workstation/setup.ts` to link/install it (add a `ManagedLink`, or a build step for compiled artifacts).
4. Reuse existing workspace packages when useful.
5. Update this README (structure, setup effects, managed config).
6. Never commit secrets or generated state.

Target macOS when the tool needs platform-specific behavior; don't build an OS abstraction.

## Secret integration

Secrets belong in the existing secret-store subsystem (Vault KV at `secret/data/personal/{dev|prd}`, client in `lib/vault-kv.ts`, and `vault run` for fleet ops). Workstation tooling will consume that store later — for example, bootstrapping tools with API keys pulled from Vault.

Ground rules:

- secrets are **never** committed here
- workstation **reuses** the existing secret-store client — it does not create a separate secret system
- do not introduce plaintext `.env` files as the long-term distribution mechanism
- when secret integration is added, prefer runtime env injection, then OS-native keychain storage, then tool-specific credential files with restrictive permissions

The OpenCode **notification plugin** needs no secrets and must stay that way. The OpenCode **provider config** is the one piece that reads from the secret store; it writes keys to a tool-specific credential file (`~/.config/opencode/opencode.json`) with restrictive (0600) permissions — the lowest-priority, last-resort option — because OpenCode's global config cannot source secrets purely from env without a wrapper. See [OpenCode providers](#opencode-providers).

## Agent/LLM context

This README is the canonical high-level architectural context for `packages/workstation/`. It is kept concise enough to load on every relevant task, and complete enough to avoid needing prior conversation history.

- `packages/workstation/AGENTS.md` is the short agent directive for this area.
- Root-level conventions and the other subsystems are documented in the repository root `AGENTS.md` and `README.md` — read those before inventing new mechanisms.
