# Workstation

Portable local-machine and developer-environment configuration, managed as one subsystem of the `workspace` monorepo — fronted by the **`ws` CLI**.

This is the canonical, high-level architectural context for `packages/workstation/`. A fresh agent (or human) can start here without prior conversation history.

## Purpose

`packages/workstation/` is the source of truth for machine configuration that is useful across machines — things like editor/agent configuration, shell and Git settings, CLI tool config, and local service setup. It holds **portable source configuration**, not machine-specific state.

The current practice: keep configuration in this monorepo, converge the home directory to the checked-in source with `ws sync` (symlinks + generated files), and let every machine match the repo. Checked-in files should make it obvious which filesystem location each one maps to.

## Why it lives in the monorepo

Keeping workstation configuration inside `workspace` means it can reuse what already exists here:

- shared packages and `lib/` TypeScript helpers
- the shared TypeScript / Bun / task conventions
- the same task tooling (`bun run <script>`)
- the existing self-hosted secret store (Vault) and its client (`lib/vault-kv.ts`)
- the same source control and CI conventions as the rest of the workspace

There is no separate dotfiles repository and no separate secret system.

## The `ws` CLI (only entry point)

`ws` is a full-blown CLI installed on the machine. No args opens the interactive dashboard (searchable menu); subcommands are scriptable and LLM-friendly.

```bash
bun run ws:install   # repo bootstrap: installs deps + global `ws` launcher + converges
ws                   # interactive dashboard (status, sync, opencode, notifications, doctor, …)
ws status            # human-readable state
ws status --json     # machine-readable state (LLM-friendly, secrets redacted)
ws sync              # converge home directory to the checked-in spec
ws doctor [--fix]    # checks with actionable fixes
```

Global flags: `--json` (parseable output, never prints secret values), `--yes` (skip confirmations), `--non-interactive` (fail instead of prompting). Exit codes: `0` ok, `1` error, `2` refusal/conflict.

Commands are namespaced by **domain** — every leaf states its domain in `--help` (`[ws]`, `[opencode]`, `[openrouter]`):

| Command                                                                      | Purpose                                                          |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `ws status`                                                                  | ws version, launcher, links, notifier, providers, model, Vault   |
| `ws sync`                                                                    | links + sounds + notifier build + providers (best-effort Vault)  |
| `ws doctor [--fix]`                                                          | pass/warn/fail checks with fixes                                 |
| `ws opencode status\|sync\|set-model\|reset-model\|disable\|list`            | OpenCode config management (set-model picks build + plan models) |
| `ws opencode providers list\|sync`                                           | Vault-backed provider status + sync                              |
| `ws opencode backup\|backups\|reset`                                         | timestamped backup, list, reset config                           |
| `ws opencode notifications status\|enable\|disable\|test`                    | notification plugin toggles                                      |
| `ws opencode notifications focus\|focus-request\|tag`                        | click-to-focus manual tests (tab, session, tagging)              |
| `ws opencode notifications sounds list\|status\|set\|play\|configure\|reset` | per-event notification sounds (preview + interactive configure)  |
| `ws openrouter status\|models`                                               | OpenRouter key state + live model catalog used by `set-model`    |
| `ws install\|uninstall\|update`                                              | global launcher lifecycle                                        |
| `ws vault`                                                                   | resolved Vault coordinates                                       |

The old flat names (`ws providers`, `ws notifications`, `ws sounds`, `ws backup|backups|reset`) remain as hidden deprecated aliases that forward to their `ws opencode …` path with a warning.

### Installation

`bun run ws:install` (replaces the old `workspace:setup` / `ws:setup`) installs dependencies, writes/overwrites the global launcher (`~/.local/bin/ws` on macOS/Linux, `ws.cmd` on Windows — a shim that execs the checked-in CLI via bun, so `ws` always runs the latest repo source), then converges. Re-running updates the launcher in place. If `~/.local/bin` is not on `PATH`, it prints the export line (or appends it with `--yes`).

`packages/workstation/setup.ts` is a deprecated shim that forwards to the installer.

### Platform design

All OS-specific behavior lives behind the `Platform` interface (`cli/lib/platform/`): `DarwinPlatform`, `LinuxPlatform`, `WindowsPlatform`, `FallbackPlatform`, selected by the `getPlatform()` factory. Commands never branch on `process.platform` directly.

- **macOS**: full stack — Swift `OpenCodeNotifier` app (click-to-focus, sounds), osascript fallback.
- **Linux**: `notify-send` / `zenity` fallback (no sounds, no click-to-focus); symlinks + provider sync fully work.
- **Windows**: PowerShell toast / `msg` fallback (no sounds, no click-to-focus); launcher is `ws.cmd`.

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
- secret storage (that is the existing Vault subsystem)
- management of every application
- a general-purpose dotfiles framework
- infrastructure/code for hypothetical future tools

## Structure

```
packages/workstation/
├── README.md                          # this file — canonical context
├── AGENTS.md                          # short agent instructions → points here
├── package.json                       # workspace pkg (bin: ws) + deps + scripts
├── setup.ts                           # deprecated shim → cli/install-global.ts
├── cli/
│   ├── bin.mjs                        # package binary (bun → tsx fallback)
│   ├── index.ts                       # `ws` entry: interactive dashboard + subcommands
│   ├── install-global.ts              # `bun run ws:install` implementation
│   ├── menu.ts                        # searchable menu (always sorted, exit pinned last)
│   ├── commands/
│   │   ├── status.ts                  # state gathering (human + JSON)
│   │   ├── sync.ts                    # converge (links + sounds + notifier + providers)
│   │   ├── sounds-cmds.ts             # notification sounds (list/set/play/configure/reset)
│   │   └── openrouter-cmds.ts         # OpenRouter key state + model catalog
│   └── lib/
│       ├── platform/                  # Platform interface + darwin/linux/windows/fallback adapters
│       ├── paths.ts                   # workstationRoot / version
│       ├── theme.ts / output.ts       # chalk palette + human/JSON output + ora spinners
│       ├── prompt.ts                  # @inquirer/prompts wrappers (+ --non-interactive guard)
│       ├── links.ts                   # managed symlinks (idempotent + conflict-safe)
│       ├── notifier-build.ts          # sound config writer + Swift notifier build
│       ├── sounds.ts                  # sound map read/merge/write (user overrides survive sync)
│       ├── tui-config.ts              # tui.json merge (registers focus-session plugin)
│       ├── focus.ts                   # focus-opencode runner + terminal tagging (manual tests)
│       ├── opencode-config.ts         # opencode.json read/merge/write (0600)
│       ├── providers-sync.ts          # Vault → opencode.json sync (shared logic)
│       ├── global-install.ts          # global launcher install + PATH helpers
│       ├── vault-config.ts            # Vault coordinates (env > .vault.yaml > defaults)
│       ├── doctor.ts                  # checks + summary
│       └── backup.ts                  # timestamped backups
└── opencode/
    ├── plugins/
    │   └── notifications.ts           # global OpenCode notification plugin (source of truth)
    ├── tui/
    │   └── focus-session.ts           # TUI plugin: routes banner clicks to the session (source of truth)
    ├── focus-request.ts               # shared click-to-focus protocol (tab queries + session routing)
    ├── provider-secrets.ts            # OpenCode provider → Vault key catalog (SecretStoreEntry + docs)
    ├── configure-providers.ts         # thin wrapper over providers-sync (configure:opencode script)
    ├── sounds.ts                      # central notification sound map (single source of truth)
    ├── bin/
    │   ├── opencode-notifier          # CLI shim → OpenCodeNotifier.app (source of truth)
    │   └── focus-opencode             # notification click handler (source of truth)
    └── notifier/
        └── OpenCodeNotifier.swift     # UNUserNotificationCenter accessory app (source of truth)
```

Checked-in → home-directory mapping (installed by `ws sync`):

| Checked-in (repo)                                               | Home directory                                                                                  |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `packages/workstation/opencode/plugins/notifications.ts`        | `~/.config/opencode/plugins/notifications.ts` (symlink)                                         |
| `packages/workstation/opencode/tui/focus-session.ts`            | registered in `~/.config/opencode/tui.json` `plugin` (merged by `ws sync`, never overwritten)   |
| `packages/workstation/opencode/bin/opencode-notifier`           | `~/.config/opencode/bin/opencode-notifier` (symlink)                                            |
| `packages/workstation/opencode/bin/focus-opencode`              | `~/.config/opencode/bin/focus-opencode` (symlink)                                               |
| `packages/workstation/opencode/notifier/OpenCodeNotifier.swift` | compiled to `~/.config/opencode/bin/OpenCodeNotifier.app` (generated artifact, never committed) |
| `packages/workstation/opencode/sounds.ts`                       | `~/.config/opencode/notifier-sounds.json` (generated runtime sound config, never committed)     |

## Setup

Install the `ws` CLI and converge workstation-managed configuration:

```bash
bun run ws:install
ws   # interactive dashboard
```

`ws sync` idempotently converges `~/.config/opencode` to the spec checked into this repo (plugin symlinks, notifier build, provider config). It is safe to run repeatedly:

- derives the `packages/workstation/` root from the CLI location (works from any current working directory)
- creates missing parent directories under `$HOME`
- installs managed configuration as **symlinks** pointing into the repository
- an existing, correct symlink is treated as success (no-op)
- compiles `OpenCodeNotifier.swift` into `~/.config/opencode/bin/OpenCodeNotifier.app` with `swiftc` on macOS (ad-hoc codesigned, `LSUIElement` — no Dock icon); rebuilds only when the source hash changes; skips with a warning when `swiftc` is missing or on other platforms (notifications fall back per platform)
- writes `~/.config/opencode/notifier-sounds.json` on every run — merge-preserving, so a user's `sounds set` choice survives `ws sync` (missing kinds are filled from the checked-in `opencode/sounds.ts` defaults) — and restarts the notifier daemon when the app was rebuilt
- ensures `~/.config/opencode/tui.json` registers the `focus-session` TUI plugin (merges into the existing `plugin` array — theme, keybinds, and other plugins are preserved; refuses to touch malformed JSON)
- syncs `~/.config/opencode/opencode.json` from the secret store (best-effort — see [OpenCode providers](#opencode-providers))
- refuses to overwrite anything not managed by this repository and exits with an actionable error message on conflict
- never requires `sudo` and never touches configuration outside `$HOME` (plus the global launcher dir)

What it changes in `$HOME` today:

- creates `~/.config/opencode/plugins/` and `~/.config/opencode/bin/` if needed
- links the plugin and CLI scripts (see table above)
- builds `OpenCodeNotifier.app` and writes `~/.config/opencode/bin/.opencode-notifier.hash`
- writes `~/.config/opencode/notifier-sounds.json` (the runtime sound map, from `opencode/sounds.ts`)
- writes/merges `~/.config/opencode/tui.json` (registers the `focus-session` TUI plugin)
- writes `~/.config/opencode/opencode.json` (0600) with provider connections sourced from Vault
- installs `~/.local/bin/ws` (the global launcher)

## OpenCode

OpenCode loads global plugins from `~/.config/opencode/plugins/` automatically. The notification plugin (`notifications.ts`) detects attention events and posts notifications through the OpenCodeNotifier daemon; if the notifier is unavailable or fails, it falls back to a plain `osascript` notification (no click actions). Notification problems can never fail an OpenCode session — every step is best-effort and non-critical.

- **Checked-in plugin path:** `packages/workstation/opencode/plugins/notifications.ts`
- **Resulting global plugin path:** `~/.config/opencode/plugins/notifications.ts` (a symlink)
- **Toggle:** `ws opencode notifications enable|disable|status|test`
- **Events that generate notifications:**

  | Event                             | Notification                        | Sound                  |
  | --------------------------------- | ----------------------------------- | ---------------------- |
  | `session.idle`                    | `OpenCode` / `Session finished`     | `Purr` (soft, warm)    |
  | `session.error`                   | `OpenCode` / `Session error`        | `Bottle` (gentle bell) |
  | `permission.asked`                | `OpenCode` / `Permission required`  | `Ping` (soft ping)     |
  | agent invokes the `question` tool | `OpenCode` / `Agent has a question` | `Pop` (subtle tap)     |

- **Sound design:** each attention kind maps to a macOS system sound, kept deliberately calm, neutral, happy and low-key. The checked-in defaults live in `packages/workstation/opencode/sounds.ts` (`NOTIFIER_SOUNDS`); the runtime map is `~/.config/opencode/notifier-sounds.json`, which **both** the notifier daemon and the plugin fallback read at notification time — so a running daemon picks up a change without a rebuild. Sounds are first-class config under `ws opencode notifications sounds`: `list`/`status` shows per-kind sounds alongside the available system sounds (scanned from `/System/Library/Sounds`, `/Library/Sounds`, `~/Library/Sounds`), `set <kind> <sound>` overrides one kind (warns when the name is unknown), `play <kind|sound>` previews through `afplay`, `configure` walks kind → sound with a preview before saving (scriptable as `configure --kind finished --sound Purr [--play]`), and `reset` restores defaults. `ws sync` never wipes an override — it only fills in missing kinds. Sounds are played via `NSSound` (fire-and-forget) and the notification banner itself is kept silent, so the sound and banner never double up and never conflict with the system notification sound. On Linux/Windows sounds are unsupported (`notify-send` / toast have no sound API) — `list` says so and `play` fails with that reason instead of pretending.

- **Question detection:** the built-in `question` tool (`tool.execute.before` hook with `tool === "question"`). A question waits for user input but is not necessarily a permission request, so it is detected from the tool invocation itself. When a `permission.asked` event follows for the `question` permission, the plugin suppresses the redundant "Permission required" notification — one question produces exactly one useful notification.
- **Payload:** each notification carries `{kind, title, message, subtitle, sessionID, directory, sessionTitle, token}` — `subtitle` is the session title (best-effort SDK lookup, 500ms timeout) so you can eyeball which session it was, and `token` is the short per-session tab token (see below). Notifications use the sessionID as identifier/thread, so a new event for the same session **replaces** the previous banner instead of stacking.

### Click-to-focus architecture

```
session.idle / session.error / permission.asked / question tool
        │
        ▼
notifications.ts ──tags terminal title with session token (OSC, /dev/tty)
        │
        └──spawn──▶ ~/.config/opencode/bin/opencode-notifier --post <json>
                               │
                               ▼  unix socket ~/.cache/opencode-notifier.sock
                      OpenCodeNotifier.app (daemon, accessory app, UNUserNotificationCenter)
                               │  posts native banner
                               ▼
                      user clicks the banner
                               │
                               ▼
                     daemon runs ~/.config/opencode/bin/focus-opencode
                        --kind K --session S --dir D --title T --token N
                                       │
                     1. writes ~/.cache/opencode-focus-request.json {sessionID, timestamp}
                        → the focus-session TUI plugin in the OWNING opencode TUI
                           navigates to it via route.navigate("session", …)
                     2. `code -r <dir>` → focuses (or opens) the VS Code window
                                       │    for that project — no permissions needed
                     3. Poll (not sleep) until VS Code is frontmost
                     4. System Events keystrokes (one-time Accessibility grant):
                        Cmd+P → type session token → Enter (editor-area terminal)
                        Cmd+P → type "term <token>" → Enter (panel terminal)
                        → focuses the exact terminal tab running that session
                                       │
                     Done — the TUI shows the session that needs attention
```

Why this shape:

- `terminal-notifier` is **not** used: it depends on the deprecated `NSUserNotification` API and its click actions do not work on macOS 26. OpenCodeNotifier uses `UNUserNotificationCenter` and is vendored in this repo (~200 lines Swift, built by sync) — no external binary gets notification or shell-exec permissions.
- `code -r <folder>` is the official CLI behavior: it focuses the existing window that has the folder open (and opens one if none exists). This is the permission-free window-targeting step. `-r` reuses the window instead of opening a duplicate.
- **Per-session token, not fuzzy title:** every notification first tags its controlling terminal's title with a short token derived from the session id (`opencode <token> · <session title>`, via an OSC sequence on `/dev/tty`). The opencode TUI never sets terminal titles, so the tag sticks. The click handler then matches the tab by that exact token instead of guessing from the session title — the session id is unique, so the pick can never land on the wrong tab. `token` travels in the notification payload; banners posted before tagging fall back to title matching.
- **Quick Open (`Cmd+P`), not `Ctrl+Tab`:** the tab pick is `Cmd+P → type token → Enter`, a workbench-level shortcut that opens even when focus sits inside the opencode TUI terminal. The old `Ctrl+Tab` editor picker only lists editor tabs and can be swallowed by the terminal — opencode usually runs in a **panel** terminal, which never matched, so clicks focused the window but never the tab. Panel terminals are picked with a second pass, `Cmd+P → type "term <token>"` — the `term ` prefix is Quick Open's terminal list; plain queries only match editors. The editor pass is verified against the window title (which shows the active editor); the panel pass is fire-and-forget since panel terminals never appear there.
- **No fixed sleeps on the focus path:** `code` returns before the window is frontmost, so the script polls for VS Code being frontmost (up to ~4s) instead of `sleep 0.4` — typing into the picker too early (or aborting because Code wasn't front yet) was the main focus flake.
- The keystroke step is guarded: it only runs when VS Code is frontmost, and it is skipped when the window title already contains the token (meaning the tagged terminal is already the active editor). The Quick Open overlay takes keyboard focus, so the typed query never lands inside the TUI prompt input.
- **Session switching without keystrokes:** typing a session id into a waiting TUI (permission/question prompt) would corrupt user input, so the click handler never types into the terminal. Instead it writes a focus request (`~/.cache/opencode-focus-request.json`, `{sessionID, timestamp}`); the `focus-session` TUI plugin (registered in `tui.json` by `ws sync`, polling every ~750ms) navigates the owning TUI via the official `route.navigate("session", {sessionID})` API. Ownership is self-routing — every TUI sees the file but only the one holding that session acts — and requests expire after 60s so a stale file can never yank a TUI on startup. The shared protocol lives in `opencode/focus-request.ts` so the routing decision is unit-tested.
- `focus-opencode` always exits 0; a missing Accessibility grant degrades to "window focus only" with a one-line stderr hint.

### macOS permissions (one-time)

- **Notifications → OpenCodeNotifier**: allow when the first prompt appears (or System Settings → Notifications → OpenCodeNotifier). Until granted, banners are dropped silently while the rest of the pipeline keeps working.
- **Accessibility / Automation**: the first banner click runs keystrokes via System Events; macOS will prompt to allow OpenCodeNotifier to control System Events / VS Code. Grant it. Without it, clicking still focuses the correct VS Code **window** (the `code <dir>` step needs no permissions) — the terminal-tab pick is skipped with a stderr hint.
- Notification Center settings (Focus/Do Not Disturb, banner style) affect visibility as with any app.

## OpenCode providers

Every OpenCode provider whose API key exists in the secret store is wired into the global OpenCode config so `opencode /models` lists the connected models. This is the first concrete use of the secret-store integration (see [Secret integration](#secret-integration)).

- **Catalog:** `packages/workstation/opencode/provider-secrets.ts` — a declarative list mapping each OpenCode provider id to its Vault key, expressed as `@pkgs/secret-store`'s `SecretStoreEntry` (key + required + validation + documentation). Each entry carries a `transform` (trims the value) and a `validate` (format/prefix check) so a malformed key is reported as `invalid` with the entry's docs rather than silently wired.
- **Sync logic:** `packages/workstation/cli/lib/providers-sync.ts` — reads `secret/data/personal/{config}` (default `prd`, overridable via `VAULT_*` env or `.vault.yaml`), validates each value through its `SecretStoreEntry`, and writes `~/.config/opencode/opencode.json` with `provider.<id>.options.apiKey` set inline. Shared by `ws opencode sync`, `ws sync`, and `opencode/configure-providers.ts`. Custom/local providers (Ollama, LM Studio) also get `npm` + `baseURL` + `models`.
- **Delivery:** keys are embedded in the generated config, written **0600** into `$HOME`, never committed. The config is merged with any existing `opencode.json` (your other settings are preserved) and is only overwritten if it parses as JSON — a malformed/foreign config is refused rather than clobbered.
- **Non-destructive:** providers with a missing or invalid key are **skipped** (not dropped) and reported with the entry's documentation so you know how to add/rotate the key. A missing key never aborts the run; an unavailable Vault is a warning (use `--strict` to make it fatal).
- **Model control:** `ws opencode set-model` opens a searchable model picker for the `build_model` slot (code + edits) and the `plan_model` slot (planning + research), sourced from the live OpenRouter catalog (cached 24h in `~/.cache/ws-models.json`, `--refresh-models` to refresh) with an offline fallback. Refs resolve to the directly connected provider when available, else route via `openrouter/<id>`. Scripted use: `ws opencode set-model --build-model <ref> --plan-model <ref>`. `ws opencode reset-model` clears the explicit `model`/`small_model` choice; `ws opencode disable <provider>` removes a provider from the config (keys stay in Vault; re-enable with `ws opencode sync`).
- **Menu height:** searchable menus and pickers show 10 rows (`MENU_PAGE_SIZE`) so prior output stays visible without scrolling.
- **Vault path:** the full catalog lives at `secret/data/personal/prd` (verified; the UI URL `/ui/vault/secrets/secret/show/secret` is a different entry that only holds `OPENAI_API_KEY` + `OPENROUTER_API_KEY`). Add keys there then re-run.

### How the keys get in

```bash
vault login -method=userpass username=crvouga     # once (or export VAULT_TOKEN)
ws opencode sync                                 # or: ws sync (runs it best-effort)
```

### Adding or debugging a provider

`SecretStoreEntry` carries documentation fields — `description`, `obtainUrl` (link to create/rotate a key), `docsUrl`, `vaultUiPath`, `validExample`, and `invalidHint` — that the sync prints for skipped providers, plus `transform` (normalizes the value, e.g. trimming) and `validate` (format/prefix check) for the smoke check. To add a provider, append an entry to `provider-secrets.ts` (a `SecretStoreEntry` plus optional `npm`/`baseURL`/`models`, and a `validate` if the key has a recognizable format), add the key in Vault, and re-run. `ws opencode providers list [--json]` shows Vault-backed status for every catalogued provider without writing anything.

### The `openrouter` domain

`ws openrouter` owns the OpenRouter side of the model pipeline — the live catalog that `ws opencode set-model` picks from — without touching `opencode.json`:

- `ws openrouter status` — OpenRouter key state (from Vault) + catalog source (`live` / `cache` / `cache-stale` / `curated`) and cache path.
- `ws openrouter models [--refresh] [--query <q>] [--limit <n>]` — browse the same catalog the picker uses (cached 24h in `~/.cache/ws-models.json`).

### Default model: OpenRouter Auto

When the `openrouter` provider has a valid key, the generated config registers the **OpenRouter Auto Router** (`openrouter/auto`) and sets it as the default `model` and `small_model`, so every OpenCode task routes through the Auto Router (`openrouter/openrouter/auto`). The Auto Router classifies each prompt into a task type and routes to the model the OpenRouter community actually spends on for that task — no model choice or OpenRouter web UI setting is ever needed.

The Auto Router configuration is owned by the `@pkgs/openrouter` package (`packages/openrouter/`):

- `AUTO_ROUTER_MODEL_ID` / `AUTO_ROUTER_MODEL_REFERENCE` — the model slug and the OpenCode `provider/model-id` reference.
- `autoRouterPlugin()` / `autoRouterRequest()` — the per-request `auto-router` plugin payload (cost tier + optional allowed/excluded models).
- `autoRouterModel()` — the OpenCode provider model entry (registered under `provider.openrouter.models["openrouter/auto"]`), whose `request.body` carries the Auto Router settings per-request so nothing is configured in the OpenRouter UI.
- `DEFAULT_AUTO_ROUTER_COST_TIER` (`high`) — the cost band the router routes within; override via `autoRouterModel({ costTier })` / `autoRouterPlugin({ costTier })` if the account is credit-constrained.

The `provider-secrets.ts` openrouter entry attaches `models: { "openrouter/auto": autoRouterModel() }`, and the sync sets `model`/`small_model` to the Auto Router reference only when they are unset (an existing explicit model choice is preserved).

## Testing

- **CLI (JSON + human):**
  ```bash
  ws status --json | jq .
  ws doctor
  ws opencode status
  ws opencode providers list
  ws opencode notifications test --kind finished
  ws opencode notifications sounds list
  ws opencode notifications sounds play finished
  ws openrouter status
  ws openrouter models --query claude --limit 10
  ```
- **Unit tests:** `bun run --filter @pkgs/workstation test` covers token derivation, sound map merge/set/reset, focus-request routing (freshness/TTL/ownership), tui.json merge, the focus runner + terminal tagging, the `--dry-run` focus plan, provider catalog validation, platform detection, links, opencode-config merge logic, global installer helpers, and doctor summary.
- **Idempotent sync:** run `ws sync` twice — the second run reports `[unchanged]` for links and the notifier.
- **Notifier daemon (no OpenCode needed):**
  ```bash
  ~/.config/opencode/bin/opencode-notifier --post '{"kind":"finished","title":"OpenCode","message":"Session finished","subtitle":"infra","sessionID":"ses_test","directory":"'"$PWD"'"}'
  pgrep -fl OpenCodeNotifier       # daemon running
  ls ~/.cache/opencode-notifier.sock
  ```
  A banner should appear (after notifications are allowed); clicking it should focus the right VS Code window and terminal tab.
- **Focus script directly (no banner needed):**
  ```bash
  ws opencode notifications focus --dir /path/to/project --session ses_test --dry-run
  ws opencode notifications focus --dir /path/to/project --session ses_test --token est1234
  ```
  The dry run prints the window/tab/session plan (Quick Open queries + focus-request payload) without touching anything; the real run executes the exact handler a banner click would.
- **Session routing directly (no banner needed):**
  ```bash
  ws opencode notifications focus-request --session ses_test   # owning TUI navigates there
  ws opencode notifications focus-request --read               # inspect freshness
  ```
- **Terminal tagging:** trigger any notification (e.g. let a session finish) and check the opencode terminal tab title reads `opencode <token> · <session title>` — the click handler matches on `<token>`. Or tag on demand from any terminal and watch the title change:
  ```bash
  ws opencode notifications tag --session ses_f8544b407ffeHmm0Sb9AtQbt0N --title "Fix login bug"
  ```
- **End-to-end:** start an OpenCode session in another window, let it finish → `Session finished` banner (subtitle = session title) → click → VS Code focuses on that project's window, the terminal tab running that session, and the TUI switches to that session.
- **Fallbacks:** with the daemon killed (`pkill -f OpenCodeNotifier.*daemon`), the plugin posts plain `osascript` notifications instead.
- **Conflict safety:**
  ```bash
  mkdir -p ~/.config/opencode/plugins
  echo not-managed > ~/.config/opencode/plugins/notifications.ts
  ws sync                            # must FAIL, must not overwrite
  rm ~/.config/opencode/plugins/notifications.ts
  ws sync                            # succeeds again
  ```
- **Type check:** `bun run typecheck` (also runs in the Deploy fleet CI) covers `packages/workstation/**/*.ts`.
- **Provider config:**
  ```bash
  ws opencode sync
  ls -l ~/.config/opencode/opencode.json            # -rw------- (0600)
  jq '.provider | keys | length' ~/.config/opencode/opencode.json   # number connected
  opencode debug config                             # resolved providers listed
  ```
  Re-running is idempotent and only adds providers that have a valid key.

## Adding another workstation-managed tool

Keep the convention simple — no generic provider/plugin interface:

1. Create a clearly named directory under `packages/workstation/` for the tool.
2. Store only portable source configuration there.
3. Extend the converge flow (`cli/commands/sync.ts` + `cli/lib/`) to link/install it (add a `ManagedLink`, or a build step for compiled artifacts) and surface it in the `ws` dashboard/commands.
4. Reuse existing workspace packages when useful.
5. Update this README (structure, setup effects, managed config).
6. Never commit secrets or generated state.

Target macOS for the full experience, but keep commands platform-agnostic behind the `Platform` interface; don't build an OS abstraction beyond it.

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
- Every `ws` subcommand supports `--json` (secrets redacted, stable shapes) plus `--yes` / `--non-interactive` and documented exit codes, so agents can drive the workstation without a TTY.
