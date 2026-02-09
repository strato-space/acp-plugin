# ACP | Agent Client Protocol (VS Code)

> AI coding agents in VS Code via the Agent Client Protocol (ACP).

ACP Plugin lets you chat with ACP-compatible coding agents directly in your editor. It can auto-detect common agents on your `PATH` and also supports custom agent definitions via settings (similar to Zed's `agent_servers`).

![ACP Screenshot](assets/acp-sidebar.png)

## Features

- **Multi-agent support** (built-in + custom)
- **Native chat UI** with streaming responses
- **Multi-tab chat** sessions
- **Execution details** block: **Input → Reasoning → Calls → Output**
- **Tool visibility** with expandable **Input** and **Output**
- **Stop + queued follow-ups** while an agent is running
- **Icon-only Reload** button to refresh the ACP webview without reloading VS Code
- **Rich Markdown** + syntax highlighting
- **ANSI output rendering**
- **File & code attachments**

## Installation

This milestone focuses on a rebrand + UI/bugfixes and is typically installed via a VSIX artifact.

1. In VS Code: Extensions view → `...` → **Install from VSIX...**
2. Or via CLI:

```bash
code --install-extension /path/to/acp-plugin.vsix --force
```

## Requirements

Install at least one ACP-compatible agent and ensure it is on your `PATH`:

- **Claude Code**: `npm install -g @anthropic-ai/claude-code`
- **OpenCode**: `npm install -g opencode`
- **Codex CLI**: install your preferred Codex CLI build
- **Gemini CLI**: `npm install -g @google/gemini-cli`

## Usage

1. Click the **ACP** icon in the Activity Bar
2. Or run **`ACP: Start Chat`** from the Command Palette
3. Select an agent in the dropdown and start chatting

### Add Your Own Agent

Add a custom agent definition in VS Code settings (User or Workspace):

```jsonc
{
  "acp.agentServers": {
    "stratoproject": {
      "type": "custom",
      "name": "StratoProject",
      "command": "uv",
      "args": [
        "--directory",
        "/home/strato-space/prompt/StratoProject/app",
        "run",
        "StratoProject.py",
        "--transport",
        "acp",
      ],
      "env": {
        "PYTHONUNBUFFERED": "1",
      },
    },
  },
}
```

If you want to hide the built-in agents:

```jsonc
{ "acp.includeBuiltInAgents": false }
```

### Connection Timeout

If an agent takes a long time to start/initialize, increase:

```jsonc
{ "acp.connectTimeoutMs": 600000 }
```

## License

Apache 2.0. See `LICENSE`.
