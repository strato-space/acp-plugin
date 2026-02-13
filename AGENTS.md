# Repository Guidelines

## Project Structure

- `src/`: VS Code extension host (TypeScript). Entry point: `src/extension.ts`.
- `src/views/webview/`: React + Vite webview entry (bundled into the extension).
- `packages/acp-ui/`: shared React UI + Zustand store + types (used by both the webview and `acp-chat`, and treated as source of truth for chat UI behavior).
- `acp-chat/`: standalone web UI + server bridge (Express + WS) for `agents-dev.stratospace.fun`.
- `src/test/`: extension tests (`*.test.ts`) executed in an Extension Host.
- `e2e/`: Playwright E2E tests (`*.spec.ts`).
- `assets/`, `media/`, `screenshots/`: images used in the UI/README/marketplace.
- Generated (do not commit): `dist/`, `out/`, `coverage/`, `*.vsix`, `playwright-report/`,
  `test-results/`, `acp-chat/**/dist/`.

## Build and Development Commands

- `npm ci`: install dependencies (requires Node >= 20).
- `npm run watch`: watch TypeScript + esbuild (+ webview build) for local development.
- `npm run compile`: one-off build (typecheck + webview build + bundle).
- `npm run package`: production build (used by `vsce` packaging).
- `npm run build:vsix`: build production bundle and create `acp-plugin-<version>.vsix`.
- `npm run release:patch`: bump patch version and produce a fresh `.vsix` in one command.
- `npx vsce package --no-dependencies`: create a `.vsix` for manual install/testing.
- `npm --prefix acp-chat ci && npm --prefix acp-chat run build`: build the standalone web UI + server bridge.
- `npm run test:webview:unit`: run unit tests for shared UI logic (tool visibility and similar pure logic).

Tip: In VS Code, use the "Run Extension" and "Extension Tests" launch configs
(`.vscode/launch.json`).

## Install / Upgrade (VSIX)

This extension is typically installed by packaging a `.vsix` and installing it via the VS Code
CLI.

### 1) Build a VSIX

From the repo root:

```bash
npm ci
npm run release:patch
```

This command applies a patch version bump and produces a `.vsix` like `acp-plugin-<version>.vsix`.

Notes:

- `.vsix` files are local artifacts and should not be committed (`*.vsix` is ignored).
- The extension ID is `strato-space.acp-plugin` (publisher/name from `package.json`).
- Older artifacts like `nexus-acp-dev.vsix` are intentionally not kept in the repo. If you see
  `ENOENT: no such file or directory`, build a fresh `.vsix` first and point the installer at
  the new `acp-plugin-<version>.vsix` file.

### 2) Install on local VS Code

```bash
code --install-extension ./acp-plugin-<version>.vsix --force
```

### 3) Install on Remote-SSH VS Code Server

When using Remote-SSH, `code --install-extension ...` runs against the remote VS Code Server
via a UNIX socket. If the CLI can't find the right socket, you'll see errors like `ENOENT` or
`ECONNREFUSED` for `vscode-ipc-*.sock`.

The most reliable approach is to try all sockets until one responds:

```bash
VSIX=./acp-plugin-<version>.vsix
RUNTIME_DIR="${XDG_RUNTIME_DIR:?XDG_RUNTIME_DIR is not set}"

for s in "$RUNTIME_DIR"/vscode-ipc-*.sock; do
  echo "Trying $s"
  VSCODE_IPC_HOOK_CLI="$s" code --install-extension "$VSIX" --force && break
done
```

After a successful install, run **Developer: Reload Window** (or reload the Remote window)
to ensure the new extension code is loaded.

Notes:

- For extension host changes (TypeScript under `src/`), use `Developer: Reload Window`
  or `Developer: Restart Extension Host`.
- For UI-only changes (`packages/acp-ui`, `src/views/webview`), reopen ACP chat after install/reload.

### 4) Verify / Cleanup

List installed extensions (with versions):

```bash
code --list-extensions --show-versions | rg -i 'acp-plugin'
```

Optional: uninstall the old Nexus extension (new extension uses `acp.*` settings, not
`nexus.*`):

```bash
code --uninstall-extension cosmosjeon.nexus-acp
```

## Coding Style & Naming Conventions

- Formatting: Prettier (`tabWidth: 2`, semicolons, double quotes, `printWidth: 80`):
  `npm run format`.
- Linting: ESLint on `src/**/*.ts`: `npm run lint`. Prefix intentionally-unused params with
  `_`.
- Naming: `camelCase.ts` for modules (example: `chatPanel.ts`); `PascalCase.tsx` for
  webview components (example: `App.tsx`).

## Testing Guidelines

- Extension tests live in `src/test/*.test.ts` and run via `npm test` (VS Code test host).
- Shared webview UI unit tests run via `npm run test:webview:unit`.
- Coverage: `npm run coverage` writes reports to `coverage/` (CI uploads + summarizes this).
- E2E: Playwright tests live in `e2e/*.spec.ts` and run via `npm run test:e2e` (use
  `test:e2e:headed` / `test:e2e:debug` when debugging).
- E2E env:
- `ACP_AGENTS_DEV_TOKEN`: required for the agents-dev smoke tests.
- `ACP_AGENTS_DEV_BASE_URL`: override base URL (default `https://agents-dev.stratospace.fun`).
- `ACP_E2E_RUN_VSCODE=1`: opt-in to the VS Code Electron smoke test (Mode B).
- `PW_CHROME_CHANNEL=chrome`: optional, to force system Chrome instead of bundled Chromium.

Manual MCP smoke runbook (LLM-driven UI checks):

- `e2e/mode-b-mcp.md`

## UI Behavior Invariants

- Default collapsed tool view shows the 5 most recent regular tool calls (task/agent rows remain visible).
- `Show more` / `Show less` for tool lists is treated as a sticky user preference and applies to subsequent assistant frames.
- Main run-frame collapse/expand state is sticky and applies to subsequent assistant frames.
- Keep layouts usable at narrow widths (at least iPhone XR class viewport) and avoid horizontal overflow regressions.

## Security & Configuration Tips

- Avoid committing secrets or machine-specific paths. For local agent testing, use VS Code
  settings (`agent_servers` / `acp.agents`) and `${env:NAME}` placeholders where possible.
- Canonical agent key is `agent_servers`; `acp.agents` is supported as an alias.
- `acp.agentServers` is deprecated and not read by current builds. If custom agents do not show up,
  migrate entries to `agent_servers` in VS Code settings.

## Commit & Pull Request Guidelines

- Conventional Commits are enforced (commitlint): `feat: ...`, `fix: ...`, `docs: ...`,
  `chore: ...`, optional scopes like `feat(landing): ...`.
- PRs should include: a short summary, testing notes (commands run), and screenshots/GIFs
  for webview/UX changes.
- Keep changes focused and avoid adding generated artifacts or secrets.
