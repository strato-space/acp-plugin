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

<!-- BEGIN BEADS INTEGRATION -->
## Issue Tracking with bd (beads)

**IMPORTANT**: This project uses **bd (beads)** for ALL issue tracking. Do NOT use markdown TODOs, task lists, or other tracking methods.

### Why bd?

- Dependency-aware: Track blockers and relationships between issues
- Git-friendly: Auto-syncs to JSONL for version control
- Agent-optimized: JSON output, ready work detection, discovered-from links
- Prevents duplicate tracking systems and confusion

### Quick Start

**Check for ready work:**

```bash
bd ready --json
```

**Create new issues:**

```bash
bd create "Issue title" --description="Detailed context" -t bug|feature|task -p 0-4 --json
bd create "Issue title" --description="What this issue is about" -p 1 --deps discovered-from:bd-123 --json
```

**Claim and update:**

```bash
bd update bd-42 --claim --json
bd update bd-42 --priority 1 --json
```

**Complete work:**

```bash
bd close bd-42 --reason "Completed" --json
```

### Issue Types

- `bug` - Something broken
- `feature` - New functionality
- `task` - Work item (tests, docs, refactoring)
- `epic` - Large feature with subtasks
- `chore` - Maintenance (dependencies, tooling)

### Priorities

- `0` - Critical (security, data loss, broken builds)
- `1` - High (major features, important bugs)
- `2` - Medium (default, nice-to-have)
- `3` - Low (polish, optimization)
- `4` - Backlog (future ideas)

### Workflow for AI Agents

1. **Check ready work**: `bd ready` shows unblocked issues
2. **Claim your task**: `bd update <id> --claim`
3. **Work on it**: Implement, test, document
4. **Discover new work?** Create linked issue:
   - `bd create "Found bug" --description="Details about what was found" -p 1 --deps discovered-from:<parent-id>`
5. **Complete**: `bd close <id> --reason "Done"`

### Auto-Sync

bd automatically syncs with git:

- Exports to `.beads/issues.jsonl` after changes (5s debounce)
- Imports from JSONL when newer (e.g., after `git pull`)
- No manual export/import needed!

### Important Rules

- ✅ Use bd for ALL task tracking
- ✅ Always use `--json` flag for programmatic use
- ✅ Link discovered work with `discovered-from` dependencies
- ✅ Check `bd ready` before asking "what should I work on?"
- ❌ Do NOT create markdown TODO lists
- ❌ Do NOT use external issue trackers
- ❌ Do NOT duplicate tracking systems

For more details, see README.md and docs/QUICKSTART.md.

<!-- END BEADS INTEGRATION -->

## Landing the Plane (Session Completion)

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **Bump + package before final push (MANDATORY)** - For any shipped code/docs change intended for release, run:
   ```bash
   npm version patch --no-git-tag-version
   npm run build:vsix
   ```
2. **File issues for remaining work** - Create issues for anything that needs follow-up
3. **Run quality gates** (if code changed) - Tests, linters, builds
4. **Update issue status** - Close finished work, update in-progress items
5. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   bd sync
   git add -A
   git commit -m "<type>: <summary>"
   git push
   git status  # MUST show "up to date with origin"
   ```
6. **Clean up** - Clear stashes, prune remote branches
7. **Verify** - All changes committed AND pushed
8. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- Release-ready handoff requires `version bump + build vsix + git add/commit/push`
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds
