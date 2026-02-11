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
      chatPanelManager?.refreshRuntimeSettings();
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
        e.affectsConfiguration("acp.agents") ||
        // Zed-compatible keys (non-namespaced). We read these from settings.json too.
        e.affectsConfiguration("agent_servers") ||
        e.affectsConfiguration("acp.includeBuiltInAgents") ||
        e.affectsConfiguration("acp.defaultWorkingDirectory") ||
        e.affectsConfiguration("acp.autoApprovePermissions") ||
        e.affectsConfiguration("acp.logTraffic") ||
        e.affectsConfiguration("acp.connectTimeoutMs")
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
  const candidates: Array<{ path: string; scope: "global" | "workspace" }> = [
    {
      path: path.join(os.homedir(), ".vscode", "settings.json"),
      scope: "global",
    },
    // Remote-SSH / server-side VS Code settings.
    {
      path: path.join(os.homedir(), ".vscode-server", "data", "Machine", "settings.json"),
      scope: "global",
    },
    {
      path: path.join(os.homedir(), ".vscode-server", "data", "User", "settings.json"),
      scope: "global",
    },
    // Common shared workspace setup in this environment.
    { path: "/home/strato-space/.vscode/settings.json", scope: "workspace" },
    { path: "/home/user/workspace/.vscode/settings.json", scope: "workspace" },
  ];

  const globalServers: Record<string, AgentServerSetting> = {};
  const workspaceServers: Record<string, AgentServerSetting> = {};
  let includeGlobal: boolean | undefined;
  let includeWorkspace: boolean | undefined;
  const loadedPaths: string[] = [];

  for (const candidate of candidates) {
    const p = candidate.path;
    try {
      if (!fs.existsSync(p)) continue;
      const raw = fs.readFileSync(p, "utf8");
      const parsed = parseJsonc(raw);
      if (!isRecord(parsed)) continue;

      const include = (() => {
        const v = parsed["acp.includeBuiltInAgents"];
        return typeof v === "boolean" ? v : undefined;
      })();

      const serversCandidate = (() => {
        const merged: Record<string, AgentServerSetting> = {};

        const merge = (v: unknown) => {
          if (!isRecord(v)) return;
          Object.assign(merged, v as Record<string, AgentServerSetting>);
        };

        // Supported alias: `acp.agents` has the same shape as `agent_servers`.
        merge(parsed["acp.agents"]);

        // Canonical Zed-compatible key at root.
        merge(parsed["agent_servers"]);

        return merged;
      })();

      if (Object.keys(serversCandidate).length === 0 && include === undefined) {
        continue;
      }
      if (candidate.scope === "workspace") {
        Object.assign(workspaceServers, serversCandidate);
        if (include !== undefined) includeWorkspace = include;
      } else {
        Object.assign(globalServers, serversCandidate);
        if (include !== undefined) includeGlobal = include;
      }
      loadedPaths.push(p);
    } catch (err) {
      // Ignore invalid JSON / permission issues. Users can still rely on VS Code config.
      console.log("[ACP] Failed to load external settings:", p, err);
    }
  }

  const mergedServers = {
    ...globalServers,
    ...workspaceServers,
  };
  const includeBuiltInAgents =
    includeWorkspace !== undefined ? includeWorkspace : includeGlobal;

  return {
    servers: mergedServers,
    includeBuiltInAgents,
    sourcePath: loadedPaths.length > 0 ? loadedPaths.join(", ") : undefined,
  };
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
  const root = vscode.workspace.getConfiguration();

  const getScopedServers = (
    conf: vscode.WorkspaceConfiguration,
    key: string
  ): {
    global: Record<string, AgentServerSetting>;
    workspace: Record<string, AgentServerSetting>;
    workspaceFolder: Record<string, AgentServerSetting>;
  } => {
    const inspect = conf.inspect<unknown>(key);
    const toServers = (v: unknown) =>
      isRecord(v) ? (v as Record<string, AgentServerSetting>) : {};
    return {
      global: toServers(inspect?.globalValue),
      workspace: toServers(inspect?.workspaceValue),
      workspaceFolder: toServers(inspect?.workspaceFolderValue),
    };
  };

  const getScopedBoolean = (
    conf: vscode.WorkspaceConfiguration,
    key: string,
    base: boolean
  ): boolean => {
    const inspect = conf.inspect<unknown>(key);
    let result = base;
    if (typeof inspect?.globalValue === "boolean") result = inspect.globalValue;
    if (typeof inspect?.workspaceValue === "boolean") result = inspect.workspaceValue;
    if (typeof inspect?.workspaceFolderValue === "boolean")
      result = inspect.workspaceFolderValue;
    return result;
  };

  const external = tryLoadExternalSettings();

  // Scalar precedence is explicit: global < workspace < workspaceFolder.
  // External file value acts as the lowest fallback (before VS Code scoped settings).
  const includeBuiltInAgents = getScopedBoolean(
    cfg,
    "includeBuiltInAgents",
    external.includeBuiltInAgents ?? true
  );

  const acpServers = getScopedServers(cfg, "agents");
  const rootServers = getScopedServers(root, "agent_servers");

  // Agent map precedence:
  // external(global/workspace) < VS global < VS workspace < VS workspaceFolder.
  // Within each scope: `acp.agents` < `agent_servers`.
  const globalServers = {
    ...acpServers.global,
    ...rootServers.global,
  };
  const workspaceServers = {
    ...acpServers.workspace,
    ...rootServers.workspace,
  };
  const workspaceFolderServers = {
    ...acpServers.workspaceFolder,
    ...rootServers.workspaceFolder,
  };
  const servers = {
    ...external.servers,
    ...globalServers,
    ...workspaceServers,
    ...workspaceFolderServers,
  };

  try {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    console.log(
      `[ACP] applyAgentSettings: workspaceFolder=${workspaceFolder ?? "(none)"} ` +
        `includeBuiltInAgents=${includeBuiltInAgents} ` +
        `agentIds=${Object.keys(servers).join(",") || "(none)"} ` +
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

  const base = "ACP Plugin";
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
