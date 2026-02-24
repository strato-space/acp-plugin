import * as vscode from "vscode";
import { ChatPanelManager } from "./views/chatPanel";
import { setCustomAgents, type AgentConfig } from "./acp/agents";
import * as os from "os";
import * as fs from "fs";
import * as path from "path";
import {
  getAgentServers,
  getIncludeBuiltins,
  isRecord,
  mergeScopedExternalSettings,
  parseJsonc,
  toAgentConfigsFromServers,
  type AgentServerSetting,
} from "@strato-space/acp-runtime-shared";

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
  const candidates: Array<{ path: string; scope: "global" | "workspace" }> = [];
  const seenCandidates = new Set<string>();
  const pushCandidate = (candidate: {
    path: string;
    scope: "global" | "workspace";
  }) => {
    const normalizedPath = path.normalize(candidate.path);
    const key = `${candidate.scope}:${normalizedPath}`;
    if (seenCandidates.has(key)) return;
    seenCandidates.add(key);
    candidates.push({ ...candidate, path: normalizedPath });
  };

  pushCandidate({
    path: path.join(os.homedir(), ".vscode", "settings.json"),
    scope: "global",
  });
  // Remote-SSH / server-side VS Code settings.
  pushCandidate({
    path: path.join(os.homedir(), ".vscode-server", "data", "Machine", "settings.json"),
    scope: "global",
  });
  pushCandidate({
    path: path.join(os.homedir(), ".vscode-server", "data", "User", "settings.json"),
    scope: "global",
  });

  for (const folder of vscode.workspace.workspaceFolders ?? []) {
    pushCandidate({
      path: path.join(folder.uri.fsPath, ".vscode", "settings.json"),
      scope: "workspace",
    });
  }
  const workspaceFilePath = vscode.workspace.workspaceFile?.fsPath;
  if (workspaceFilePath) {
    pushCandidate({
      path: path.join(path.dirname(workspaceFilePath), ".vscode", "settings.json"),
      scope: "workspace",
    });
  }

  const scopedEntries: Array<{
    scope: "global" | "workspace";
    servers: Record<string, AgentServerSetting>;
    includeBuiltins?: boolean;
    sourcePath: string;
  }> = [];

  for (const candidate of candidates) {
    const p = candidate.path;
    try {
      if (!fs.existsSync(p)) continue;
      const raw = fs.readFileSync(p, "utf8");
      const parsed = parseJsonc(raw);
      if (!isRecord(parsed)) continue;

      const include = getIncludeBuiltins(parsed);
      const servers = getAgentServers(parsed);
      if (Object.keys(servers).length === 0 && include === undefined) {
        continue;
      }
      scopedEntries.push({
        scope: candidate.scope,
        servers,
        includeBuiltins: include,
        sourcePath: p,
      });
    } catch (err) {
      // Ignore invalid JSON / permission issues. Users can still rely on VS Code config.
      console.log("[ACP] Failed to load external settings:", p, err);
    }
  }
  const merged = mergeScopedExternalSettings(scopedEntries);

  return {
    servers: merged.servers,
    includeBuiltInAgents: merged.includeBuiltins,
    sourcePath: merged.sourcePath,
  };
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

  const agents: AgentConfig[] = toAgentConfigsFromServers(servers, {
    expandVars,
    ensureWatchForTransportAcp: true,
  });

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
