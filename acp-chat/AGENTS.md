# Repository Guidelines

## Project Structure

- `web/`: React UI (ported from the VS Code ACP webview).
- `server/`: Node/TypeScript service that:
  - spawns an ACP agent per WebSocket connection (multi-user basic)
  - translates ACP events into the same message shape the webview expects
  - serves HTTP APIs and the static web bundle
- `deploy/`: nginx + systemd templates for the `agents-dev.stratospace.fun` deployment.

## Build, Test, and Development Commands

```bash
cd /home/tools/acp-chat
npm install

# build both workspaces
npm run build

# run server (serves `web/dist` and `/ws`)
ACP_CHAT_HOST=127.0.0.1 ACP_CHAT_PORT=8732 ACP_CHAT_AUTH_TOKEN=devtoken npm run start
```

Open `http://127.0.0.1:8732`.

## Auth

Recommended: set `ACP_CHAT_AUTH_TOKEN`.

- Browser WebSocket supports `Authorization: Bearer <token>` or `?token=<token>` query param.
- `.env` is supported for local/dev and is ignored by git (`.gitignore` includes `.env*`).

## Deployment Notes (agents-dev)

The dev endpoint is intended to be served via nginx at:

- `https://agents-dev.stratospace.fun`

DNS must point to the `p2` host:

- `agents-dev.stratospace.fun` CNAME -> `p2.stratospace.fun` (DNS-only), matching `voice-dev`/`voice`.

Templates:

- `deploy/nginx/agents-dev.conf`
- `deploy/systemd/acp-chat.service`

