# Changelog

## 1.0.0 (2026-02-09)


### Features

* ACP VS Code plugin (extracted from Nexus-acp) ([b82a28f](https://github.com/strato-space/acp-plugin/commit/b82a28fd99dea0257dd0c801a7bcf0b276e6678a))

## 0.1.8 (2026-02-07)

### Breaking Changes

- Rebrand: **ACP | Agent Client Protocol** (new extension ID + config namespace).
  - Configuration moved from `nexus.*` to `acp.*`.
  - Existing sessions/settings are **not** migrated.

### Features

- Tool calls: show **INPUT + OUTPUT** in the tool detail view.
- UI: responsive layout (wider thread, wider composer, less truncation on wide screens).
- Theme: inherit VS Code colors via `--vscode-*` CSS variables.
- Sidebar: agent groups are collapsible and the collapse state is persisted.
- Chat: add Copy button for both user and assistant messages.
- Increase ACP `initialize()` timeout default to **600000ms** via `acp.connectTimeoutMs`.
- Sessions: allow deleting the currently active session.

### Fixes

- Tool progress: reduce duplicate/stuck tool states by better tool-call ID correlation and stream finalization.

## 0.1.9 (2026-02-07)

### UI

- Rename the mode selector label to **Subagent/Mode** (clarity for agent "modes").
- Update UI titles/tooltips to **ACP Agent Communication Protocol**.

## 0.1.10 (2026-02-07)

### UI

- Update the activity bar title/tooltips to **ACP — Agent Communication Protocol**.
- Sidebar: use the editor background (theme-aligned) and update the header logo to the ACP mark.
- Thinking: replace the Processing brain icon with a running ellipsis and align its tone with Reasoning.

## 0.1.11 (2026-02-07)

### Fixes

- Agents: retry applying `acp.agentServers` on activation and refresh on workspace folder changes so custom agents show up reliably.
- Connect: make connect idempotent (no sticky "already connected/connecting" banner) and optimistically switch UI to **Connecting** to prevent double-clicks.
- Icons: use the ACP activity bar icon **SVG** (from `vscode-acp`) and refresh `assets/icon.png`.
- Markdown: reduce paragraph/list spacing to avoid extra blank lines after streaming.

## 0.1.12 (2026-02-08)

### Fixes

- Icons: increase the AI dot size in the ACP SVG icons for better visibility (activity bar + panel tab icon variants).
- Docs: expand Remote-SSH VSIX install troubleshooting in `AGENTS.md`.
- Agents-as-Tools: preserve full agent names (including instance suffixes like `[1]`) and deterministically nest tool calls under the correct agent via ACP `_meta` (`agentName`, `parentToolCallId`).
- Tools: show agent INPUT/OUTPUT for each agent task, even when sub-tools exist.
- UI: Copy actions are icon-only (no "Copy" button text).
- UI: tool counts no longer double-count agents as tools.

## 0.1.13 (2026-02-08)

### Fixes

- UI: simplify Agents-as-Tools display by showing the agent tool `title` as-is (keep `agent/<name>` prefix); remove client-side parsing/guessing from tool input/title. Grouping still uses ACP `_meta.parentToolCallId`.

## 0.1.14 (2026-02-08)

### Fixes

- Tests: make `npm test` work in headless Linux by auto-wrapping `vscode-test` with `xvfb-run` when no `$DISPLAY` is set.

## 0.1.15 (2026-02-08)

### Chore

- Version bump for release/install.

## 0.1.16 (2026-02-08)

### Fixes

- Tools: preserve chronological order (show top-level tools before Agents-as-Tools when they happened first).

## 0.1.17 (2026-02-08)

### UI

- Agents-as-Tools: render agent tool calls using the same framed Tool UI as regular tools (no vertical stripes).
- Agents-as-Tools: inside agent frames, order sections as `INPUT → tool calls → OUTPUT`.

## 0.1.18 (2026-02-08)

### UI

- Streaming: replace the old Reasoning/Processing chain-of-thought widget with a single framed execution block.
- Execution block: show `Input → Reasoning (when present) → Calls → Output`, then render the final answer below.
- Tools: show tool count as the same pill style as agent count.
- Tool details: show Input/Output inside collapsible frames for both tools and agents.

## 0.1.19 (2026-02-08)

### UI

- Execution block: fix duplicated/incorrectly running StratoProject frames by keeping a single unified run (tools + output) in message history.
- Execution block: remove the extra "Calls" header row; add inner padding so tool/agent frames don't stick to the edge.
- Composer: add an icon-only **Reload** button to reload the ACP webview without `Developer: Reload Window`.
- Composer: add **Stop** (square) button when the agent is running and the input is empty (sends ACP `cancel`).
- Composer: queue follow-up messages while busy; queued items support restore-to-edit (`...`) and delete (trash).
- Mode labels: prefer agent-cased display names when mode ids are lowercased (e.g. `stratoproject` → `StratoProject`).

## 0.1.20 (2026-02-09)

### UI

- Hierarchy: add a `Line | Frame` toggle (default: **Line**) to reduce deep nesting noise.
- IO frames: Input/Output blocks now respect the same hierarchy style as tools/agents.

### Fixes

- Multi-panel: isolate agent/mode/model selections and session history per ACP panel (no cross-panel message leakage).
- Streaming: ignore late tool updates after stream end (prevents a duplicate StratoProject frame getting stuck in `Running`).
- Tools: show tool output even when the agent only provides it on `tool_call` (start) rather than `tool_call_update` (Codex CLI `Read ...`).
