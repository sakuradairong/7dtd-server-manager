# Renderer

## Purpose

- Vanilla DOM UI for connection setup, server actions, player display, config editing, profile management, connection diagnostics, and logs.

## API Surface

- `src/renderer/index.html`
  - connection panel and connection diagnostics panel
  - action buttons
  - command input
  - players panel
  - server config panel
  - log panel
- `src/renderer/app.ts`
  - DOM event wiring
  - renderer state updates
  - Tauri command adapter via `window.__TAURI__.core.invoke`
  - Tauri `server-event` subscription via `window.__TAURI__.event.listen`
- `src/renderer/desktop-api.d.ts`
  - renderer-side API type contract used by the UI adapter
- `src/renderer/styles.css`
  - dark theme
  - grid layout
  - status indicators
  - diagnostics/log styling

## Patterns

- Use the Tauri global bridge; do not access Node APIs from renderer code.
- Keep privileged work in `src-tauri/src/lib.rs` commands.
- Keep UI state in renderer variables and DOM updates.
- Preserve Chinese UI text unless intentionally localizing.
- Deduplicate diagnostics because Tauri may deliver them both as events and in a `connect` response.
- Append/retain recent connection diagnostics so users can copy failure details.

## Gotchas

- `npm run build` uses `tsconfig.renderer.json` and writes `dist/renderer/app.js`.
- `copy-assets` only copies HTML/CSS; TypeScript emits the JS file.
- The renderer is not bundled, so imports must compile to browser-loadable assets in `dist/renderer/`.
- `withGlobalTauri` is enabled in Tauri config; if that changes, the renderer adapter must be updated.

## Paths

- `src/renderer/index.html`
- `src/renderer/app.ts`
- `src/renderer/desktop-api.d.ts`
- `src/renderer/styles.css`
- `tsconfig.renderer.json`
