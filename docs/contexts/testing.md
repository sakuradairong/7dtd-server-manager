# Testing

## Purpose

- Jest validation for TypeScript reference modules and protocol behavior.
- Rust validation for the authoritative Tauri backend.

## Commands

- `npm test`
- `npm test -- --coverage`
- `npm run test:rust`
- `npm run test:all`

## Frameworks

- Jest 29
- ts-jest
- Node test environment
- Test pattern: `**/*.test.ts`
- Coverage source: `src/**/*.ts`
- Rust tests via `cargo test` under `src-tauri/`

## Test Areas

- `tests/parsers.test.ts` — TypeScript parser output shapes.
- `tests/telnet-client.test.ts` — mocked socket connection/authentication/queue behavior.
- `tests/mock-server.test.ts` — real TCP mock server lifecycle checks.
- `tests/server-config.test.ts` — XML load/save/editable subset behavior.
- `tests/profile-manager.test.ts` — profile CRUD and persistence.
- `tests/logger.test.ts` — dated log writing and cleanup.
- `src-tauri/src/lib.rs` — Rust Telnet/config/player parsing tests.

## Patterns

- Add focused parser fixtures for each new server-output format.
- Use temporary directories for filesystem tests.
- Use mocked sockets for deterministic Telnet unit tests.
- Use mock server tests for connection lifecycle regressions.
- For runtime behavior, prefer Rust/Tauri tests first, then TypeScript parity tests where useful.

## Gotchas

- There is no ESLint setup or lint script yet.
- Jest coverage threshold is configured but only enforced when coverage is collected.
- No CI workflow was found; local validation evidence matters.

## Paths

- `jest.config.js`
- `tests/`
- `src-tauri/src/lib.rs`
