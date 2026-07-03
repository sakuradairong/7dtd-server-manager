# Build Packaging

## Purpose

- Tauri-first npm, TypeScript asset build, Rust backend build, and native packaging reference.

## Commands

- `npm install`
- `npm run build` — compile renderer TypeScript and copy HTML/CSS into `dist/renderer/`
- `npm start` / `npm run tauri:dev` — run Tauri dev mode
- `npm run tauri:build` / `npm run dist` — package current platform
- `npm run tauri:build:win` / `npm run dist:win` — Linux-to-Windows GNU cross-build
- `npm test` — Jest tests
- `npm run test:rust` — Rust backend tests
- `npm run test:all` — Jest plus Rust tests
- `npm run clean` — remove generated build outputs

## Tooling

- Node.js 18+
- npm with `package-lock.json`
- TypeScript ES2022 CommonJS for renderer compilation
- Rust/Cargo for Tauri backend
- Tauri CLI 2.x
- Windows cross-build from Linux requires Rust `x86_64-pc-windows-gnu`, `mingw-w64`, and `nsis`

## Generated Paths

- `dist/`
- `src-tauri/target/`
- `src-tauri/gen/`
- `coverage/`
- `node_modules/`
- `release/` may exist from old Electron builds; treat it as generated output only.

## Packaging Targets

- Current-platform Tauri bundles via `tauri build`
- Windows NSIS installer via GNU cross-target script
- Linux/macOS bundles depend on host platform and installed Tauri system dependencies

## Gotchas

- `src-tauri/target/` can be large; never commit it.
- Tauri Windows cross-compilation from Linux is experimental and produces unsigned installers.
- `bundle.targets` is currently `all`, so host tooling availability can affect package formats.
- `copy-assets` copies renderer HTML/CSS only; TypeScript emits `dist/renderer/app.js`.
- There is no ESLint setup; `lint` is intentionally not declared until tooling is added.
- App identifier is `com.example.7dtd-server-manager`; treat as placeholder for real distribution.

## Paths

- `package.json`
- `package-lock.json`
- `tsconfig.json`
- `tsconfig.renderer.json`
- `.gitignore`
- `src-tauri/tauri.conf.json`
- `src-tauri/Cargo.toml`
- `src/renderer/index.html`
- `src/renderer/styles.css`
- `src/renderer/app.ts`
