# ACP Plugin Monorepo (VS Code + Web)

ACP Plugin is a VS Code extension and a standalone web UI for running ACP (Agent Client Protocol) agents.

![ACP Screenshot](assets/acp-sidebar.png)

## What’s In Here

- VS Code extension (entrypoint: `src/extension.ts`)
- Shared React UI package: `packages/acp-ui/` (used by both the extension webview and `acp-chat`)
- Standalone web app + server bridge: `acp-chat/`

## VS Code Extension

### Dev

```bash
cd /home/tools/acp-plugin
npm ci
npm run watch
```

Then use **Run Extension** from `.vscode/launch.json`.

### Package (VSIX)

```bash
cd /home/tools/acp-plugin
npm ci
npm run package
npx vsce package --no-dependencies

# Install locally
code --install-extension ./acp-plugin-<version>.vsix --force
```

Remote-SSH install (try all VS Code Server sockets):

```bash
VSIX=/home/tools/acp-plugin/acp-plugin-<version>.vsix

for s in /run/user/$(id -u)/vscode-ipc-*.sock; do
  echo "Trying $s"
  VSCODE_IPC_HOOK_CLI="$s" code --install-extension "$VSIX" --force && break
done
```

## Web UI (`acp-chat`)

`acp-chat` serves a browser UI and a WebSocket bridge that spawns an ACP agent per connection.

### Run Locally

```bash
cd /home/tools/acp-plugin/acp-chat
npm ci
npm run build

ACP_CHAT_HOST=127.0.0.1 ACP_CHAT_PORT=8732 ACP_CHAT_AUTH_TOKEN=devtoken \
  npm run start
```

Open:

- `http://127.0.0.1:8732/?token=devtoken`

### Hosted Dev (agents-dev)

- Base URL: `https://agents-dev.stratospace.fun`
- Auth: append `?token=<ACP_CHAT_AUTH_TOKEN>` (or use `Authorization: Bearer <token>` for `/ws`)

### Deploy (nginx + systemd)

Templates live in:

- `acp-chat/deploy/nginx/agents-dev.conf`
- `acp-chat/deploy/systemd/acp-chat.service`

Runtime env vars used by the server:

- `ACP_CHAT_HOST` (default `127.0.0.1`)
- `ACP_CHAT_PORT` (default `8732`)
- `ACP_CHAT_AUTH_TOKEN` (recommended; requires `?token=...` or `Authorization: Bearer ...`)
- `ACP_CONNECT_TIMEOUT_MS` (default `600000`)
- `ACP_APP_VERSION` / `ACP_CHAT_VERSION` (optional override; otherwise uses repo `package.json` version)

## Agent Configuration

ACP intentionally follows Zed's `agent_servers` format (same keys/shape as `zed.dev`), so you can copy/paste agent definitions between Zed and ACP with minimal changes.

Both the extension and `acp-chat` read agent configs from VS Code settings:

- `agent_servers` (Zed format; recommended)
- `acp.agent_servers` (namespaced alias)
- `acp.agentServers` (legacy alias)
- `acp.includeBuiltInAgents`
- `acp.connectTimeoutMs`

Example:

```jsonc
{
  "agent_servers": {
    "StratoProject": {
      "type": "custom",
      "command": "uv",
      "args": [
        "--directory",
        "/home/strato-space/prompt/StratoProject/app",
        "run",
        "--active",
        "StratoProject.py",
        "--transport",
        "acp",
      ],
      "env": { "PYTHONUNBUFFERED": "1" }
    }
  }
}
```

Notes:

- Built-ins include `opencode`, `claude-code` (via `npx @zed-industries/claude-code-acp`), `codex`, `gemini`.
- Custom agents using `--transport acp` automatically get `--watch` appended (AgentCard hot reload).

## Tests

Extension host tests:

```bash
cd /home/tools/acp-plugin
npm test
```

Playwright smoke (agents-dev web):

```bash
cd /home/tools/acp-plugin
ACP_AGENTS_DEV_TOKEN=... npm run test:e2e
```

Optional: VS Code smoke (Electron):

```bash
cd /home/tools/acp-plugin
ACP_E2E_RUN_VSCODE=1 npm run test:e2e
```

Manual MCP runbook (for LLM-driven UI checks):

- `e2e/mode-b-mcp.md`

## License

Apache 2.0. See `LICENSE`.
