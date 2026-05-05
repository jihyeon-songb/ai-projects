# Architecture Guide

This project is a cross-platform Rust desktop viewer for saved Codex sessions.
It uses `eframe`/`egui` for the UI and reads Codex session files from the local
filesystem. The app is intentionally small: parsing and domain logic live in
`src/codex.rs`, while UI state and rendering live in `src/app.rs`.

## Entry Points

- `src/main.rs`
  - Parses CLI arguments through `AppConfig::from_args`.
  - Configures the native window size with `eframe::NativeOptions`.
- Starts the desktop app with `eframe::run_native`.
- Calls `fonts::configure_fonts` before constructing `SessionManagerApp`.
- Uses `windows_subsystem = "windows"` in release builds so Windows does not
  open an extra console window.

- `src/app.rs`
  - Owns the egui application state.
  - Renders the toolbar, search box, session list, status bar, and detail pane.
  - Handles keyboard navigation.

- `src/codex.rs`
  - Owns Codex filesystem discovery and JSONL parsing.
  - Defines the data structures consumed by the UI.
  - Contains the current unit tests.

- `src/fonts.rs`
  - Finds a system font that supports Korean glyphs.
  - Registers that font as an egui fallback for proportional and monospace text.
  - Supports `CODEX_SESSION_MANAGER_KOREAN_FONT` for explicit font override.

## Data Model

`AppConfig`

- `codex_home`: base Codex directory.
- `sessions_dir`: directory scanned for saved session JSONL files.
- `index_path`: path to `session_index.jsonl`.

Default path resolution:

- `CODEX_HOME` wins if set.
- Windows: `USERPROFILE\.codex`, then `APPDATA\Codex`.
- Other platforms: `HOME/.codex`.

`SessionSummary`

- Lightweight item used by the left session list.
- Contains session ID, title, updated time, file path, message count, and a short
  preview.

`SessionDetail`

- Full detail for the selected session.
- Contains a cloned `SessionSummary` plus parsed `ConversationMessage` items.

`ConversationMessage`

- UI-ready message with `MessageRole` and plain text.
- Roles are `User`, `Assistant`, `Tool`, `System`, and `Event`.

## Data Flow

1. `main` calls `AppConfig::from_args`.
2. `main` calls `fonts::configure_fonts` with the egui context.
3. `SessionManagerApp::new` stores the config and loaded font path, then calls
   `reload`.
4. `reload` calls `load_sessions`.
5. `load_sessions`:
   - Reads `session_index.jsonl` into a map keyed by session ID.
   - Walks `sessions_dir` recursively.
   - Keeps only `.jsonl` files with a UUID-like suffix.
   - Parses the first few unique messages for list previews.
   - Uses index titles and timestamps when available.
   - Sorts newest sessions first.
6. `open_selected` calls `load_session_detail` for the selected summary.
7. `load_session_detail` reparses the selected JSONL with no message limit.
8. `detail_view` renders the selected conversation in the right panel.

## UI Layout

`SessionManagerApp::ui` builds the whole screen:

- Top panel:
  - App title.
  - `Reload` button.
  - Current Codex home path.
  - Search input.

- Bottom panel:
  - Status text.
  - Keyboard hint.

- Left panel:
  - Resizable session list.
  - Width defaults to `390`.
  - Width is constrained to `280..=560`.
  - Selected session is highlighted.

- Central panel:
  - Selected session title, timestamp, file path.
  - Scrollable conversation messages.

Keyboard handling:

- `ArrowDown`: move selection down.
- `ArrowUp`: move selection up.
- `Enter`: reopen the selected session.

Mouse handling:

- Clicking a session row updates `selected` and opens that session.

Search:

- `filtered_sessions` searches lowercased title, session ID, and preview.
- When the search input changes, selection resets to `0` and opens the first
  matching item.

## Codex Session Parsing

Codex sessions are JSONL files. Each line is parsed independently as
`serde_json::Value`; malformed lines are skipped.

Recognized top-level record types:

- `session_meta`
  - Used to infer a fallback title from `cwd`.

- `event_msg`
  - `user_message` becomes `MessageRole::User`.
  - `agent_message` becomes `MessageRole::Assistant`.
  - `thread_name_updated` updates the parsed fallback title.

- `response_item`
  - `message` records become user/assistant/system/event messages based on
    their `role`.
  - `function_call` and `function_call_output` become `MessageRole::Tool`.

Duplicate handling:

- Some Codex logs store the same message as both `event_msg` and
  `response_item`.
- `push_message` deduplicates by `role + trimmed text`.

Preview handling:

- `load_sessions` calls `parse_session_file(path, 8)` so list loading remains
  cheap.
- Only the first three parsed messages are compacted into the visible preview.
- `load_session_detail` calls `parse_session_file(path, usize::MAX)` to show the
  full conversation.

Session ID extraction:

- `session_id_from_path` expects the filename stem to end in a UUID-like
  36-character ID.
- This matches current Codex rollout filenames such as:
  `rollout-2026-04-28T15-26-18-019dd2c4-5ef8-76c0-916f-dc73c0356412.jsonl`.

## CLI

Supported arguments:

```sh
codex-session-manager [--codex-home PATH] [--sessions-dir PATH] [--index PATH]
```

Examples:

```sh
cargo run
cargo run -- --codex-home /path/to/.codex
cargo run -- --sessions-dir /path/to/sessions
cargo run -- --index /path/to/session_index.jsonl
```

`--help` prints usage and exits without starting the GUI.

## Font And Charset Support

egui's default fonts do not cover Korean glyphs on every platform. This app
loads a system Korean font at startup and appends it to both the proportional
and monospace fallback families.

Candidate fonts include:

- macOS: `AppleGothic.ttf`, `Arial Unicode.ttf`, `AppleSDGothicNeo.ttc`.
- Windows: `malgun.ttf`, `malgunbd.ttf`, `gulim.ttc`.
- Linux: Noto CJK/KR or Nanum Gothic paths under `/usr/share/fonts`.

If automatic discovery fails, set:

```sh
CODEX_SESSION_MANAGER_KOREAN_FONT=/path/to/KoreanFont.ttf cargo run
```

The status bar shows the loaded Korean font filename. If it says the font was
not found, Korean text may render as square replacement glyphs.

## Verification

Current checks:

```sh
cargo check
cargo test
cargo run -- --help
```

The test suite currently covers:

- UUID extraction from rollout filenames.
- Text extraction from `response_item.content`.

Manual runtime check:

```sh
cargo run
```

On macOS, system logs mentioning `LSNotification` or `hiservices` may appear in
the terminal. They are macOS service logs and do not necessarily indicate an app
failure if the window opens.

## Extension Points

Add more filters:

- Extend `SessionManagerApp` with additional filter fields.
- Update `filtered_sessions`.
- Add controls in the top panel.

Improve parsing:

- Add support in `event_message` or `response_item_message`.
- Keep parsing resilient: skip unknown records instead of failing the whole file.

Add metadata columns:

- Extend `SessionSummary`.
- Populate fields in `load_sessions`.
- Render them in `session_row`.

Add export/open-file actions:

- Add buttons in `detail_view`.
- Use `detail.summary.path` for the selected source file.

Improve performance for very large histories:

- Avoid cloning in `filtered_sessions` by returning indices or references.
- Cache parsed details by session ID.
- Move parsing off the UI thread if session files become large enough to cause
  visible stalls.

## Important Constraints

- Keep `src/codex.rs` free of egui dependencies. It should remain testable as
  filesystem/data logic.
- Keep `src/app.rs` focused on UI state and rendering.
- Avoid panics on malformed Codex logs; the parser should skip bad or unknown
  records.
- Preserve cross-platform paths by using `PathBuf` and environment variables
  instead of hardcoded separators.
- `eframe` 0.34 uses `App::ui`, not the older `App::update` implementation.
- Keep Korean font loading best-effort: failure to find a font should not stop
  the app from opening.
