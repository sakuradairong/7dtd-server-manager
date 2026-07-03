# Common

## Purpose

- Shared type and constant boundary for Tauri renderer code and TypeScript reference modules.
- Keep process-neutral definitions here only.

## API Surface

- `src/common/types.ts`
  - `ServerConfig`
  - `ServerProfile`
  - `ConnectionState`
  - `PlayerInfo`
  - `CommandResult`
  - `BanEntry`
  - `GamePreference`
  - `EntityInfo`
  - `PermissionLevel`
- `src/common/constants.ts`
  - `DEFAULT_TELNET_PORT`
  - `DEFAULT_TIMEOUT_MS`
  - `LINE_DELIMITER`
  - `TELNET_COMMANDS`
  - `CommandName`

## Patterns

- Prefer `readonly` fields for shared interfaces.
- Keep Telnet command metadata centralized in `TELNET_COMMANDS`.
- Avoid Tauri runtime globals, Node socket, DOM, or filesystem imports in `src/common/`.

## Paths

- `src/common/types.ts`
- `src/common/constants.ts`
