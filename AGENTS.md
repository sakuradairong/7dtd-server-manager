# Repository Guidelines

## Project Overview

- A Tauri + TypeScript desktop manager for 7 Days to Die dedicated servers.
- Connects to the game server over Telnet, exposes management actions in a desktop UI, edits `serverconfig.xml`, saves server profiles, and writes local logs.
- Tauri is the authoritative desktop runtime. Old Electron startup/packaging entrypoints have been removed.
- The renderer UI is implemented in vanilla TypeScript/DOM (no React/Vue/Angular, no bundler).
- This is a single-project npm workspace; it is not a monorepo.
- User-facing UI text and the main `README.md` are in Chinese; code comments and agent docs are in English.

## Technology Stack & Runtime Architecture

- **Backend**: Rust/Tauri 2 (`src-tauri/`).
  - `src-tauri/src/lib.rs` is the Tauri command hub. It manages a single global `Mutex<AppState>` that holds the active `TelnetConnection`.
  - `src-tauri/src/main.rs` is the native binary entry that calls `sevendtd_server_manager_lib::run()`.
  - `src-tauri/tauri.conf.json` defines the app, frontend dist path (`../dist/renderer`), CSP, window title (`7 Days to Die 服务器管理工具`), and bundle settings.
  - `src-tauri/capabilities/default.json` declares the default Tauri capability (`core:default`) for the `main` window.
- **Frontend**: static HTML/CSS/vanilla TypeScript in `src/renderer/`.
  - `src/renderer/index.html` + `src/renderer/app.ts` + `src/renderer/styles.css` form the UI.
  - `src/renderer/desktop-api.d.ts` is the renderer-side type contract.
  - The renderer talks to Rust through `window.__TAURI__.core.invoke()` and listens to `server-event` via `window.__TAURI__.event.listen()` (`withGlobalTauri` is enabled).
- **Shared TypeScript boundary**: `src/common/types.ts` (readonly interfaces) and `src/common/constants.ts` (defaults and the `TELNET_COMMANDS` registry).
- **Reference/parity modules**: `src/main/` holds TypeScript Telnet/config/profile/logger/parser modules kept as migration reference and Jest test coverage. Do not treat it as the desktop runtime entry.
- No frontend framework, bundler, DI container, database, or remote backend is present.

### Data Flow

Renderer DOM event → `window.__TAURI__.core.invoke()` / Tauri event listener → Rust command in `src-tauri/src/lib.rs` → Telnet/file/XML/profile/log operation → JSON response or `server-event` update.

## Key Directories & Files

- `src-tauri/` — authoritative Tauri Rust backend, config, permissions, icons, and native packaging.
- `src/renderer/` — static HTML/CSS and DOM-driven renderer logic.
- `src/common/` — shared TypeScript interfaces, constants, and Telnet command registry.
- `src/main/` — migration-period TypeScript implementation modules and parser/test baseline.
- `tests/` — Jest/ts-jest tests for TypeScript parser, Telnet behavior, config/profile/logger modules, and mock server flows.
- `scripts/generate-telnet-commands.js` — generates `src/renderer/telnet-commands.gen.ts` from `src/common/constants.ts`.
- `dist/` — generated frontend assets for Tauri; do not edit.
- `src-tauri/target/` — generated Rust/build/package output; do not edit.
- `docs/contexts/` — short subsystem reference cards for future AI agents.

## Build, Development & Packaging Commands

- `npm install` — install Node dependencies.
- `npm run generate:telnet-commands` — generate `src/renderer/telnet-commands.gen.ts` from `src/common/constants.ts`.
- `npm run build` (alias `npm run build:renderer`) — clean `dist/renderer`, generate the command registry, compile renderer TypeScript with `tsconfig.renderer.json`, and copy static assets into `dist/renderer/`.
- `npm run copy-assets` — copy `src/renderer/index.html` and `src/renderer/styles.css` into `dist/renderer/`.
- `npm start` or `npm run tauri:dev` — run the Tauri app in development mode.
- `npm run tauri:build` or `npm run dist` — package current platform with Tauri.
- `npm run tauri:build:win` or `npm run dist:win` — cross-build Windows GNU target (`x86_64-pc-windows-gnu`) from Linux when toolchain dependencies are installed.
- `npm run tauri:build:debug` — build a debug Tauri package.
- `npm run typecheck` — typecheck the renderer without emitting files (auto-generates the command registry first).
- `npm run format` — format Rust code with `cargo fmt`.
- `npm run format:check` — check Rust formatting.
- `npm run lint` — run `cargo clippy -- -D warnings`.
- `npm run check` — run `typecheck`, `format:check`, `lint`, and `test:all` in one go.
- `npm run clean` — remove generated `dist/`, `release/`, `src-tauri/target/`, and `src-tauri/gen/`.

### Build Notes

- `tsconfig.json` is the base config (ES2022, CommonJS, `strict: true`, `src/` root).
- `tsconfig.renderer.json` extends it and scopes the renderer build to `src/common/**/*`, `src/renderer/app.ts`, and `src/renderer/desktop-api.d.ts`.
- The generated `src/renderer/telnet-commands.gen.ts` is gitignored; it is recreated by the build script.
- `copy-assets` copies static renderer HTML/CSS only; TypeScript emits `dist/renderer/app.js`.

## Code Style Guidelines

- TypeScript target is ES2022, `strict: true`.
- Existing TypeScript uses tabs, double quotes, semicolons, and explicit return types on exported functions/classes.
- Rust code uses `cargo fmt`; run `cargo fmt --check` before claiming Rust changes are done.
- Prefer readonly shared interfaces in `src/common/types.ts`.
- Keep renderer code DOM-based unless a framework migration is intentionally planned.
- Do not access Node APIs from the renderer; use the Tauri global bridge (`window.__TAURI__`).
- Keep privileged operations in Tauri commands and validate renderer inputs on the Rust side.
- Keep parser logic pure and add focused tests for each new server-output shape.
- Tauri command names are in `snake_case`; the renderer adapter (`createTauriApi`) maps them to a typed `DesktopApi`.
- UI text is in Chinese; preserve it unless intentionally localizing.
- Do not store generated files or release artifacts in source edits.
- Rust code uses `cargo fmt`; run `cargo fmt --check` before claiming Rust changes are done.

## Testing Instructions

- `npm test` — run Jest TypeScript tests.
- `npm test -- --coverage` — run Jest with coverage; the 80% branches/functions/lines/statements threshold in `jest.config.js` is only enforced in this mode.
- `npm run test:rust` — run Rust/Tauri backend tests (`cd src-tauri && cargo test`).
- `npm run test:all` — run Jest (`--runInBand`) then Rust tests.

### Test Layout

- Framework: Jest 29 with `ts-jest`, Node test environment.
- Rust tests live in `src-tauri/src/lib.rs` under `#[cfg(test)]`.
- TypeScript tests live in `tests/*.test.ts`; Jest also roots `src/` for colocated tests if added later.
- `tests/telnet-client.test.ts` — mocked socket connection/authentication/queue behavior.
- `tests/mock-server.test.ts` — real TCP mock server lifecycle checks.
- `tests/parsers.test.ts` — parser output shapes for `listplayers`, `listplayerids`, `listents`, `ban list`, `getgamepref`, `gettime`, `version`.
- `tests/server-config.test.ts` — XML load/save/editable subset behavior.
- `tests/profile-manager.test.ts` — profile CRUD and persistence.
- `tests/logger.test.ts` — dated log writing and cleanup.

### Validation Advice

- For changes touching the renderer/Tauri command boundary, run at least `npm run build`, `npm test -- --runInBand`, and `npm run test:rust`.
- For UI behavior changes, manually validate `npm start` when possible.
- GitHub Actions CI runs `npm run check` (and the Rust checks) on pushes and pull requests; local `npm run check` should pass before pushing.

## Security Considerations

- Saved profiles store server passwords as base64-obfuscated JSON (`obf:<base64>`) under the Tauri app data directory (`profiles.json`), with fallback for legacy plaintext profiles. This is obfuscation, not encryption; treat the profile file as sensitive. Do not hardcode passwords or expose profile files.
- Telnet should only be used on trusted networks/VPN/local networks, matching README security guidance.
- Password redaction: both the Rust backend (`diagnostic_snippet`/`redact_password`) and the TypeScript `TelnetClient` replace password text with `[password redacted]` before diagnostics reach logs or the UI.
- The Tauri CSP (`default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'`) restricts renderer resources; keep it in mind when adding external assets.
- File dialogs (`select_server_config_file`) are filtered to XML files by default.
- Map/config/log file commands validate absolute paths, reject traversal (`..`), and restrict file extensions to sandbox the app against unintended filesystem access.
- Logs are written under the Tauri app data directory (`logs/`), separate from legacy Electron `userData` paths.

## Operational Risks & Gotchas

- Synchronous filesystem/XML/Telnet operations currently run in Tauri commands; keep files small or move heavy work to async/blocking-safe execution before scaling.
- `get_editable_properties()` intentionally filters `serverconfig.xml` keys to a fixed allowlist; new game properties will not appear in the UI until the allowlist is updated in both Rust and TypeScript implementations.
- Windows cross-compilation from Linux is experimental and produces unsigned installers.
- Tauri app data paths differ from legacy Electron `userData` paths; logs and profiles are now written under the Tauri app data directory.
- Tauri command responses and `server-event` diagnostics can both reach the renderer; keep UI logging deduplicated (see `appendConnectionDiagnostic` with `dedupe`).
- App identifier is `com.example.7dtd-server-manager`; treat it as a placeholder for real distribution.

## Module Contexts (`docs/contexts/`)

- `docs/contexts/common.md` — shared type/default/command metadata boundary.
- `docs/contexts/tauri-backend.md` — Tauri command hub and native runtime contract.
- `docs/contexts/telnet-and-api.md` — Telnet client, high-level server API, parser seam.
- `docs/contexts/renderer.md` — renderer UI and Tauri bridge usage.
- `docs/contexts/config-profiles-logs.md` — XML config, saved profiles, logging.
- `docs/contexts/testing.md` — test layout and validation targets.
- `docs/contexts/build-packaging.md` — Tauri build, asset copy, and packaging notes.
