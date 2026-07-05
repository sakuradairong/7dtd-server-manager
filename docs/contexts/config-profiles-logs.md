# Config Profiles Logs

## Purpose

- Local persistence helpers for server XML config, saved connection profiles, and application logs.
- Tauri/Rust implementation in `src-tauri/src/lib.rs` is authoritative at runtime.
- TypeScript modules in `src/main/` remain as migration-period reference implementations and Jest test targets.

## Runtime API Surface

- `src-tauri/src/lib.rs`
  - `load_server_config`
  - `save_server_config`
  - `get_profiles`
  - `save_profile`
  - `delete_profile`
  - `get_last_used_profile`
  - `set_last_used_profile`
  - `get_log_directory`
  - `open_log_directory`
  - `save_log`

## TypeScript Reference Surface

- `src/main/server-config.ts`
  - `ServerConfigManager`
  - load `serverconfig.xml`
  - save edited properties
  - editable property filtering
- `src/main/profile-manager.ts`
  - `ProfileManager`
  - profile CRUD
  - last-used profile tracking
- `src/main/logger.ts`
  - `FileLogger`
  - dated log files
  - log directory lookup
  - old-file cleanup

## Patterns

- Keep XML parsing/writing behind a small module/command boundary.
- Keep profile JSON storage behind a small module/command boundary.
- Keep log writes behind a single helper.
- Use temp directories in tests for filesystem behavior.
- Do not log or expose server passwords except inside explicit saved profile data.

## Gotchas

- Profile passwords are stored as base64-obfuscated JSON (`obf:<base64>`) under the Tauri app data directory, with fallback for legacy plaintext profiles. This is obfuscation, not encryption; treat the profile file as sensitive.
- Tauri app data paths differ from legacy desktop runtime paths.
- `serverconfig.xml` editable fields are whitelist-based.
- Runtime Rust XML handling uses `quick_xml` for structured save; unusual XML formatting needs tests.
- Log cleanup/rotation should be revisited before large-scale use.

## Tests

- `src-tauri/src/lib.rs` Rust tests
- `tests/server-config.test.ts`
- `tests/profile-manager.test.ts`
- `tests/logger.test.ts`

## Paths

- `src-tauri/src/lib.rs`
- `src/main/server-config.ts`
- `src/main/profile-manager.ts`
- `src/main/logger.ts`
