# Telnet And API

## Purpose

- Low-level Telnet connection management.
- High-level 7 Days to Die server command execution.
- Pure parsing of Telnet command output.
- Tauri/Rust backend is authoritative for runtime behavior; TypeScript modules remain as migration-period reference and Jest test baseline.

## Runtime API Surface

- `src-tauri/src/lib.rs`
  - `TelnetConnection`
  - connection/authentication lifecycle
  - command sending and response normalization
  - connection diagnostics and password redaction
  - Rust `parse_list_players`
  - Tauri commands: `connect`, `disconnect`, `send_command`, `api_call`

## TypeScript Reference Surface

- `src/main/telnet-client.ts`
  - `TelnetClient`
  - mockable Telnet behavior used by Jest tests
  - regression coverage for authentication markers and command response handling
- `src/main/server-api.ts`
  - `ServerApi`
  - typed command composition reference
- `src/main/parsers.ts`
  - `parseListPlayers`
  - `parseListPlayerIds`
  - `parseListEntities`
  - `parseBanList`
  - `parseGamePreferences`
  - `parseTime`
  - `parseVersion`

## Patterns

- Keep runtime Telnet changes in Rust first.
- Keep TypeScript Telnet/parser tests as parity checks until the migration is fully retired.
- Keep output parsing pure and testable.
- Add parser tests for new 7DTD output formats before changing parser assumptions.
- Do not log passwords; diagnostics must redact password text before UI/log output.

## Gotchas

- Response completion depends on prompt/silence heuristics and echo filtering.
- Compatibility may vary across 7 Days to Die server versions.
- Real 7DTD Telnet authentication can return `Logon successful.`.
- Arbitrary command strings can be sent through the custom-command path.
- Rust and TypeScript parser behavior can drift; prefer adding parity tests before changing either side.

## Tests

- `src-tauri/src/lib.rs` Rust tests
- `tests/telnet-client.test.ts`
- `tests/mock-server.test.ts`
- `tests/parsers.test.ts`

## Paths

- `src-tauri/src/lib.rs`
- `src/main/telnet-client.ts`
- `src/main/server-api.ts`
- `src/main/parsers.ts`
- `src/common/constants.ts`
