# ACP Plugin Monorepo Session Tasks (2026-02-10)

This file tracks the main tasks done as part of the `0.1.21` release work.

## Completed

- [x] Add standalone `acp-chat/` (web + server bridge) alongside the VS Code extension.
- [x] Extract shared UI into `packages/acp-ui/` and reuse it in both the extension webview and `acp-chat`.
- [x] Fix `acp-chat` production crash caused by duplicate React copies (dedupe `react`/`react-dom` in Vite config).
- [x] Add Playwright smoke tests for Mode A (agents-dev web) and Mode B (VS Code Electron, opt-in via `ACP_E2E_RUN_VSCODE=1`).
- [x] Add a text-only MCP smoke runbook for agents-dev UI verification: `e2e/mode-b-mcp.md`.
- [x] Update docs: `README.md`, `AGENTS.md`, `CHANGELOG.md`.
- [x] Bump version to `0.1.21` and package `acp-plugin-0.1.21.vsix`.

## Pending

- [ ] Install `acp-plugin-0.1.21.vsix` on the local VS Code instance (not possible from this remote host without the local `code` CLI).
- [ ] Create GitHub tag + release for `v0.1.21` and upload the `.vsix` as a release asset.
