# Repository Guidelines

## Project Structure

- `src/`: VS Code extension host (TypeScript). Entry point: `src/extension.ts`.
- `src/views/webview/`: React + Vite webview UI bundled into the extension.
- `src/test/`: extension tests (`*.test.ts`) executed in an Extension Host.
- `e2e/`: Playwright E2E tests (`*.spec.ts`).
- `assets/`, `media/`, `screenshots/`: images used in the UI/README/marketplace.
- Generated (do not commit): `dist/`, `out/`, `coverage/`, `*.vsix`, `playwright-report/`,
  `test-results/`.

## Build and Development Commands

- `npm ci`: install dependencies (requires Node >= 20).
- `npm run watch`: watch TypeScript + esbuild (+ webview build) for local development.
- `npm run compile`: one-off build (typecheck + webview build + bundle).
- `npm run package`: production build (used by `vsce` packaging).
- `npx vsce package --no-dependencies`: create a `.vsix` for manual install/testing.

Tip: In VS Code, use the "Run Extension" and "Extension Tests" launch configs
(`.vscode/launch.json`).

## Install / Upgrade (VSIX)

This extension is typically installed by packaging a `.vsix` and installing it via the VS Code
CLI.

### 1) Build a VSIX

From the repo root:

```bash
cd /home/tools/acp-plugin
npm ci
npm run package

# Produces a .vsix like: acp-plugin-<version>.vsix
npx vsce package --no-dependencies
```

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
`ECONNREFUSED` under `/run/user/<uid>/vscode-ipc-*.sock`.

The most reliable approach is to try all sockets until one responds:

```bash
VSIX=/home/tools/acp-plugin/acp-plugin-<version>.vsix

for s in /run/user/$(id -u)/vscode-ipc-*.sock; do
  echo "Trying $s"
  VSCODE_IPC_HOOK_CLI="$s" code --install-extension "$VSIX" --force && break
done
```

After a successful install, run **Developer: Reload Window** (or reload the Remote window)
to ensure the new extension code is loaded.

Notes:

- The composer includes an icon-only **Reload** button that reloads the ACP webview UI
  (useful for UI-only changes without restarting VS Code).
- If you changed the extension host code (TypeScript under `src/`), you still need
  `Developer: Restart Extension Host` or `Developer: Reload Window`.

### 4) Verify / Cleanup

List installed extensions (with versions):

```bash
code --list-extensions --show-versions | rg -i 'acp-plugin|nexus-acp|vscode-acp'
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
- Coverage: `npm run coverage` writes reports to `coverage/` (CI uploads + summarizes this).
- E2E: Playwright tests live in `e2e/*.spec.ts` and run via `npm run test:e2e` (use
  `test:e2e:headed` / `test:e2e:debug` when debugging).

## Security & Configuration Tips

- Avoid committing secrets or machine-specific paths. For local agent testing, use VS Code
  User settings (`acp.agentServers`) and `${env:NAME}` placeholders where possible.

## Commit & Pull Request Guidelines

- Conventional Commits are enforced (commitlint): `feat: ...`, `fix: ...`, `docs: ...`,
  `chore: ...`, optional scopes like `feat(landing): ...`.
- PRs should include: a short summary, testing notes (commands run), and screenshots/GIFs
  for webview/UX changes.
- Keep changes focused and avoid adding generated artifacts or secrets.
