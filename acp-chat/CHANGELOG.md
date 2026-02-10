# Changelog

## 2026-02-09
### PROBLEM SOLVED
- **06:56** `agents-dev.stratospace.fun` did not resolve, blocking access to the standalone ACP UI; added a Cloudflare CNAME to `p2.stratospace.fun` to bring the dev endpoint online.

### FEATURE IMPLEMENTED
- **06:56** Standalone ACP chat web service that runs the ACP UI in a browser with a Node bridge and WebSocket streaming (multi-user basic: one ACP agent per WebSocket connection).

### CHANGES
- **06:56** `server/`: Express + WebSocket bridge with `/api/health`, `/api/agents`, and `/ws` streaming.
- **06:56** `web/`: reuse the VS Code ACP webview UI with a WebSocket adapter layer.
- **06:56** `deploy/`: nginx + systemd templates for `agents-dev.stratospace.fun`.
- **06:56** Cloudflare DNS: add `agents-dev.stratospace.fun` CNAME -> `p2.stratospace.fun` (DNS-only).
- **06:56** `strato-space/settings`: route `acp-chat` + `acp-plugin` GitHub sources under the Copilot topic for Telegram changelog routing.
- **06:56** Docs: add `AGENTS.md` and expand `README.md` with auth/deploy guidance.

