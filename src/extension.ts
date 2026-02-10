import * as vscode from "vscode";
import { ChatPanelManager } from "./views/chatPanel";
import { setCustomAgents, type AgentConfig } from "./acp/agents";
import * as os from "os";
import * as fs from "fs";
import * as path from "path";

let chatPanelManager: ChatPanelManager | undefined;
let statusBarItem: vscode.StatusBarItem | undefined;

export function activate(context: vscode.ExtensionContext) {
  console.log("ACP extension is now active");

  // Apply agent settings before creating any panels, so saved agent IDs can resolve.
  applyAgentSettings();

  context.subscriptions.push(
    vscode.commands.registerCommand("acp.openDevTools", () => {
      vscode.commands.executeCommand(
        "workbench.action.webview.openDeveloperTools"
      );
    })
  );

  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100
  );
  statusBarItem.command = "acp.startChat";
  updateStatusBar("disconnected");
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  const activityBarViewProvider: vscode.TreeDataProvider<never> = {
    getTreeItem: () => {
      throw new Error("No items");
    },
    getChildren: () => [],
  };
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider(
      "acp.welcomeView",
      activityBarViewProvider
    )
  );

  // ChatPanelManager 생성 시 상태 변경 콜백 전달
  chatPanelManager = new ChatPanelManager(
    context.extensionUri,
    context.globalState,
    context.extension.packageJSON?.version,
    (state) => updateStatusBar(state)
  );

  const reapplyAgentSettings = () => {
    try {
      applyAgentSettings();
      chatPanelManager?.refreshAgents();
    } catch (err) {
      console.log("[ACP] applyAgentSettings failed", err);
    }
  };

  // In some VS Code activation sequences (notably in Extension Development Host and Remote-SSH),
  // workspace settings can be populated after activation. Re-apply a few times shortly after
  // startup so custom agents defined in settings reliably show up without requiring a reload.
  const retryDelaysMs = [0, 250, 2000];
  for (const delay of retryDelaysMs) {
    const t = setTimeout(reapplyAgentSettings, delay);
    context.subscriptions.push({
      dispose: () => clearTimeout(t),
    });
  }

  // If workspace folders change (multi-root / reopen), refresh agent settings.
  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      reapplyAgentSettings();
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (
        e.affectsConfiguration("acp.agentServers") ||
        e.affectsConfiguration("acp.agent_servers") ||
        // Zed-compatible keys (non-namespaced). We read these from settings.json too.
        e.affectsConfiguration("agent_servers") ||
        e.affectsConfiguration("assistant.agent_servers") ||
        e.affectsConfiguration("acp.includeBuiltInAgents") ||
        // Backward-compat: accept legacy Nexus settings if users haven't migrated.
        e.affectsConfiguration("nexus.agentServers") ||
        e.affectsConfiguration("nexus.agent_servers") ||
        e.affectsConfiguration("nexus.includeBuiltInAgents")
      ) {
        reapplyAgentSettings();
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("acp.startChat", async () => {
      chatPanelManager?.showOrCreatePanel();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("acp.focusChat", async () => {
      if (chatPanelManager?.hasVisiblePanel()) {
        chatPanelManager.createNewPanel();
      } else {
        chatPanelManager?.showOrCreatePanel();
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("acp.newChat", () => {
      chatPanelManager?.newChat();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("acp.newChatWindow", async () => {
      chatPanelManager?.createNewPanel();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("acp.clearChat", () => {
      chatPanelManager?.clearChat();
    })
  );

  // 에디터 컨텍스트 메뉴: 선택한 코드를 채팅에 첨부
  context.subscriptions.push(
    vscode.commands.registerCommand("acp.attachSelection", () => {
      chatPanelManager?.showOrCreatePanel();
      chatPanelManager?.attachSelectedCode();
    })
  );

  // 파일 탐색기 컨텍스트 메뉴: 파일을 채팅에 첨부
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "acp.attachFile",
      async (uri: vscode.Uri) => {
        chatPanelManager?.showOrCreatePanel();
        if (uri) {
          await chatPanelManager?.attachFile(uri);
        }
      }
    )
  );

  context.subscriptions.push({
    dispose: () => {
      chatPanelManager?.dispose();
    },
  });
}

type AgentServerSetting = {
  type?: string;
  name?: string;
  command?: string;
  args?: unknown;
  cwd?: string;
  env?: Record<string, string>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function expandVars(value: string): string {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  return value.replace(/\$\{([^}]+)\}/g, (_m, key: string) => {
    if (key === "workspaceFolder") return workspaceFolder ?? "";
    if (key === "userHome") return os.homedir();
    if (key.startsWith("env:")) {
      const envKey = key.slice("env:".length);
      return process.env[envKey] ?? "";
    }
    return "";
  });
}

type ExternalSettingsLoadResult = {
  servers: Record<string, AgentServerSetting>;
  includeBuiltInAgents?: boolean;
  sourcePath?: string;
};

function tryLoadExternalSettings(): ExternalSettingsLoadResult {
  const candidates = [
    path.join(os.homedir(), ".vscode", "settings.json"),
    // Remote-SSH / server-side VS Code settings.
    path.join(os.homedir(), ".vscode-server", "data", "Machine", "settings.json"),
    path.join(os.homedir(), ".vscode-server", "data", "User", "settings.json"),
    // Common shared workspace setup in this environment.
    "/home/.vscode/settings.json",
    "/home/strato-space/.vscode/settings.json",
  ];

  for (const p of candidates) {
    try {
      if (!fs.existsSync(p)) continue;
      const raw = fs.readFileSync(p, "utf8");
      const parsed = parseJsonc(raw);
      if (!isRecord(parsed)) continue;

      const include = (() => {
        const v =
          parsed["acp.includeBuiltInAgents"] ??
          parsed["nexus.includeBuiltInAgents"];
        return typeof v === "boolean" ? v : undefined;
      })();

      const serversCandidate = (() => {
        const v =
          parsed["acp.agentServers"] ??
          parsed["acp.agent_servers"] ??
          parsed["nexus.agentServers"] ??
          parsed["nexus.agent_servers"] ??
          parsed["agentServers"] ??
          parsed["agent_servers"];
        return isRecord(v) ? (v as Record<string, AgentServerSetting>) : {};
      })();

      if (Object.keys(serversCandidate).length > 0 || include !== undefined) {
        return {
          servers: serversCandidate,
          includeBuiltInAgents: include,
          sourcePath: p,
        };
      }
    } catch (err) {
      // Ignore invalid JSON / permission issues. Users can still rely on VS Code config.
      console.log("[ACP] Failed to load external settings:", p, err);
    }
  }

  return { servers: {} };
}

function stripJsonComments(input: string): string {
  let out = "";
  let inString = false;
  let quote = '"';
  let escaping = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    const n = i + 1 < input.length ? input[i + 1] : "";

    if (inLineComment) {
      if (c === "\n") {
        inLineComment = false;
        out += c;
      }
      continue;
    }

    if (inBlockComment) {
      if (c === "*" && n === "/") {
        inBlockComment = false;
        i++;
      }
      continue;
    }

    if (inString) {
      out += c;
      if (escaping) {
        escaping = false;
      } else if (c === "\\") {
        escaping = true;
      } else if (c === quote) {
        inString = false;
      }
      continue;
    }

    if (c === '"' || c === "'") {
      inString = true;
      quote = c;
      out += c;
      continue;
    }

    if (c === "/" && n === "/") {
      inLineComment = true;
      i++;
      continue;
    }
    if (c === "/" && n === "*") {
      inBlockComment = true;
      i++;
      continue;
    }

    out += c;
  }

  return out;
}

function removeTrailingCommas(input: string): string {
  let out = "";
  let inString = false;
  let quote = '"';
  let escaping = false;

  for (let i = 0; i < input.length; i++) {
    const c = input[i];

    if (inString) {
      out += c;
      if (escaping) {
        escaping = false;
      } else if (c === "\\") {
        escaping = true;
      } else if (c === quote) {
        inString = false;
      }
      continue;
    }

    if (c === '"' || c === "'") {
      inString = true;
      quote = c;
      out += c;
      continue;
    }

    if (c === ",") {
      // Skip comma if it's followed only by whitespace and then a closing bracket/brace.
      let j = i + 1;
      while (j < input.length && /\s/.test(input[j])) j++;
      const next = j < input.length ? input[j] : "";
      if (next === "}" || next === "]") {
        continue;
      }
    }

    out += c;
  }

  return out;
}

function parseJsonc(raw: string): unknown {
  const noBom = raw.replace(/^\uFEFF/, "");
  try {
    return JSON.parse(noBom) as unknown;
  } catch {
    // VS Code/JSONC settings often contain comments and trailing commas.
    const stripped = removeTrailingCommas(stripJsonComments(noBom));
    try {
      return JSON.parse(stripped) as unknown;
    } catch {
      return null;
    }
  }
}

function applyAgentSettings(): void {
  const cfg = vscode.workspace.getConfiguration("acp");
  const legacy = vscode.workspace.getConfiguration("nexus");
  const root = vscode.workspace.getConfiguration();

  // Primary: `acp.*` settings.
  let includeBuiltInAgents = cfg.get<boolean>("includeBuiltInAgents", true);
  const acpServersSnake =
    cfg.get<Record<string, AgentServerSetting>>("agent_servers", {}) ?? {};
  const acpServersCamel =
    cfg.get<Record<string, AgentServerSetting>>("agentServers", {}) ?? {};

  const zedServersRoot = (() => {
    const v = root.get<unknown>("agent_servers");
    return isRecord(v) ? (v as Record<string, AgentServerSetting>) : {};
  })();

  const zedServersAssistant = (() => {
    const v = root.get<unknown>("assistant");
    if (!isRecord(v)) return {};
    const candidate =
      (v as Record<string, unknown>)["agent_servers"] ??
      (v as Record<string, unknown>)["agentServers"];
    return isRecord(candidate)
      ? (candidate as Record<string, AgentServerSetting>)
      : {};
  })();

  // We intentionally follow Zed's `agent_servers` format (snake_case). Prefer ACP
  // namespaced settings when both are present.
  let servers = {
    ...zedServersAssistant,
    ...zedServersRoot,
    ...acpServersSnake,
    ...acpServersCamel,
  };

  const external = tryLoadExternalSettings();
  if (external.servers && Object.keys(external.servers).length > 0) {
    // External settings act as a base layer; VS Code workspace/user settings override.
    servers = { ...external.servers, ...servers };
  }

  // Backward-compat: if users still have `nexus.*` configured, pick it up.
  if (!servers || Object.keys(servers).length === 0) {
    const legacyServers =
      legacy.get<Record<string, AgentServerSetting>>("agentServers", {}) ?? {};
    if (legacyServers && Object.keys(legacyServers).length > 0) {
      servers = legacyServers;
    }
  }

  // Prefer explicitly set `acp.includeBuiltInAgents`, otherwise fall back to legacy.
  // This avoids surprising behavior when migrating only agentServers.
  const acpIncludeInspect = cfg.inspect<boolean>("includeBuiltInAgents");
  const hasAcpInclude =
    acpIncludeInspect?.globalValue !== undefined ||
    acpIncludeInspect?.workspaceValue !== undefined ||
    acpIncludeInspect?.workspaceFolderValue !== undefined;
  if (!hasAcpInclude) {
    includeBuiltInAgents = legacy.get<boolean>("includeBuiltInAgents", true);
  }

  // If neither workspace nor user set the option explicitly, allow the external settings file
  // to provide a default.
  if (!hasAcpInclude && external.includeBuiltInAgents !== undefined) {
    includeBuiltInAgents = external.includeBuiltInAgents;
  }

  try {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    console.log(
      `[ACP] applyAgentSettings: workspaceFolder=${workspaceFolder ?? "(none)"} ` +
        `includeBuiltInAgents=${includeBuiltInAgents} ` +
        `agentServersKeys=${Object.keys(servers).join(",") || "(none)"} ` +
        `externalSettings=${external.sourcePath ?? "(none)"}`
    );
  } catch (err) {
    console.log("[ACP] applyAgentSettings: failed to log settings", err);
  }

  const agents: AgentConfig[] = [];
  for (const [id, raw] of Object.entries(servers)) {
    if (!raw || typeof raw !== "object") continue;

    const command = raw.command;
    if (!command || typeof command !== "string") continue;

    const rawArgs: string[] = Array.isArray(raw.args)
      ? raw.args.filter((a): a is string => typeof a === "string")
      : [];

    const expandedArgs = rawArgs.map(expandVars);

    const hasTransportAcp = (argv: string[]) => {
      for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === "--transport") {
          const next = argv[i + 1];
          if (typeof next === "string" && next.toLowerCase() === "acp") return true;
        }
        const lower = a.toLowerCase();
        if (lower.startsWith("--transport=")) {
          const value = lower.slice("--transport=".length);
          if (value === "acp") return true;
        }
      }
      return false;
    };

    const ensureWatch = (argv: string[]) => {
      // fast-agent supports `--watch` to reload AgentCard changes dynamically.
      // Only apply it when the agent explicitly uses ACP transport.
      if (!hasTransportAcp(argv)) return argv;
      if (argv.includes("--watch")) return argv;
      return [...argv, "--watch"];
    };

    agents.push({
      id,
      name: raw.name && typeof raw.name === "string" ? raw.name : id,
      command: expandVars(command),
      args: ensureWatch(expandedArgs),
      cwd: raw.cwd ? expandVars(raw.cwd) : undefined,
      env: raw.env,
    });
  }

  try {
    console.log(
      `[ACP] applyAgentSettings: customAgentsBuilt=${agents.length} includeBuiltins=${includeBuiltInAgents}`
    );
  } catch (err) {
    console.log("[ACP] applyAgentSettings: failed to log built agents", err);
  }

  setCustomAgents({ includeBuiltins: includeBuiltInAgents, agents });
}

function updateStatusBar(
  state: "disconnected" | "connecting" | "connected" | "error"
): void {
  if (!statusBarItem) return;

  const base = "ACP — Agent Communication Protocol";
  const version = vscode.extensions.getExtension("strato-space.acp-plugin")
    ?.packageJSON?.version as string | undefined;
  const versionSuffix = version ? ` v${version}` : "";

  const icons: Record<string, string> = {
    disconnected: "$(debug-disconnect)",
    connecting: "$(sync~spin)",
    connected: "$(check)",
    error: "$(error)",
  };

  const labels: Record<string, string> = {
    disconnected: "Disconnected",
    connecting: "Connecting...",
    connected: "Connected",
    error: "Error",
  };

  statusBarItem.text = `${icons[state] || icons.disconnected} ACP${versionSuffix}`;
  statusBarItem.tooltip = `${base}\nStatus: ${labels[state] || labels.disconnected}`;

  if (state === "error") {
    statusBarItem.backgroundColor = new vscode.ThemeColor(
      "statusBarItem.errorBackground"
    );
  } else if (state === "connecting") {
    statusBarItem.backgroundColor = new vscode.ThemeColor(
      "statusBarItem.warningBackground"
    );
  } else {
    statusBarItem.backgroundColor = undefined;
  }
}

export function deactivate() {
  console.log("ACP extension deactivating");
  chatPanelManager?.dispose();
}
