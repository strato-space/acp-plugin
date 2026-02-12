# Changelog

## Upstream / Attribution

ACP Plugin started as an extraction/fork of `cosmos-vibe/Nexus-acp` and has since been rebranded and evolved independently.

Upstream attribution / prior art:

- `cosmos-vibe/Nexus-acp`
- `omercnet/vscode-acp`
- `zed` (agent_servers format + ACP agent CLIs)

## 2026-02-12

### PROBLEM SOLVED

- 06:40 - Tool-call blocks showed the first five regular tools instead of the freshest ones, so long runs hid the newest activity by default.
- 06:45 - Run frame collapse state and tool list `Show more/Show less` state reset between responses, forcing users to repeat the same UI actions every turn.
- 06:50 - Narrow viewport layouts could lose usable width (especially with an open sidebar), reducing readability and causing avoidable wrapping/overflow pressure.

### FEATURE IMPLEMENTED

- 06:55 - Added a sliding tool-call window that keeps task/agent rows visible and shows the five most recent regular tool calls by default.
- 06:58 - Added sticky UI preferences for run-frame collapsed/expanded state and tool-list `Show more/Show less`, persisted in webview state and reused for subsequent messages.
- 07:00 - Added shared UI unit tests for tool visibility behavior and wired them into repo scripts.
- 07:04 - Implemented explicit reasoning control for Codex CLI and Fast Agent ACP (with persisted preference and end-to-end host/server propagation).
- 07:05 - Enabled Fast Agent ACP shell mode by default in built-in presets (`uvx fast-agent-acp --shell --model codex`) for filesystem/shell-capable flows.

### CHANGES

- 06:55 - Refactored tool visibility logic into `packages/acp-ui/src/components/tools/toolListVisibility.ts` and switched `ToolList` to `getVisibleToolIds(...)` with newest-five behavior.
- 06:58 - Extended shared store/types and webview state persistence with `runFrameOpenByDefault` and `toolListShowAllByDefault` (`schemaVersion: 8`) in:
  - `packages/acp-ui/src/store/index.ts`
  - `packages/acp-ui/src/types.ts`
  - `packages/acp-ui/src/hooks/useVsCodeApi.ts`
- 06:59 - Updated run frame behavior so `ToolFrame` open/close preference is remembered and propagated via store (`packages/acp-ui/src/components/chat/RunFrame.tsx`).
- 07:00 - Improved responsive behavior for narrow screens in shared UI (mobile-safe sidebar offset and tighter chat/input spacing) in:
  - `packages/acp-ui/src/App.tsx`
  - `packages/acp-ui/src/components/chat/ChatContainer.tsx`
  - `packages/acp-ui/src/components/chat/MessageBubble.tsx`
  - `packages/acp-ui/src/components/chat/StreamingMessage.tsx`
  - `packages/acp-ui/src/components/input/ChatInput.tsx`
  - `packages/acp-ui/src/components/ai/tool.tsx`
- 07:01 - Added shared UI unit test `packages/acp-ui/src/components/tools/toolListVisibility.test.ts` and new script `npm run test:webview:unit` in `package.json`; excluded `*.test.ts` from webview/`acp-chat` web tsconfig builds.
- 07:03 - Updated documentation for new behavior and workflows in `README.md` and `AGENTS.md`.
- 07:04 - Added reasoning-selection protocol handling in both extension and web bridge:
  - VS Code host: `src/views/chatPanel.ts`
  - acp-chat server: `acp-chat/server/src/index.ts`
  - UI store/types/hooks/components: `packages/acp-ui/src/store/index.ts`, `packages/acp-ui/src/types.ts`, `packages/acp-ui/src/hooks/useVsCodeApi.ts`, `packages/acp-ui/src/components/input/SettingsDropdown.tsx`, `packages/acp-ui/src/components/layout/OptionsBar.tsx`
- 07:05 - Updated built-in Fast Agent preset and tests in:
  - `src/acp/agents.ts`
  - `acp-chat/server/src/acp/agents.ts`
  - `src/test/agents.test.ts`
- 07:06 - Version bump for release packaging: `0.1.29` -> `0.1.30` (`package.json`, `package-lock.json`).

## 0.1.28 (2026-02-11)

### UI

- Preserve the `Reasoning` block after publish by storing streamed reasoning in message history instead of clearing it at stream end.
- Agent selector: separate built-in and custom agents with a thin visual divider when both groups are present.

### Features

- Built-in agents: add `fast-agent-acp` in position #2 (right after `codex`) with default command `uvx fast-agent-acp --model codex`.
- Agent metadata: include `source` (`builtin` or `custom`) in extension/server payloads so UI can render grouped agent lists deterministically.

### Fixes

- Workspace settings discovery: remove hardcoded workspace paths and resolve workspace `settings.json` dynamically from opened workspace roots.
- `acp-chat` external settings loader: walk up from current working directory to discover workspace-level `.vscode/settings.json` (including `/home/.vscode/settings.json` setups).

### Docs

- README: add `fast-agent-acp` to pre-configured agents and note model behavior.
- README: clarify workspace settings path resolution (example for workspace root `/home`).

## 0.1.27 (2026-02-11)

### Docs

- AGENTS.md: refresh build/install instructions to repo-root-relative commands only; update Remote-SSH install flow to use `$XDG_RUNTIME_DIR`.
- README: add explicit troubleshooting note for missing custom agents (`acp.agentServers` -> `agent_servers` / `acp.agents`).
- README: update Zed reference link to the current External Agents docs page.

### Fixes

- Settings compatibility: migrate active workspace settings from deprecated `acp.agentServers` to canonical `agent_servers` so custom agents are discovered again.

## 0.1.25 (2026-02-11)

### Features

- Config: make `agent_servers` the canonical agent config format and keep `acp.agents` as an upstream-compatible alias (`formulahendry/vscode-acp`).
- Config: merge agents from `acp.agents` and canonical `agent_servers` (higher priority overrides).
- Settings: implement upstream-compatible settings: `acp.autoApprovePermissions`, `acp.defaultWorkingDirectory`, `acp.logTraffic`.
- UI: add a sticky thread header with Settings + New chat buttons (plus Reload).

### Fixes

- Remove deprecated `agentServers` / `acp.agent_servers` keys (keep only `agent_servers` + `acp.agents`).
- Branding: rename titles/tooltips from "Agent Communication Protocol" to "ACP Plugin".

### Docs

- README: rewrite and expand docs (config schema, presets, settings, and fork rationale).
- Repo path: canonical local workspace path moved under `/home/tools/acp/strato-space/acp-plugin` (without symlink fallback).

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
- Update UI titles/tooltips to **ACP Plugin**.

## 0.1.10 (2026-02-07)

### UI

- Update the activity bar title/tooltips to **ACP Plugin**.
- Sidebar: use the editor background (theme-aligned) and update the header logo to the ACP mark.
- Thinking: replace the Processing brain icon with a running ellipsis and align its tone with Reasoning.

## 0.1.11 (2026-02-07)

### Fixes

- Agents: retry applying agent settings on activation and refresh on workspace folder changes so custom agents show up reliably.
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

- Monorepo UI: extract the shared React UI + Zustand store + types into `packages/acp-ui` and reuse it for both the VS Code webview and `acp-chat`.
- Hierarchy: default to **Frame**. The `Line | Frame` selector is temporarily hidden in Settings (kept in code for later iteration).
- IO frames: Input/Output blocks use the same hierarchy style as tools/agents.

### Fixes

- Multi-panel: isolate agent/mode/model selections and session history per ACP panel (no cross-panel message leakage).
- Streaming: ignore late tool updates after stream end (prevents a duplicate StratoProject frame getting stuck in `Running`).
- Tools: show tool output even when the agent only provides it on `tool_call` (start) rather than `tool_call_update` (Codex CLI `Read ...`).
- acp-chat: report the monorepo version in the UI (e.g. `ACP v0.1.20`) instead of a service name.
- acp-chat: do not overwrite client-side sessions with an empty server list (sessions are local in the web service for now).

## 0.1.21 (2026-02-10)

### Fixes

- acp-chat: fix production crash caused by duplicate React copies by deduping `react`/`react-dom` in Vite config.
- acp-chat: bump the fallback `appInfo.version` to match the monorepo release version.

### Tests

- E2E: add Playwright smoke tests for agents-dev (Mode A) and VS Code (Mode B, opt-in via `ACP_E2E_RUN_VSCODE=1`).
- E2E: move Playwright `testDir` to `e2e/` and make the Chrome channel optional (`PW_CHROME_CHANNEL`).

### Docs

- README: rewrite monorepo docs (extension + `acp-chat` + dev/build/test workflows).
- Add a text-based MCP smoke runbook for Mode B (`e2e/mode-b-mcp.md`).

## 0.1.22 (2026-02-10)

### Features

- Config: support Zed-compatible `agent_servers` settings and add `acp.agents` alias (upstream `formulahendry/vscode-acp` compatibility).

### Docs

- README: document fork rationale and upstream attribution.

### Chore

- E2E: add `e2e/tsconfig.json` so IDEs resolve Node built-in typings in `e2e/*.ts`.
