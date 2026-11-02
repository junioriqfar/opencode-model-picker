# opencode-model-picker

<p align="center">
  <a href="./README.md">🇬🇧 English</a> | <a href="./README.id.md">🇮🇩 Indonesia</a>
</p>

Fetch models from any OpenAI-compatible provider (e.g. 9Router), check their accessibility, rank them by coding capability, then save to your OpenCode configuration.

Cross-platform: macOS, Windows, Linux.

## Installation

```bash
cd opencode-model-picker
npm install
```

## Usage

```bash
npm start
# or
node src/cli.js
```

## Testing

```bash
npm test
```

Uses the built-in `node:test` runner (no extra dependencies). Covers the JSONC parser (comments/trailing commas), OpenCode config path resolution, backup/atomic write, endpoint selection (`chat`/`messages`/`responses`), the `x-opencode-session` header for OpenCode Go/Zen, `max_completion_tokens` fallback, model-block/npm generation, automatic machine-bound config encryption, legacy password migration, `auth.json` read/write/backup/import, and update-check semver/API handling.

## Build Executable (Windows, macOS, Linux)

Built with [@yao-pkg/pkg](https://github.com/yao-pkg/pkg) — produces a single executable file with no Node.js runtime required on the target machine.

```bash
npm run build         # build all (macOS x64, Windows x64, Linux x64)
npm run build:macos   # macOS x64 only
npm run build:win     # Windows x64 only (.exe)
npm run build:linux   # Linux x64 only
```

Output in `dist/`:

```
dist/
├── opencode-model-picker-macos-x64
├── opencode-model-picker-win-x64.exe
└── opencode-model-picker-linux-x64
```

arm64 notes:
- Building **macOS arm64 (Apple Silicon)** requires an Apple Silicon machine (or Rosetta installed) because pkg runs the target binary for verification: `npm run build:macos:arm64`.
- Intel (x64) machines can only produce x64 binaries for macOS/Windows/Linux.

## First Run

When no config file exists (`~/.config/opencode-model-picker/config.json` not found), the app shows a **first-run wizard** and prompts for all settings in order:
1. **Language** — `English` / `Indonesia`
2. **Default timeout** — 1–300 seconds
3. **Numbering style** — `01.` / `1.` / `001.` / `01 -` / `none`
4. **Sort order** — `Built-in score (coding)` / `Alphabetical (A-Z)`

All settings are saved immediately and applied to the current session. API keys are encrypted automatically.

## Workflow

1. **Initial action** — choose between *Use saved provider*, *Manage saved providers* (edit name/base URL/API key, import the key from `auth.json`, delete — bottom option is **Kembali** / **Back** in green), *Add new provider*, *Settings*, *Check for updates*, or *Exit*.
2. **Fetch models** — the app calls `GET {baseURL}/v1/models`. On failure, error is shown and you return to the main menu (app does not close).
3. **Select models** — after fetching, choose **Select all (X models)** to test every model, or **Custom** to pick specific models via multiselect (space to select, enter to continue). If no model is selected in Custom mode, you return to the main menu.
4. **Test access (optional)** — after selecting models, the app asks **Test each model access?** (`Yes` default / `No`). Choosing **No** skips all per-model requests and saves every selected model as-is (no dead/EOL filtering; endpoint/npm is inferred from the model name or base URL). Choosing **Yes** tests each model with a small request using the timeout from **Settings → Default timeout** (initially **15 seconds**, configurable 1–300 seconds, stored in settings). The right endpoint is chosen automatically: `/chat/completions` by default, `/messages` for Anthropic-compatible base URLs (`.../anthropic`) or OpenCode Go MiniMax/Qwen, and `/responses` for Go Grok/GPT-Luna/Muse Spark. If a chat request is rejected for using `max_tokens`, it retries once with `max_completion_tokens` (reasoning models). The spinner stays on a single line per model (`model-id ✓/✗ — short message`), sanitized to one line and truncated (handles OpenRouter `Provider returned error` wrapping by extracting inner message). Rate-limited requests are retried once automatically. A 500ms delay between models reduces burst rate-limiting.
5. **Recap** — shows `✓ X working  ✗ Y dead/EOL/not found  ! Z temporary (timeout/rate-limit)` and lists each dead/warn model on its own single line. If **0 working**, it shows `No working models...` and returns to the main menu instead of closing.
6. **Sorting** — working models are ordered according to **Settings → Sort order**: either by coding capability score (reasoning, tools, context, name heuristics) or alphabetically (A–Z). The list is shown as a single non-interactive block with numbers, no enter required:
   ```
   Initial ranking (auto score):
     1. nvidia/minimaxai/minimax-m3 (score 85)
     2. gemini/gemini-3-flash-preview (score 80)
   ```
7. **Manual edit** — optionally reorder via `Select model to move → Move to position (1-N)`. Current order is also shown as `1. id (score 85)` in one block.
8. **Display name** — choose auto short names (take the last segment of the ID) or enter them manually per model. Sequence numbers are auto-generated from position using the **Settings → Numbering style** (e.g. `01.`, `1.`, `001.`, `01 -`, or `none`).
9. **Preview** — name list + configuration block are shown for review before saving.
10. **Save** — follows OpenCode's own config resolution: picks the first existing file of `opencode.jsonc` → `opencode.json` → `config.json` inside `~/.config/opencode` (or `$OPENCODE_CONFIG_DIR` when set), defaulting to `opencode.jsonc`. With **Settings → Credential storage = auth.json**, the API key is written to `~/.local/share/opencode/auth.json` (mode `0600`) and `opencode.json` keeps only `baseURL`; with `opencode.json`, the key is written inline as before. A `.bak` backup is written before saving either file; other configuration is preserved, but JSONC comments and original formatting are not. If the provider name **already exists**, the app warns that all existing models for that provider will be deleted and replaced with the current list.
11. **Repeat** — after save/cancel, the app asks **Do you want to run again?** (`If yes, you will return to the main menu.`). If **Yes**, it loops back to *Initial action*; if **No** (or Enter), it exits.

## Settings

Available from the main menu → **Settings** (Back button is green by design):

- **Language** — switch between `English` and `Indonesia`. All prompts, messages, and errors follow the selected language.
- **Default timeout** — per-model timeout in seconds (1–300) used during testing. No per-run prompt; change it in Settings.
- **Numbering style** — how model names are prefixed in OpenCode:
  - `01.` → `01. model`, `02. model` (padded 2 digits, default)
  - `1.` → `1. model`, `2. model`
  - `001.` → `001. model`, `002. model` (padded 3 digits)
  - `01 -` → `01 - model`, `02 - model`
  - `none` → `model` (no prefix)
- **Sort order** — how working models are ordered before saving: `Built-in score (coding)` (default) or `Alphabetical (A-Z)`. Manual reordering is still available after sorting.
- **Credential storage** — `opencode auth.json` (default) writes keys to `~/.local/share/opencode/auth.json` (mode `0600`); `opencode.json` writes `options.apiKey` inline.
- **Update check** — `On` by default. Checks GitHub Releases on every startup and shows a notice only when a newer version exists. Use **Check for updates** in the main menu for a manual check with status/error details.

Settings are stored in `~/.config/opencode-model-picker/config.json` alongside saved providers and support migration from older configs.

## Credential Security & Storage

- **App config encryption** — `providers[].apiKey` values in `~/.config/opencode-model-picker/config.json` are automatically stored as `enc:v1:` blobs (AES-256-GCM with a key derived from the current user/machine). No password is stored or prompted. Existing plaintext configs are encrypted automatically on startup.
- **What this protects** — it keeps tokens from being readable at a glance in the file, backups, or occasional sharing. It is obfuscation bound to the current machine/user, not protection against someone who already has access to that account. Copying the config to another machine makes the keys unreadable (re-enter them).
- **OpenCode storage is not encrypted** — OpenCode needs the plaintext key at runtime. `auth.json` is plain text with mode `0600`, and `opencode.json` inline keys are plain text too. Encryption protects the picker's own config only.
- **auth.json format** — entries use `{ "provider-id": { "type": "api", "key": "..." } }`. Other providers and OAuth entries are preserved; a `.bak` backup is created before each write. When saving with an existing non-API entry for the same provider, the app warns before replacing it.
- **Import** — when adding a provider, if the name matches an API entry in `auth.json`, the app offers to reuse that key. Existing saved providers can also import via *Manage saved providers → Import key from auth.json*.
- **OpenCode v2 note** — newer OpenCode builds migrate legacy `auth.json` credentials into their database once. If your build no longer reads `auth.json` directly, re-import/re-login through OpenCode after saving.
- **Upgrading from the master-password build** — if your config was created by that build, the app asks for that old password once at startup, migrates the keys to automatic machine-bound encryption, and never asks again.

## Update Check

- On every startup (unless disabled in Settings), the app queries the latest GitHub release at `https://github.com/junioriqfar/opencode-model-picker/releases/latest`.
- If a newer version exists, it shows the version and release URL — it never downloads or replaces files automatically.
- Manual **Check for updates** reports up-to-date, no-release, rate-limit, timeout, and network errors. Automatic checks stay silent on failure.

## Variants (OpenCode Go)

For an **OpenCode Go** base URL, the tool writes `reasoning: true` plus `limit` (context/output) for each model. OpenCode then generates model **variants** automatically (e.g. `low`, `medium`, `high` for `@ai-sdk/openai-compatible` / `@ai-sdk/openai`, or `high`, `max` for `@ai-sdk/anthropic`).

In OpenCode:
- Press **`ctrl+t`** (`variant_cycle`) to cycle variants.
- Or run the **`/variants`** command to open the *Select variant* dialog and pick one (including `Default`).
- The choice is saved per provider/model.

Limits/capabilities come from a snapshot of [models.dev](https://models.dev) (`opencode-go`). Regenerate with `npm run sync:models`. Unknown/new models fall back to `context: 131072`, `output: 8192`, `reasoning: true`.

## Project Structure

```
src/
├── cli.js        # interactive flow (@clack/prompts) + i18n + settings + outer loop (no auto-close) + single-line spinner
├── i18n.js       # translations (en/id) + numbering styles
├── provider.js   # GET /v1/models + endpoint selection (chat/messages/responses) + Go x-opencode-session + capability normalization + OpenRouter inner error extraction
├── go-models.js  # bundled OpenCode Go metadata snapshot (models.dev) for auto variants
├── scoring.js    # auto scoring for coding capability
├── config.js     # app config + settings + automatic machine-bound encryption
├── crypto.js     # AES-256-GCM + HKDF (legacy password migration helpers)
├── auth.js       # OpenCode auth.json read/write/backup/import
├── opencode.js   # safe merge into OpenCode config (numbering-aware) + Go variants + .bak backup + atomic write
├── update.js     # GitHub Releases update check + semver compare
├── version.js    # single source of truth for the app version
└── utils.js      # OpenCode-compatible paths, JSONC parser (comments + trailing commas), atomic write

scripts/
└── sync-go-models.mjs  # regenerate go-models.js from models.dev

test/
├── utils.test.js     # JSONC parser + config path resolution
├── provider.test.js  # endpoint selection, session header, error classification
├── opencode.test.js  # model block/npm + Go variants + backup/atomic write
├── config.test.js    # settings, atomic save, automatic encryption + legacy migration
├── crypto.test.js    # encryption round-trip, machine key, tamper detection
├── auth.test.js      # auth.json path/write/backup/import/rename
├── update.test.js    # semver compare + GitHub API handling
└── version.test.js   # VERSION matches package.json
```

## Notes

- App config (saved providers + settings) is stored at `~/.config/opencode-model-picker/config.json`; API keys are encrypted automatically with a machine-bound key.
- OpenCode config path follows OpenCode itself: `~/.config/opencode` on all platforms (Windows included, via XDG), or `$OPENCODE_CONFIG_DIR` when set. The tool reads JSONC with comments and trailing commas.
- A `.bak` backup is created next to the OpenCode config before every save, since the file is rewritten as plain JSON (comments/formatting are not preserved).
- For providers mixing protocols, the provider-level `npm` is set to the **majority** endpoint's package (`@ai-sdk/openai-compatible` / `@ai-sdk/anthropic` / `@ai-sdk/openai`) and the minority models get a per-model `provider.npm` override, so as little as possible depends on per-model overrides.
- When a provider omits `capabilities`, they are inferred from `architecture`/`supported_parameters` (OpenRouter/gateway style), so auto-scoring still has data to work with.
- OpenCode Go's `GET /v1/models` returns only ids, so reasoning/limit metadata for variants is bundled from models.dev (see `src/go-models.js`).
- Skipping the access test writes every selected model without verification — useful when the provider's `/v1/models` is authoritative (e.g. OpenCode Go). Endpoint/`npm` is then inferred (`guessApi`), not tested.
- Navigation: **ESC** returns to the previous prompt, **Ctrl+C** exits the app. At the main menu, ESC also exits. Settings that were already confirmed are kept when you go back.
- Test spinner is forced to one line per model (newlines collapsed, truncated to 80 chars) to avoid spamming the terminal on verbose provider errors (e.g. `openrouter/google/lyria-3-pro-preview`).
- If no model works or fetch fails, the app returns to the main menu instead of exiting.
- After writing to OpenCode, **restart opencode** and select the model via `/models`.
