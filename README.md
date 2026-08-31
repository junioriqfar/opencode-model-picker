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

All settings are saved immediately and applied to the current session.

## Workflow

1. **Initial action** — choose between *Use saved provider*, *Manage saved providers* (edit name/base URL/API key, delete — bottom option is **Kembali** / **Back** in green), *Add new provider*, *Settings*, or *Exit*.
2. **Fetch models** — the app calls `GET {baseURL}/v1/models`. On failure, error is shown and you return to the main menu (app does not close).
3. **Select models** — after fetching, choose **Select all (X models)** to test every model, or **Custom** to pick specific models via multiselect (space to select, enter to continue). If no model is selected in Custom mode, you return to the main menu.
4. **Test access** — each model is tested with a small request using the timeout from **Settings → Default timeout** (initially **15 seconds**, configurable 1–300 seconds, stored in settings). The spinner stays on a single line per model (`model-id ✓/✗ — short message`), sanitized to one line and truncated (handles OpenRouter `Provider returned error` wrapping by extracting inner message). Rate-limited requests are retried once automatically. A 500ms delay between models reduces burst rate-limiting.
5. **Recap** — shows `✓ X working  ✗ Y dead/EOL/not found  ! Z temporary (timeout/rate-limit)` and lists each dead/warn model on its own single line. If **0 working**, it shows `No working models...` and returns to the main menu instead of closing.
6. **Auto scoring** — working models are ranked by coding capability score (reasoning, tools, context, name heuristics). Ranking is shown as a single non-interactive block with numbers, no enter required:
   ```
   Initial ranking (auto score):
     1. nvidia/minimaxai/minimax-m3 (score 85)
     2. gemini/gemini-3-flash-preview (score 80)
   ```
7. **Manual edit** — optionally reorder via `Select model to move → Move to position (1-N)`. Current order is also shown as `1. id (score 85)` in one block.
8. **Display name** — choose auto short names (take the last segment of the ID) or enter them manually per model. Sequence numbers are auto-generated from position using the **Settings → Numbering style** (e.g. `01.`, `1.`, `001.`, `01 -`, or `none`).
9. **Preview** — name list + configuration block are shown for review before saving.
10. **Save** — writes to `~/.config/opencode/opencode.jsonc` (macOS/Linux) or `%APPDATA%\opencode\` (Windows), with a safe merge that preserves other configuration. If the provider name **already exists**, the app warns that all existing models for that provider will be deleted and replaced with the current list.
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

Settings are stored in `~/.config/opencode-model-picker/config.json` alongside saved providers and support migration from older configs.

## Project Structure

```
src/
├── cli.js        # interactive flow (@clack/prompts) + i18n + settings + outer loop (no auto-close) + single-line spinner
├── i18n.js       # translations (en/id) + numbering styles
├── provider.js   # GET /v1/models + test /v1/chat/completions + single-line sanitization + OpenRouter inner error extraction
├── scoring.js    # auto scoring for coding capability
├── config.js     # app config load/save (~/.config/opencode-model-picker/) + settings (language/timeout/numbering)
├── opencode.js   # safe merge into opencode.jsonc (numbering-aware)
└── utils.js      # cross-platform paths, JSONC parser
```

## Notes

- App config (saved providers + settings) is stored at `~/.config/opencode-model-picker/config.json` (API keys are plain text — keep this file secure).
- Test spinner is forced to one line per model (newlines collapsed, truncated to 80 chars) to avoid spamming the terminal on verbose provider errors (e.g. `openrouter/google/lyria-3-pro-preview`).
- If no model works or fetch fails, the app returns to the main menu instead of exiting.
- After writing to OpenCode, **restart opencode** and select the model via `/models`.
