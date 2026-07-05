# Tauri Backend

## Purpose

- Authoritative desktop runtime and privileged operation boundary.
- Handles Telnet connections, server commands, player parsing, `serverconfig.xml`, saved profiles, file dialogs, log directory operations, and renderer events.

## API Surface

- `src-tauri/src/lib.rs`
  - `connect`, `disconnect`, `get_state`
  - `send_command`, `api_call`
  - `get_log_directory`, `open_log_directory`, `save_log`
  - `select_server_config_file`, `load_server_config`, `save_server_config`
  - `get_profiles`, `save_profile`, `delete_profile`
  - `get_last_used_profile`, `set_last_used_profile`
  - `server-event` emission for connection, auth, diagnostics, errors, lines
- `src-tauri/src/main.rs`
  - native binary entry calling `sevendtd_server_manager_lib::run()`
- `src-tauri/tauri.conf.json`
  - frontend dist path, CSP, window config, bundle metadata, icons
- `src-tauri/capabilities/default.json`
  - Tauri permission/capability declaration

## Patterns

- Keep renderer inputs validated and constrained in Rust commands.
- Do not log passwords; diagnostics should redact any password text before reaching logs/UI.
- Prefer UTF-8-safe string truncation for diagnostics/log snippets.
- Use `server-event` for live updates and command return values for final success/error state.
- Keep Tauri command names in snake_case; the renderer adapter maps them behind `DesktopApi`.
- Run `cargo fmt` after Rust edits and `cargo test` for backend changes.

## Gotchas

- Current Telnet and filesystem operations are synchronous; long operations can occupy Tauri command threads.
- Cross-platform file dialogs/open-directory behavior should be manually verified on target OSes.
- Saved profiles store passwords as base64-obfuscated JSON (`obf:<base64>`) with fallback for legacy plaintext profiles; this is obfuscation, not encryption.
- Map/config/log file commands validate absolute paths, reject traversal (`..`), and restrict file extensions.
- Tauri app data paths differ from legacy Electron `userData` paths.
- Windows cross-build from Linux is unsigned and experimental.

## Tests

- Rust tests in `src-tauri/src/lib.rs`
- TypeScript parity/reference tests in `tests/`

## Paths

- `src-tauri/src/lib.rs`
- `src-tauri/src/main.rs`
- `src-tauri/Cargo.toml`
- `src-tauri/tauri.conf.json`
- `src-tauri/capabilities/default.json`
