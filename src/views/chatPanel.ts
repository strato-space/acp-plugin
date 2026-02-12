import * as vscode from "vscode";
import { randomUUID } from "crypto";
import * as os from "os";
import { ACPClient } from "../acp/client";
import {
  getAgent,
  getAgentsWithStatus,
  getFirstAvailableAgent,
} from "../acp/agents";
import type {
  SessionNotification,
  ContentBlock,
  RequestPermissionRequest,
  RequestPermissionResponse,
} from "@agentclientprotocol/sdk";

const PANEL_STORAGE_PREFIX = "acp.panels";
const panelStorageKey = (panelKey: string, key: string) =>
  `${PANEL_STORAGE_PREFIX}.${panelKey}.${key}`;

// Persist the last selection globally (not panel-scoped) so new panels can
// auto-select a sensible default without leaking messages/sessions between tabs.
const LAST_SELECTED_AGENT_STORAGE_KEY = "acp.lastSelectedAgent";
const LAST_SELECTED_MODE_STORAGE_KEY = "acp.lastSelectedMode";
const LAST_SELECTED_MODEL_STORAGE_KEY = "acp.lastSelectedModel";

interface StoredMessage {
  id: string;
  type: "user" | "assistant" | "error" | "system";
  text: string;
  html?: string;
  thinkingText?: string;
  timestamp: number;
  attachments?: Attachment[];
  tools?: Record<string, unknown>;
}

interface StoredSession {
  id: string;
  title: string;
  agentId: string;
  timestamp: number;
  messages: StoredMessage[];
}

interface Attachment {
  id: string;
  type: "file" | "image" | "code";
  name: string;
  content: string;
  path?: string;
  language?: string;
  lineRange?: [number, number];
  mimeType?: string;
}

interface WebviewMessage {
  type:
    | "sendMessage"
    | "cancel"
    | "ready"
    | "selectAgent"
    | "selectMode"
    | "selectModel"
    | "selectReasoning"
    | "connect"
    | "newChat"
    | "clearChat"
    | "copyMessage"
    | "selectFiles"
    | "selectImages"
    | "saveSession"
    | "loadSession"
    | "deleteSession"
    | "getSessions";
  text?: string;
  agentId?: string;
  modeId?: string;
  modelId?: string;
  reasoningId?: string;
  attachments?: Attachment[];
  session?: StoredSession;
  sessionId?: string;
}

const SELECTED_AGENT_STORAGE_KEY = "selectedAgent";
const SELECTED_MODE_STORAGE_KEY = "selectedMode";
const SELECTED_MODEL_STORAGE_KEY = "selectedModel";
const SELECTED_MODEL_AGENT_STORAGE_KEY = "selectedModelAgent";
const SELECTED_REASONING_STORAGE_KEY = "selectedReasoning";
const SELECTED_REASONING_AGENT_STORAGE_KEY = "selectedReasoningAgent";
const LAST_SELECTED_REASONING_STORAGE_KEY = "acp.lastSelectedReasoning";
const SESSIONS_STORAGE_KEY = "sessions";

type ReasoningLevel = "system" | "minimal" | "low" | "medium" | "high";

function normalizeReasoningLevel(value: string | undefined | null): ReasoningLevel {
  const v = (value || "").trim().toLowerCase();
  if (v === "minimal" || v === "low" || v === "medium" || v === "high") return v;
  return "system";
}

function isCodexAgent(agent: { id: string; name: string }): boolean {
  const id = agent.id.toLowerCase();
  if (id === "codex") return true;
  return agent.name.toLowerCase().includes("codex");
}

function isFastAgent(agent: { id: string; name: string }): boolean {
  const id = agent.id.toLowerCase();
  if (id === "fast-agent-acp") return true;
  return agent.name.toLowerCase().includes("fast agent");
}

function withModelReasoning(modelId: string, reasoning: ReasoningLevel): string {
  const raw = (modelId || "").trim();
  if (!raw) return raw;
  const q = raw.indexOf("?");
  const base = q === -1 ? raw : raw.slice(0, q);
  const query = q === -1 ? "" : raw.slice(q + 1);
  const params = new URLSearchParams(query);
  if (reasoning === "system") {
    params.delete("reasoning");
  } else {
    params.set("reasoning", reasoning);
  }
  const rest = params.toString();
  return rest ? `${base}?${rest}` : base;
}

function upsertArg(args: string[], key: string, value: string): string[] {
  const out = [...args];
  const eqPrefix = `${key}=`;
  for (let i = 0; i < out.length; i++) {
    const a = out[i];
    if (a === key) {
      if (i + 1 < out.length) out[i + 1] = value;
      else out.push(value);
      return out;
    }
    if (a.startsWith(eqPrefix)) {
      out[i] = `${key}=${value}`;
      return out;
    }
  }
  out.push(key, value);
  return out;
}

function removeCodexReasoningOverride(args: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "-c" || a === "--config") {
      const next = args[i + 1];
      if (typeof next === "string" && next.startsWith("model_reasoning_effort=")) {
        i += 1;
        continue;
      }
    }
    if (a.startsWith("model_reasoning_effort=")) continue;
    out.push(a);
  }
  return out;
}

// 각 패널의 독립적인 상태를 관리하는 컨텍스트
interface PanelContext {
  panel: vscode.WebviewPanel;
  panelKey: string;
  acpClient: ACPClient;
  hasSession: boolean;
  streamingText: string;
  hasRestoredModeModel: boolean;
  stderrBuffer: string;
}

export class ChatPanelManager {
  public static readonly viewType = "acp.chatPanel";

  private contexts: Map<string, PanelContext> = new Map();
  private activePanelId?: string;
  private panelCounter = 0;
  private globalState: vscode.Memento;
  private disposables: vscode.Disposable[] = [];
  private output: vscode.OutputChannel;
  private trafficOutput: vscode.OutputChannel;
  private readonly appVersion?: string;
  private onGlobalStateChange?: (
    state: "disconnected" | "connecting" | "connected" | "error"
  ) => void;

  constructor(
    private readonly extensionUri: vscode.Uri,
    globalState: vscode.Memento,
    appVersion: string | undefined,
    onGlobalStateChange?: (
      state: "disconnected" | "connecting" | "connected" | "error"
    ) => void
  ) {
    this.globalState = globalState;
    this.appVersion = appVersion;
    this.onGlobalStateChange = onGlobalStateChange;
    this.output = vscode.window.createOutputChannel("ACP");
    this.trafficOutput = vscode.window.createOutputChannel("ACP Traffic");
  }

  public refreshRuntimeSettings(): void {
    const cfg = vscode.workspace.getConfiguration("acp");
    const connectTimeoutMs = cfg.get<number>("connectTimeoutMs", 600_000);
    const defaultWorkingDirectory = this.getDefaultWorkingDirectory();

    for (const ctx of this.contexts.values()) {
      ctx.acpClient.setConnectTimeoutMs(connectTimeoutMs);
      ctx.acpClient.setDefaultWorkingDirectory(defaultWorkingDirectory);
    }
  }

  private getPanelReasoning(panelKey: string, agentId: string): ReasoningLevel {
    const scopedReasoning = this.globalState.get<string>(
      panelStorageKey(panelKey, SELECTED_REASONING_STORAGE_KEY)
    );
    const scopedAgent = this.globalState.get<string>(
      panelStorageKey(panelKey, SELECTED_REASONING_AGENT_STORAGE_KEY)
    );
    if (scopedReasoning && scopedAgent === agentId) {
      return normalizeReasoningLevel(scopedReasoning);
    }
    const last = this.globalState.get<string>(LAST_SELECTED_REASONING_STORAGE_KEY);
    return normalizeReasoningLevel(last);
  }

  private postReasoning(panelId: string, reasoningId: ReasoningLevel): void {
    this.postMessageToPanel(panelId, { type: "reasoningUpdate", reasoningId });
  }

  private getEffectiveModelForSession(
    panelKey: string,
    agent: { id: string; name: string },
    modelId: string
  ): string {
    if (!isFastAgent(agent)) return modelId;
    const reasoning = this.getPanelReasoning(panelKey, agent.id);
    return withModelReasoning(modelId, reasoning);
  }

  private getEffectiveAgentConfig(
    panelKey: string,
    baseAgent: {
      id: string;
      name: string;
      command: string;
      args: string[];
      cwd?: string;
      env?: Record<string, string>;
    },
    preferredModelId?: string | null
  ) {
    const reasoning = this.getPanelReasoning(panelKey, baseAgent.id);
    let args = [...baseAgent.args];

    if (isCodexAgent(baseAgent)) {
      args = removeCodexReasoningOverride(args);
      if (reasoning !== "system") {
        args.push("-c", `model_reasoning_effort=${reasoning}`);
      }
    } else if (isFastAgent(baseAgent)) {
      let modelArgValue = (preferredModelId || "").trim();
      if (!modelArgValue) {
        const idx = args.findIndex((a) => a === "--model" || a === "--models");
        if (idx !== -1 && typeof args[idx + 1] === "string") {
          modelArgValue = args[idx + 1];
        }
      }
      if (modelArgValue) {
        const effectiveModel = withModelReasoning(modelArgValue, reasoning);
        if (args.some((a) => a === "--model" || a === "--models")) {
          if (args.includes("--model")) {
            args = upsertArg(args, "--model", effectiveModel);
          } else {
            args = upsertArg(args, "--models", effectiveModel);
          }
        } else {
          args.push("--model", effectiveModel);
        }
      }
    }

    return {
      ...baseAgent,
      args,
    };
  }

  private expandVars(value: string): string {
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

  private getDefaultWorkingDirectory(): string | undefined {
    const cfg = vscode.workspace.getConfiguration("acp");
    const raw = (cfg.get<string>("defaultWorkingDirectory", "") ?? "").trim();
    if (raw) {
      const expanded = this.expandVars(raw).trim();
      return expanded || undefined;
    }
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  }

  private logTraffic(direction: "send" | "recv", data: unknown): void {
    const cfg = vscode.workspace.getConfiguration("acp");
    if (!cfg.get<boolean>("logTraffic", true)) return;

    const arrow =
      direction === "send" ? ">>> CLIENT -> AGENT" : "<<< AGENT -> CLIENT";
    const timestamp = new Date().toISOString();

    // Classify message type (JSON-RPC request/notification/response).
    const msg = data as Record<string, unknown> | null;
    let label = "";
    if (msg && typeof msg === "object") {
      if ("method" in msg && "id" in msg) {
        label = ` [REQUEST] ${String(msg.method)}`;
      } else if ("method" in msg && !("id" in msg)) {
        label = ` [NOTIFICATION] ${String(msg.method)}`;
      } else if ("result" in msg || "error" in msg) {
        label = ` [RESPONSE] id=${String(msg.id)}`;
      }
    }

    try {
      this.trafficOutput.appendLine(
        `[${timestamp}] ${arrow}${label}\n${JSON.stringify(data, null, 2)}\n`
      );
    } catch (err) {
      // Logging must never crash the extension host.
      this.trafficOutput.appendLine(
        `[${timestamp}] ${arrow}${label}\n<failed to stringify: ${String(err)}>\n`
      );
    }
  }

  private async requestPermission(
    params: RequestPermissionRequest
  ): Promise<RequestPermissionResponse> {
    const cfg = vscode.workspace.getConfiguration("acp");
    const autoApprove = cfg.get<string>("autoApprovePermissions", "ask");

    const title = params.toolCall?.title || "Permission Request";
    this.output.appendLine(
      `[ACP] Permission request: ${title} (autoApprove=${autoApprove})`
    );

    if (autoApprove === "allowAll") {
      const allowOption = params.options.find(
        (opt) => opt.kind === "allow_once" || opt.kind === "allow_always"
      );
      if (allowOption) {
        return {
          outcome: { outcome: "selected", optionId: allowOption.optionId },
        };
      }
    }

    const items: (vscode.QuickPickItem & { optionId: string })[] =
      params.options.map((option) => {
        const icon = option.kind.startsWith("allow") ? "$(check)" : "$(x)";
        return {
          label: `${icon} ${option.name}`,
          description: option.kind,
          optionId: option.optionId,
        };
      });

    const selection = await vscode.window.showQuickPick(items, {
      placeHolder: title,
      title: "ACP Agent Permission Request",
      ignoreFocusOut: true,
    });

    if (!selection) {
      return { outcome: { outcome: "cancelled" } };
    }

    return { outcome: { outcome: "selected", optionId: selection.optionId } };
  }

  private postAgents(panelId: string): void {
    const ctx = this.contexts.get(panelId);
    if (!ctx) return;

    const agentsWithStatus = getAgentsWithStatus();
    const reasoningId = this.getPanelReasoning(ctx.panelKey, ctx.acpClient.getAgentId());
    this.postMessageToPanel(panelId, {
      type: "agents",
      agents: agentsWithStatus.map((a) => ({
        id: a.id,
        name: a.name,
        available: a.available,
        source: a.source,
      })),
      selected: ctx.acpClient.getAgentId(),
    });
    this.postReasoning(panelId, reasoningId);
  }

  public hasVisiblePanel(): boolean {
    if (!this.activePanelId || !this.contexts.has(this.activePanelId)) {
      return false;
    }
    return this.contexts.get(this.activePanelId)!.panel.visible;
  }

  public showOrCreatePanel(): void {
    if (this.activePanelId && this.contexts.has(this.activePanelId)) {
      try {
        this.contexts
          .get(this.activePanelId)!
          .panel.reveal(vscode.ViewColumn.One);
        return;
      } catch (err) {
        // If a panel entry becomes stale (e.g. after unexpected disposal),
        // don't get stuck in a no-op state: drop it and recreate.
        console.log("[ACP] reveal failed, recreating panel", err);
        this.contexts.delete(this.activePanelId);
        this.activePanelId = undefined;
      }
    }

    // If we still have any other live panel, reveal it; otherwise create a new one.
    const anyId = this.contexts.keys().next().value as string | undefined;
    if (anyId && this.contexts.has(anyId)) {
      try {
        this.activePanelId = anyId;
        this.contexts.get(anyId)!.panel.reveal(vscode.ViewColumn.One);
        return;
      } catch (err) {
        console.log("[ACP] reveal fallback failed, recreating panel", err);
        this.contexts.delete(anyId);
        this.activePanelId = undefined;
      }
    }

    this.createNewPanel();
  }

  public createNewPanel(): void {
    this.panelCounter++;
    const panelId = `panel-${this.panelCounter}`;
    const panelKey = randomUUID();
    // Keep the editor tab title stable. If multiple tabs ever exist, VS Code will
    // disambiguate them automatically; we should not add our own counter suffix.
    const title = "ACP";

    const panel = vscode.window.createWebviewPanel(
      ChatPanelManager.viewType,
      title,
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [this.extensionUri],
      }
    );

    panel.iconPath = {
      light: vscode.Uri.joinPath(this.extensionUri, "assets", "icon-light.svg"),
      dark: vscode.Uri.joinPath(this.extensionUri, "assets", "icon-dark.svg"),
    };

    panel.webview.html = this.getHtmlContent(panel.webview);

    // 패널별 독립 ACPClient 생성
    const cfg = vscode.workspace.getConfiguration("acp");
    const connectTimeoutMs = cfg.get<number>("connectTimeoutMs", 600_000);
    const defaultWorkingDirectory = this.getDefaultWorkingDirectory();
    const acpClient = new ACPClient({
      connectTimeoutMs,
      defaultWorkingDirectory,
      onTraffic: (direction, message) => this.logTraffic(direction, message),
    });

    // 저장된 에이전트 설정 적용
    const savedAgentId = this.globalState.get<string>(
      panelStorageKey(panelKey, SELECTED_AGENT_STORAGE_KEY)
    );
    const savedModelId = this.globalState.get<string>(
      panelStorageKey(panelKey, SELECTED_MODEL_STORAGE_KEY)
    );
    const savedModelAgentId = this.globalState.get<string>(
      panelStorageKey(panelKey, SELECTED_MODEL_AGENT_STORAGE_KEY)
    );
    const globalLastAgentId = this.globalState.get<string>(
      LAST_SELECTED_AGENT_STORAGE_KEY
    );
    const preferredAgentId = savedAgentId || globalLastAgentId;
    if (preferredAgentId) {
      const agent = getAgent(preferredAgentId);
      if (agent) {
        const preferredModelForAgent =
          savedModelId && savedModelAgentId === preferredAgentId
            ? savedModelId
            : null;
        acpClient.setAgent(
          this.getEffectiveAgentConfig(panelKey, agent, preferredModelForAgent)
        );
        // Seed the panel-scoped key for consistency (this panelKey is ephemeral anyway).
        this.globalState.update(
          panelStorageKey(panelKey, SELECTED_AGENT_STORAGE_KEY),
          preferredAgentId
        );
      } else {
        const fallback = getFirstAvailableAgent();
        acpClient.setAgent(this.getEffectiveAgentConfig(panelKey, fallback));
      }
    } else {
      const fallback = getFirstAvailableAgent();
      acpClient.setAgent(this.getEffectiveAgentConfig(panelKey, fallback));
    }

    // PanelContext 생성
    const ctx: PanelContext = {
      panel,
      panelKey,
      acpClient,
      hasSession: false,
      streamingText: "",
      hasRestoredModeModel: false,
      stderrBuffer: "",
    };

    this.contexts.set(panelId, ctx);
    this.activePanelId = panelId;

    // Push initial agent list eagerly (in addition to the webview "ready" handshake)
    // so the selector populates even if the webview is retained across extension reloads.
    this.postAgents(panelId);

    // 패널별 이벤트 리스너 설정
    acpClient.setOnStateChange((state) => {
      this.postMessageToPanel(panelId, { type: "connectionState", state });
      // 연결이 끊어지면 세션도 리셋
      if (state === "disconnected" || state === "error") {
        const context = this.contexts.get(panelId);
        if (context) {
          context.hasSession = false;
        }
      }
      // 상태 표시줄 업데이트를 위한 글로벌 콜백
      if (this.activePanelId === panelId && this.onGlobalStateChange) {
        this.onGlobalStateChange(state);
      }
    });

    acpClient.setOnSessionUpdate((update) => {
      this.handleSessionUpdate(panelId, update);
    });

    acpClient.setOnPermissionRequest((params) => this.requestPermission(params));

    acpClient.setOnStderr((text) => {
      this.handleStderr(panelId, text);
      this.output.appendLine(text.trimEnd());
    });

    panel.webview.onDidReceiveMessage(
      async (message: WebviewMessage) => {
        // Set this panel as active when it receives messages
        this.activePanelId = panelId;

        switch (message.type) {
          case "sendMessage":
            if (
              message.text ||
              (message.attachments && message.attachments.length > 0)
            ) {
              await this.handleUserMessage(
                panelId,
                message.text || "",
                message.attachments
              );
            }
            break;
          case "cancel":
            await ctx.acpClient.cancel();
            break;
          case "selectAgent":
            if (message.agentId) {
              await this.handleAgentChange(panelId, message.agentId);
            }
            break;
          case "selectMode":
            if (message.modeId) {
              await this.handleModeChange(panelId, message.modeId);
            }
            break;
          case "selectModel":
            if (message.modelId) {
              await this.handleModelChange(panelId, message.modelId);
            }
            break;
          case "selectReasoning":
            await this.handleReasoningChange(panelId, message.reasoningId);
            break;
          case "connect":
            await this.handleConnect(panelId);
            break;
          case "newChat":
            await this.handleNewChat(panelId);
            break;
          case "clearChat":
            this.handleClearChat(panelId);
            break;
          case "copyMessage":
            if (message.text) {
              await vscode.env.clipboard.writeText(message.text);
              vscode.window.showInformationMessage(
                "Message copied to clipboard"
              );
            }
            break;
          case "ready":
            {
              const requestedAgentId =
                typeof message.agentId === "string"
                  ? message.agentId.trim()
                  : "";
              const requestedModeId =
                typeof message.modeId === "string" ? message.modeId.trim() : "";
              const requestedModelId =
                typeof message.modelId === "string"
                  ? message.modelId.trim()
                  : "";
              const requestedReasoningId = normalizeReasoningLevel(
                typeof message.reasoningId === "string"
                  ? message.reasoningId.trim()
                  : "system"
              );

              // Publish current state immediately.
              this.postMessageToPanel(panelId, {
                type: "connectionState",
                state: ctx.acpClient.getState(),
              });
              this.postMessageToPanel(panelId, {
                type: "appInfo",
                version: this.appVersion,
              });

              // Apply client-preferred selections (from restored webview state) if valid.
              if (requestedAgentId) {
                const agent = getAgent(requestedAgentId);
                if (agent) {
                  ctx.acpClient.setAgent(agent);
                  ctx.hasSession = false;
                  ctx.hasRestoredModeModel = false;
                  this.globalState.update(
                    panelStorageKey(ctx.panelKey, SELECTED_AGENT_STORAGE_KEY),
                    requestedAgentId
                  );
                  this.globalState.update(
                    LAST_SELECTED_AGENT_STORAGE_KEY,
                    requestedAgentId
                  );
                }
              }

              if (requestedModeId) {
                this.globalState.update(
                  panelStorageKey(ctx.panelKey, SELECTED_MODE_STORAGE_KEY),
                  requestedModeId
                );
                this.globalState.update(LAST_SELECTED_MODE_STORAGE_KEY, requestedModeId);
                ctx.hasRestoredModeModel = false;
              }

              if (requestedModelId) {
                this.globalState.update(
                  panelStorageKey(ctx.panelKey, SELECTED_MODEL_STORAGE_KEY),
                  requestedModelId
                );
                this.globalState.update(
                  panelStorageKey(ctx.panelKey, SELECTED_MODEL_AGENT_STORAGE_KEY),
                  ctx.acpClient.getAgentId()
                );
                this.globalState.update(
                  LAST_SELECTED_MODEL_STORAGE_KEY,
                  requestedModelId
                );
                ctx.hasRestoredModeModel = false;
              }

              await this.globalState.update(
                panelStorageKey(ctx.panelKey, SELECTED_REASONING_STORAGE_KEY),
                requestedReasoningId
              );
              await this.globalState.update(
                panelStorageKey(ctx.panelKey, SELECTED_REASONING_AGENT_STORAGE_KEY),
                ctx.acpClient.getAgentId()
              );
              await this.globalState.update(
                LAST_SELECTED_REASONING_STORAGE_KEY,
                requestedReasoningId
              );
              this.postReasoning(panelId, requestedReasoningId);

              this.postAgents(panelId);
              this.sendSessionMetadata(panelId);
              this.sendStoredSessions(panelId);

              // Auto-connect on load to the selected agent (idempotent).
              await this.handleConnect(panelId);
            }
            break;
          case "saveSession":
            if (message.session) {
              this.saveSession(panelId, message.session);
            }
            break;
          case "deleteSession":
            if (message.sessionId) {
              this.deleteSession(panelId, message.sessionId);
            }
            break;
          case "getSessions":
            this.sendStoredSessions(panelId);
            break;
          case "selectFiles":
            await this.handleSelectFiles(panelId);
            break;
          case "selectImages":
            await this.handleSelectImages(panelId);
            break;
        }
      },
      undefined,
      this.disposables
    );

    panel.onDidDispose(
      () => {
        // 패널 정리 시 해당 acpClient도 정리
        const context = this.contexts.get(panelId);
        if (context) {
          context.acpClient.dispose();
          // Best-effort cleanup for per-panel persisted state.
          this.globalState.update(
            panelStorageKey(context.panelKey, "selectedAgent"),
            undefined
          );
          this.globalState.update(
            panelStorageKey(context.panelKey, "selectedMode"),
            undefined
          );
          this.globalState.update(
            panelStorageKey(context.panelKey, "selectedModel"),
            undefined
          );
          this.globalState.update(
            panelStorageKey(context.panelKey, SELECTED_REASONING_STORAGE_KEY),
            undefined
          );
          this.globalState.update(
            panelStorageKey(context.panelKey, SELECTED_REASONING_AGENT_STORAGE_KEY),
            undefined
          );
          this.globalState.update(
            panelStorageKey(context.panelKey, "sessions"),
            undefined
          );
        }
        this.contexts.delete(panelId);
        if (this.activePanelId === panelId) {
          // Set another panel as active if available
          const remainingPanels = Array.from(this.contexts.keys());
          this.activePanelId =
            remainingPanels.length > 0 ? remainingPanels[0] : undefined;
        }
      },
      undefined,
      this.disposables
    );

    panel.onDidChangeViewState(
      (e) => {
        if (e.webviewPanel.visible) {
          this.activePanelId = panelId;
          const context = this.contexts.get(panelId);
          if (context) {
            this.postMessageToPanel(panelId, {
              type: "connectionState",
              state: context.acpClient.getState(),
            });
            // Re-publish agents when returning to a retained webview.
            this.postAgents(panelId);
            // 상태 표시줄 업데이트
            if (this.onGlobalStateChange) {
              this.onGlobalStateChange(context.acpClient.getState());
            }
          }
        }
      },
      undefined,
      this.disposables
    );
  }

  public newChat(): void {
    if (this.activePanelId) {
      this.postMessageToPanel(this.activePanelId, { type: "triggerNewChat" });
    }
  }

  public clearChat(): void {
    if (this.activePanelId) {
      this.postMessageToPanel(this.activePanelId, { type: "triggerClearChat" });
    }
  }

  public dispose(): void {
    this.contexts.forEach((ctx, _panelId) => {
      ctx.acpClient.dispose();
      ctx.panel.dispose();
    });
    this.contexts.clear();
    this.disposables.forEach((d) => d.dispose());
    this.disposables = [];
  }

  // 현재 활성 패널의 연결 상태 확인
  public isConnected(): boolean {
    if (this.activePanelId) {
      const ctx = this.contexts.get(this.activePanelId);
      return ctx?.acpClient.isConnected() ?? false;
    }
    return false;
  }

  // 현재 활성 패널 연결
  public async connect(): Promise<void> {
    if (this.activePanelId) {
      const ctx = this.contexts.get(this.activePanelId);
      if (ctx && !ctx.acpClient.isConnected()) {
        await ctx.acpClient.connect();
      }
    }
  }

  /**
   * Refresh the agent list in all open panels (e.g. after settings change).
   */
  public refreshAgents(): void {
    const agentsWithStatus = getAgentsWithStatus(true);

    for (const [panelId, ctx] of this.contexts.entries()) {
      // If the currently selected agent was removed from settings, fall back.
      const currentId = ctx.acpClient.getAgentId();
      if (!getAgent(currentId)) {
        const fallback = getFirstAvailableAgent();
        ctx.acpClient.setAgent(
          this.getEffectiveAgentConfig(ctx.panelKey, fallback)
        );
        this.globalState.update(
          panelStorageKey(ctx.panelKey, "selectedAgent"),
          fallback.id
        );
        this.postMessageToPanel(panelId, {
          type: "agentChanged",
          agentId: fallback.id,
        });
        this.postReasoning(
          panelId,
          this.getPanelReasoning(ctx.panelKey, fallback.id)
        );
      }

      this.postMessageToPanel(panelId, {
        type: "agents",
        agents: agentsWithStatus.map((a) => ({
          id: a.id,
          name: a.name,
          available: a.available,
          source: a.source,
        })),
        selected: ctx.acpClient.getAgentId(),
      });
      this.postReasoning(
        panelId,
        this.getPanelReasoning(ctx.panelKey, ctx.acpClient.getAgentId())
      );
    }
  }

  private handleStderr(panelId: string, text: string): void {
    const ctx = this.contexts.get(panelId);
    if (!ctx) return;

    ctx.stderrBuffer += text;

    const errorMatch = ctx.stderrBuffer.match(
      /(\w+Error):\s*(\w+)?\s*\n?\s*data:\s*\{([^}]+)\}/
    );
    if (errorMatch) {
      const errorType = errorMatch[1];
      const errorData = errorMatch[3];
      const providerMatch = errorData.match(/providerID:\s*"([^"]+)"/);
      const modelMatch = errorData.match(/modelID:\s*"([^"]+)"/);

      let message = `Agent error: ${errorType}`;
      if (providerMatch && modelMatch) {
        message = `Model not found: ${providerMatch[1]}/${modelMatch[1]}`;
      }

      this.postMessageToPanel(panelId, { type: "agentError", text: message });
      ctx.stderrBuffer = "";
    }

    if (ctx.stderrBuffer.length > 10000) {
      ctx.stderrBuffer = ctx.stderrBuffer.slice(-5000);
    }
  }

  private handleSessionUpdate(
    panelId: string,
    notification: SessionNotification
  ): void {
    const ctx = this.contexts.get(panelId);
    if (!ctx) return;

    const update = notification.update;
    console.log(
      `[Chat:${panelId}] Session update received:`,
      update.sessionUpdate
    );

    if (update.sessionUpdate === "agent_message_chunk") {
      console.log(
        `[Chat:${panelId}] Chunk content:`,
        JSON.stringify(update.content)
      );
      if (update.content.type === "text") {
        ctx.streamingText += update.content.text;
        this.postMessageToPanel(panelId, {
          type: "streamChunk",
          text: update.content.text,
        });
      } else {
        console.log(
          `[Chat:${panelId}] Non-text chunk type:`,
          update.content.type
        );
      }
    } else if (update.sessionUpdate === "agent_thought_chunk") {
      // Thinking/reasoning 스트리밍 처리
      if (update.content.type === "text") {
        this.postMessageToPanel(panelId, {
          type: "thinkingChunk",
          text: update.content.text,
        });
      }
    } else if (update.sessionUpdate === "tool_call") {
      const meta = (update as unknown as { _meta?: unknown })._meta;
      this.postMessageToPanel(panelId, {
        type: "toolCallStart",
        name: update.title,
        toolCallId: update.toolCallId,
        kind: update.kind,
        meta,
        // rawInput/rawOutput may be missing on tool_call for some agents
        rawInput: (update as unknown as { rawInput?: unknown }).rawInput,
        rawOutput: (update as unknown as { rawOutput?: unknown }).rawOutput,
      });
    } else if (update.sessionUpdate === "tool_call_update") {
      // Be tolerant to agents that use non-standard status strings.
      // ACP spec uses: in_progress | completed | failed.
      const rawStatus = (update.status as unknown as string | undefined) ?? "";
      const normalized = rawStatus.toLowerCase();

      const mappedStatus =
        normalized === "completed" ||
        normalized === "complete" ||
        normalized === "done" ||
        normalized === "success" ||
        normalized === "succeeded"
          ? "completed"
          : normalized === "failed" || normalized === "error"
            ? "failed"
            : "running"; // includes in_progress / running / unknown

      this.postMessageToPanel(panelId, {
        // Webview currently only understands toolCallStart + toolCallComplete.
        // We use toolCallComplete as a generic tool update (may still be running).
        type: "toolCallComplete",
        toolCallId: update.toolCallId,
        title: update.title,
        kind: update.kind,
        content: update.content,
        rawInput: update.rawInput,
        rawOutput: update.rawOutput,
        meta: (update as unknown as { _meta?: unknown })._meta,
        status: mappedStatus,
      });
    } else if (update.sessionUpdate === "current_mode_update") {
      this.postMessageToPanel(panelId, {
        type: "modeUpdate",
        modeId: update.currentModeId,
      });
    } else if (update.sessionUpdate === "available_commands_update") {
      this.postMessageToPanel(panelId, {
        type: "availableCommands",
        commands: update.availableCommands,
      });
    } else if (update.sessionUpdate === "plan") {
      this.postMessageToPanel(panelId, {
        type: "plan",
        plan: { entries: update.entries },
      });
    }
  }

  private async handleUserMessage(
    panelId: string,
    text: string,
    attachments?: Attachment[]
  ): Promise<void> {
    const ctx = this.contexts.get(panelId);
    if (!ctx) return;

    // ContentBlock 배열 생성 (에이전트에게 전송)
    const contentBlocks: ContentBlock[] = [];
    // 사용자 UI에 표시할 텍스트 (첨부파일 요약 포함)
    const displayParts: string[] = [];

    if (attachments && attachments.length > 0) {
      for (const att of attachments) {
        if (att.type === "image") {
          // 이미지는 ContentBlock으로 전송 (에이전트가 실제로 볼 수 있음)
          // data:image/png;base64,... 형식에서 base64 부분만 추출
          const base64Data = att.content.includes(",")
            ? att.content.split(",")[1]
            : att.content;
          contentBlocks.push({
            type: "image",
            data: base64Data,
            mimeType: att.mimeType || "image/png",
          });
          displayParts.push(`[Image: ${att.name}]`);
        } else if (att.type === "code") {
          const lang = att.language || "";
          const range = att.lineRange
            ? ` (lines ${att.lineRange[0]}-${att.lineRange[1]})`
            : "";
          const codeBlock = `\`\`\`${lang}\n// File: ${att.path || att.name}${range}\n${att.content}\n\`\`\``;
          contentBlocks.push({ type: "text", text: codeBlock });
          displayParts.push(codeBlock);
        } else {
          // 일반 파일
          const fileBlock = `\`\`\`\n// File: ${att.path || att.name}\n${att.content}\n\`\`\``;
          contentBlocks.push({ type: "text", text: fileBlock });
          displayParts.push(fileBlock);
        }
      }
    }

    // 메인 텍스트 추가
    if (text) {
      contentBlocks.push({ type: "text", text });
      displayParts.push(text);
    }

    const displayMessage = displayParts.join("\n\n");
    // 이미지 첨부파일만 추출해서 UI에 전달
    const imageAttachments =
      attachments?.filter((att) => att.type === "image") || [];
    this.postMessageToPanel(panelId, {
      type: "userMessage",
      text: displayMessage,
      attachments: imageAttachments.length > 0 ? imageAttachments : undefined,
    });

    try {
      // 연결되지 않았으면 연결 시도
      const state = ctx.acpClient.getState();
      if (state === "disconnected" || state === "error") {
        await ctx.acpClient.connect();
        // 연결 후 잠시 대기 (프로세스 안정화)
        await new Promise((resolve) => setTimeout(resolve, 100));
      } else if (state === "connecting") {
        // 연결 중이면 연결 완료 대기
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      // 연결 상태 재확인 (프로세스가 즉시 종료된 경우 대비)
      if (!ctx.acpClient.isConnected()) {
        throw new Error(
          "Agent process terminated unexpectedly. Please try again."
        );
      }

      if (!ctx.hasSession) {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        const workingDir = workspaceFolder?.uri.fsPath || process.cwd();
        await ctx.acpClient.newSession(workingDir);
        ctx.hasSession = true;
        this.sendSessionMetadata(panelId);
      }

      ctx.streamingText = "";
      ctx.stderrBuffer = "";
      this.postMessageToPanel(panelId, { type: "streamStart" });
      console.log(`[Chat:${panelId}] Sending message to ACP...`);
      const response = await ctx.acpClient.sendMessage(contentBlocks);
      console.log(
        `[Chat:${panelId}] Prompt response received:`,
        JSON.stringify(response, null, 2)
      );

      if (ctx.streamingText.length === 0) {
        console.warn(`[Chat:${panelId}] No streaming text received from agent`);
        console.warn(`[Chat:${panelId}] stderr buffer:`, ctx.stderrBuffer);
        console.warn(
          `[Chat:${panelId}] Response:`,
          JSON.stringify(response, null, 2)
        );
        this.postMessageToPanel(panelId, {
          type: "error",
          text: "Agent returned no response. Check the ACP output channel for details.",
        });
        this.postMessageToPanel(panelId, {
          type: "streamEnd",
          stopReason: "error",
        });
      } else {
        this.postMessageToPanel(panelId, {
          type: "streamEnd",
          stopReason: response.stopReason,
        });
      }
      ctx.streamingText = "";
    } catch (error) {
      console.error(`[Chat:${panelId}] Error in handleUserMessage:`, error);
      const errorMessage =
        error instanceof Error ? error.message : JSON.stringify(error);
      this.postMessageToPanel(panelId, {
        type: "error",
        text: `Error: ${errorMessage}`,
      });
      this.postMessageToPanel(panelId, {
        type: "streamEnd",
        stopReason: "error",
      });
      ctx.streamingText = "";
      ctx.stderrBuffer = "";
    }
  }

  private async handleSelectFiles(panelId: string): Promise<void> {
    const result = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectMany: true,
      filters: {
        "All Files": ["*"],
        "Code Files": [
          "ts",
          "tsx",
          "js",
          "jsx",
          "py",
          "java",
          "c",
          "cpp",
          "go",
          "rs",
          "rb",
          "php",
        ],
        "Text Files": [
          "txt",
          "md",
          "json",
          "yaml",
          "yml",
          "xml",
          "html",
          "css",
        ],
      },
    });

    if (result && result.length > 0) {
      const files = await Promise.all(
        result.map(async (uri) => {
          const content = await vscode.workspace.fs.readFile(uri);
          const textContent = new TextDecoder().decode(content);
          const fileName = uri.path.split("/").pop() || "file";
          const ext = fileName.split(".").pop() || "";

          return {
            type: "file" as const,
            name: fileName,
            content: textContent,
            path: uri.fsPath,
            language: this.getLanguageFromExtension(ext),
          };
        })
      );

      this.postMessageToPanel(panelId, {
        type: "filesAttached",
        files,
      });
    }
  }

  private async handleSelectImages(panelId: string): Promise<void> {
    const result = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectMany: true,
      filters: {
        Images: ["png", "jpg", "jpeg", "gif", "webp", "svg"],
      },
    });

    if (result && result.length > 0) {
      const files = await Promise.all(
        result.map(async (uri) => {
          const content = await vscode.workspace.fs.readFile(uri);
          const base64 = Buffer.from(content).toString("base64");
          const fileName = uri.path.split("/").pop() || "image";
          const ext = fileName.split(".").pop()?.toLowerCase() || "png";
          const mimeType = `image/${ext === "jpg" ? "jpeg" : ext}`;

          return {
            type: "image" as const,
            name: fileName,
            content: `data:${mimeType};base64,${base64}`,
            path: uri.fsPath,
            mimeType,
          };
        })
      );

      this.postMessageToPanel(panelId, {
        type: "filesAttached",
        files,
      });
    }
  }

  private getLanguageFromExtension(ext: string): string {
    const langMap: Record<string, string> = {
      ts: "typescript",
      tsx: "typescript",
      js: "javascript",
      jsx: "javascript",
      py: "python",
      java: "java",
      c: "c",
      cpp: "cpp",
      go: "go",
      rs: "rust",
      rb: "ruby",
      php: "php",
      html: "html",
      css: "css",
      json: "json",
      yaml: "yaml",
      yml: "yaml",
      xml: "xml",
      md: "markdown",
      sh: "bash",
      sql: "sql",
    };
    return langMap[ext.toLowerCase()] || "";
  }

  // 에디터에서 선택한 코드를 채팅에 첨부
  public attachSelectedCode(): void {
    const editor = vscode.window.activeTextEditor;
    if (!editor || !this.activePanelId) return;

    const selection = editor.selection;
    const selectedText = editor.document.getText(selection);
    if (!selectedText) {
      vscode.window.showWarningMessage("No text selected");
      return;
    }

    const fileName = editor.document.fileName.split("/").pop() || "selection";
    const languageId = editor.document.languageId;
    const startLine = selection.start.line + 1;
    const endLine = selection.end.line + 1;

    this.postMessageToPanel(this.activePanelId, {
      type: "codeAttached",
      code: {
        fileName,
        content: selectedText,
        path: editor.document.fileName,
        language: languageId,
        lineRange: [startLine, endLine] as [number, number],
      },
    });
  }

  // 파일 탐색기에서 파일을 채팅에 첨부
  public async attachFile(uri: vscode.Uri): Promise<void> {
    if (!this.activePanelId) {
      // 패널이 없으면 새로 생성
      this.createNewPanel();
    }

    const content = await vscode.workspace.fs.readFile(uri);
    const fileName = uri.path.split("/").pop() || "file";
    const ext = fileName.split(".").pop() || "";
    const isImage = ["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(
      ext.toLowerCase()
    );

    if (isImage) {
      const base64 = Buffer.from(content).toString("base64");
      const mimeType = `image/${ext === "jpg" ? "jpeg" : ext}`;

      this.postMessageToPanel(this.activePanelId!, {
        type: "filesAttached",
        files: [
          {
            type: "image",
            name: fileName,
            content: `data:${mimeType};base64,${base64}`,
            path: uri.fsPath,
            mimeType,
          },
        ],
      });
    } else {
      const textContent = new TextDecoder().decode(content);

      this.postMessageToPanel(this.activePanelId!, {
        type: "filesAttached",
        files: [
          {
            type: "file",
            name: fileName,
            content: textContent,
            path: uri.fsPath,
            language: this.getLanguageFromExtension(ext),
          },
        ],
      });
    }
  }

  private async handleAgentChange(
    panelId: string,
    agentId: string
  ): Promise<void> {
    const ctx = this.contexts.get(panelId);
    if (!ctx) return;

    const agent = getAgent(agentId);
    if (agent) {
      const reasoning = this.getPanelReasoning(ctx.panelKey, agentId);
      ctx.acpClient.setAgent(this.getEffectiveAgentConfig(ctx.panelKey, agent));
      this.globalState.update(
        panelStorageKey(ctx.panelKey, SELECTED_AGENT_STORAGE_KEY),
        agentId
      );
      this.globalState.update(LAST_SELECTED_AGENT_STORAGE_KEY, agentId);
      // Do not carry mode/model across different agents.
      // A stale restored model can override agent CLI defaults (e.g. --model codex).
      this.globalState.update(
        panelStorageKey(ctx.panelKey, SELECTED_MODE_STORAGE_KEY),
        undefined
      );
      this.globalState.update(
        panelStorageKey(ctx.panelKey, SELECTED_MODEL_STORAGE_KEY),
        undefined
      );
      this.globalState.update(
        panelStorageKey(ctx.panelKey, SELECTED_MODEL_AGENT_STORAGE_KEY),
        undefined
      );
      ctx.hasSession = false;
      ctx.hasRestoredModeModel = false;
      this.postMessageToPanel(panelId, { type: "agentChanged", agentId });
      this.postReasoning(panelId, reasoning);
      this.postMessageToPanel(panelId, {
        type: "sessionMetadata",
        modes: null,
        models: null,
      });

      // Auto-reconnect and create session after agent change
      try {
        const a = getAgent(agentId);
        if (a) {
          this.output.appendLine(
            `[connect] agent=${a.id} command=${a.command} args=${JSON.stringify(
              a.args
            )} cwd=${a.cwd ?? "(none)"}`
          );
        }
        await ctx.acpClient.connect();

        // Wait for connection to stabilize and verify it's still active
        await new Promise((resolve) => setTimeout(resolve, 200));

        if (!ctx.acpClient.isConnected()) {
          throw new Error(
            `Agent "${agentId}" failed to start. Check if the agent is properly installed.`
          );
        }

        // Create new session
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        const workingDir = workspaceFolder?.uri.fsPath || process.cwd();
        await ctx.acpClient.newSession(workingDir);
        ctx.hasSession = true;
        this.sendSessionMetadata(panelId);

        // 세션 초기화 후 메타데이터가 업데이트될 수 있으므로 잠시 후 다시 전송
        setTimeout(() => {
          this.sendSessionMetadata(panelId);
        }, 500);
      } catch (error) {
        console.error(
          `[Chat:${panelId}] Failed to reconnect after agent change:`,
          error
        );
        this.output.appendLine(
          `[connect] failed after agent change: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
        this.postMessageToPanel(panelId, {
          type: "error",
          text:
            error instanceof Error
              ? error.message
              : "Failed to connect to new agent",
        });
      }
    }
  }

  private async handleModeChange(
    panelId: string,
    modeId: string
  ): Promise<void> {
    const ctx = this.contexts.get(panelId);
    if (!ctx) return;

    try {
      await ctx.acpClient.setMode(modeId);
      await this.globalState.update(
        panelStorageKey(ctx.panelKey, SELECTED_MODE_STORAGE_KEY),
        modeId
      );
      await this.globalState.update(LAST_SELECTED_MODE_STORAGE_KEY, modeId);
      this.sendSessionMetadata(panelId);
    } catch (error) {
      console.error(`[Chat:${panelId}] Failed to set mode:`, error);
    }
  }

  private async handleModelChange(
    panelId: string,
    modelId: string
  ): Promise<void> {
    const ctx = this.contexts.get(panelId);
    if (!ctx) return;

    try {
      const effectiveModelId = this.getEffectiveModelForSession(
        ctx.panelKey,
        ctx.acpClient.getAgentConfig(),
        modelId
      );
      await ctx.acpClient.setModel(effectiveModelId);
      await this.globalState.update(
        panelStorageKey(ctx.panelKey, SELECTED_MODEL_STORAGE_KEY),
        modelId
      );
      await this.globalState.update(
        panelStorageKey(ctx.panelKey, SELECTED_MODEL_AGENT_STORAGE_KEY),
        ctx.acpClient.getAgentId()
      );
      await this.globalState.update(LAST_SELECTED_MODEL_STORAGE_KEY, modelId);
      this.sendSessionMetadata(panelId);
    } catch (error) {
      console.error(`[Chat:${panelId}] Failed to set model:`, error);
    }
  }

  private async handleReasoningChange(
    panelId: string,
    reasoningId?: string
  ): Promise<void> {
    const ctx = this.contexts.get(panelId);
    if (!ctx) return;

    const normalized = normalizeReasoningLevel(reasoningId);
    const agentId = ctx.acpClient.getAgentId();
    const baseAgent = getAgent(agentId) ?? ctx.acpClient.getAgentConfig();
    const savedModelId = this.globalState.get<string>(
      panelStorageKey(ctx.panelKey, SELECTED_MODEL_STORAGE_KEY)
    );
    const savedModelAgentId = this.globalState.get<string>(
      panelStorageKey(ctx.panelKey, SELECTED_MODEL_AGENT_STORAGE_KEY)
    );
    const preferredModel =
      savedModelId && savedModelAgentId === agentId ? savedModelId : null;

    await this.globalState.update(
      panelStorageKey(ctx.panelKey, SELECTED_REASONING_STORAGE_KEY),
      normalized
    );
    await this.globalState.update(
      panelStorageKey(ctx.panelKey, SELECTED_REASONING_AGENT_STORAGE_KEY),
      agentId
    );
    await this.globalState.update(LAST_SELECTED_REASONING_STORAGE_KEY, normalized);
    this.postReasoning(panelId, normalized);

    // Codex consumes reasoning from startup config (`-c model_reasoning_effort=...`),
    // so we need to reconfigure and reconnect to apply changes.
    if (isCodexAgent(baseAgent)) {
      const effective = this.getEffectiveAgentConfig(
        ctx.panelKey,
        baseAgent,
        preferredModel
      );
      ctx.acpClient.setAgent(effective);
      ctx.hasSession = false;
      ctx.hasRestoredModeModel = false;
      this.postMessageToPanel(panelId, {
        type: "sessionMetadata",
        modes: null,
        models: null,
      });
      await this.handleConnect(panelId);
      return;
    }

    // For disconnected agents, update launch config so next connect picks it up.
    if (!ctx.acpClient.isConnected()) {
      const effective = this.getEffectiveAgentConfig(
        ctx.panelKey,
        baseAgent,
        preferredModel
      );
      ctx.acpClient.setAgent(effective);
      return;
    }

    // Fast Agent can accept reasoning by setting model with `?reasoning=...`.
    if (isFastAgent(baseAgent) && ctx.hasSession) {
      const modelForSession =
        preferredModel ||
        ctx.acpClient.getSessionMetadata()?.models?.currentModelId ||
        "";
      if (modelForSession) {
        const effectiveModel = this.getEffectiveModelForSession(
          ctx.panelKey,
          baseAgent,
          modelForSession
        );
        try {
          await ctx.acpClient.setModel(effectiveModel);
        } catch (error) {
          console.error(
            `[Chat:${panelId}] Failed to apply reasoning to model:`,
            error
          );
        }
      }
      this.sendSessionMetadata(panelId);
    }
  }

  private async handleConnect(panelId: string): Promise<void> {
    const ctx = this.contexts.get(panelId);
    if (!ctx) return;

    // Idempotency: multiple connect clicks while already connecting/connected should be a no-op.
    // This prevents noisy "Already connecting" errors and avoids leaving a stale alert banner.
    const state = ctx.acpClient.getState();
    if (state === "connecting") return;
    if (state === "connected" && ctx.hasSession) {
      this.postMessageToPanel(panelId, { type: "connectAlert", text: "" });
      return;
    }

    // Clear any previous connect banner when starting a new attempt.
    this.postMessageToPanel(panelId, { type: "connectAlert", text: "" });

    try {
      if (!ctx.acpClient.isConnected()) {
        const agentId = ctx.acpClient.getAgentId();
        const savedModelId = this.globalState.get<string>(
          panelStorageKey(ctx.panelKey, SELECTED_MODEL_STORAGE_KEY)
        );
        const savedModelAgentId = this.globalState.get<string>(
          panelStorageKey(ctx.panelKey, SELECTED_MODEL_AGENT_STORAGE_KEY)
        );
        const preferredModel =
          savedModelId && savedModelAgentId === agentId ? savedModelId : null;
        const base = getAgent(agentId) ?? ctx.acpClient.getAgentConfig();
        const effective = this.getEffectiveAgentConfig(
          ctx.panelKey,
          base,
          preferredModel
        );
        ctx.acpClient.setAgent(effective);

        const a = ctx.acpClient.getAgentConfig();
        if (a) {
          this.output.appendLine(
            `[connect] agent=${a.id} command=${a.command} args=${JSON.stringify(
              a.args
            )} cwd=${a.cwd ?? "(none)"}`
          );
        }
        await ctx.acpClient.connect();
      }
      if (!ctx.hasSession) {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        const workingDir = workspaceFolder?.uri.fsPath || process.cwd();
        await ctx.acpClient.newSession(workingDir);
        ctx.hasSession = true;
        this.sendSessionMetadata(panelId);

        // Connection/session is ready: clear any stale connect banner.
        this.postMessageToPanel(panelId, { type: "connectAlert", text: "" });

        // 세션 초기화 후 메타데이터가 업데이트될 수 있으므로 잠시 후 다시 전송
        setTimeout(() => {
          this.sendSessionMetadata(panelId);
        }, 500);
      }
    } catch (error) {
      this.output.appendLine(
        `[connect] failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      this.postMessageToPanel(panelId, {
        type: "connectAlert",
        text: (() => {
          const msg =
            error instanceof Error ? error.message : String(error ?? "");
          // Don't show an alert for idempotent connect attempts; the status dot already
          // indicates the correct state.
          if (/Already (connected|connecting)/i.test(msg)) return "";
          return msg || "Failed to connect";
        })(),
      });
    }
  }

  private async handleNewChat(panelId: string): Promise<void> {
    const ctx = this.contexts.get(panelId);
    if (!ctx) return;

    ctx.hasSession = false;
    ctx.hasRestoredModeModel = false;
    ctx.streamingText = "";
    this.postMessageToPanel(panelId, { type: "chatCleared" });
    this.postMessageToPanel(panelId, {
      type: "sessionMetadata",
      modes: null,
      models: null,
    });

    try {
      if (ctx.acpClient.isConnected()) {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        const workingDir = workspaceFolder?.uri.fsPath || process.cwd();
        await ctx.acpClient.newSession(workingDir);
        ctx.hasSession = true;
        this.sendSessionMetadata(panelId);
      }
    } catch (error) {
      console.error(`[Chat:${panelId}] Failed to create new session:`, error);
    }
  }

  private handleClearChat(panelId: string): void {
    this.postMessageToPanel(panelId, { type: "chatCleared" });
  }

  // Session storage methods
  private getStoredSessions(panelId: string): StoredSession[] {
    const ctx = this.contexts.get(panelId);
    if (!ctx) return [];
    return this.globalState.get<StoredSession[]>(
      panelStorageKey(ctx.panelKey, SESSIONS_STORAGE_KEY),
      []
    );
  }

  private saveSession(panelId: string, session: StoredSession): void {
    const ctx = this.contexts.get(panelId);
    if (!ctx) return;

    const sessions = this.getStoredSessions(panelId);
    const existingIndex = sessions.findIndex((s) => s.id === session.id);

    if (existingIndex >= 0) {
      sessions[existingIndex] = session;
    } else {
      sessions.unshift(session); // Add to beginning
    }

    // Keep only last 50 sessions
    const trimmedSessions = sessions.slice(0, 50);
    this.globalState.update(
      panelStorageKey(ctx.panelKey, SESSIONS_STORAGE_KEY),
      trimmedSessions
    );

    // Only update the originating panel (avoid cross-panel leakage).
    this.sendStoredSessions(panelId);
  }

  private deleteSession(panelId: string, sessionId: string): void {
    const ctx = this.contexts.get(panelId);
    if (!ctx) return;

    const sessions = this.getStoredSessions(panelId);
    const filteredSessions = sessions.filter((s) => s.id !== sessionId);
    this.globalState.update(
      panelStorageKey(ctx.panelKey, SESSIONS_STORAGE_KEY),
      filteredSessions
    );

    // Only update the originating panel (avoid cross-panel leakage).
    this.sendStoredSessions(panelId);
  }

  private sendStoredSessions(panelId: string): void {
    const sessions = this.getStoredSessions(panelId);
    this.postMessageToPanel(panelId, {
      type: "sessions",
      sessions,
    });
  }

  private sendSessionMetadata(panelId: string): void {
    const ctx = this.contexts.get(panelId);
    if (!ctx) return;

    const metadata = ctx.acpClient.getSessionMetadata();
    const reasoningId = this.getPanelReasoning(ctx.panelKey, ctx.acpClient.getAgentId());
    this.postMessageToPanel(panelId, {
      type: "sessionMetadata",
      modes: metadata?.modes ?? null,
      models: metadata?.models ?? null,
      commands: metadata?.commands ?? null,
      reasoningId,
    });

    if (!ctx.hasRestoredModeModel && ctx.hasSession) {
      ctx.hasRestoredModeModel = true;
      this.restoreSavedModeAndModel(panelId).catch((error) =>
        console.warn(
          `[Chat:${panelId}] Failed to restore saved mode/model:`,
          error
        )
      );
    }
  }

  private async restoreSavedModeAndModel(panelId: string): Promise<void> {
    const ctx = this.contexts.get(panelId);
    if (!ctx) return;

    const metadata = ctx.acpClient.getSessionMetadata();
    const availableModes = Array.isArray(metadata?.modes?.availableModes)
      ? metadata.modes.availableModes
      : [];
    const availableModels = Array.isArray(metadata?.models?.availableModels)
      ? metadata.models.availableModels
      : [];

    const savedModeId = this.globalState.get<string>(
      panelStorageKey(ctx.panelKey, SELECTED_MODE_STORAGE_KEY)
    );
    const savedModelId = this.globalState.get<string>(
      panelStorageKey(ctx.panelKey, SELECTED_MODEL_STORAGE_KEY)
    );
    const savedModelAgentId = this.globalState.get<string>(
      panelStorageKey(ctx.panelKey, SELECTED_MODEL_AGENT_STORAGE_KEY)
    );
    const currentAgentId = ctx.acpClient.getAgentId();

    let modeRestored = false;
    let modelRestored = false;

    if (
      savedModeId &&
      availableModes.some((mode: any) => mode && mode.id === savedModeId)
    ) {
      await ctx.acpClient.setMode(savedModeId);
      console.log(`[Chat:${panelId}] Restored mode: ${savedModeId}`);
      modeRestored = true;
    }

    if (
      savedModelId &&
      savedModelAgentId &&
      savedModelAgentId === currentAgentId &&
      availableModels.some(
        (model: any) => model && model.modelId === savedModelId
      )
    ) {
      const effectiveModelId = this.getEffectiveModelForSession(
        ctx.panelKey,
        ctx.acpClient.getAgentConfig(),
        savedModelId
      );
      await ctx.acpClient.setModel(effectiveModelId);
      console.log(`[Chat:${panelId}] Restored model: ${savedModelId}`);
      modelRestored = true;
    }

    if (modeRestored || modelRestored) {
      this.postMessageToPanel(panelId, {
        type: "sessionMetadata",
        ...metadata,
      });
    }
  }

  private postMessageToPanel(
    panelId: string,
    message: Record<string, unknown>
  ): void {
    const ctx = this.contexts.get(panelId);
    if (ctx) {
      ctx.panel.webview.postMessage(message);
    }
  }

  private getHtmlContent(webview: vscode.Webview): string {
    const webviewScriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "out", "webview", "webview.js")
    );
    const webviewStyleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "out", "webview", "webview.css")
    );

    const nonce = this.getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; font-src ${webview.cspSource}; img-src ${webview.cspSource} data:;">
  <link href="${webviewStyleUri}" rel="stylesheet">
  <title>ACP</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${webviewScriptUri}"></script>
</body>
</html>`;
  }

  private getNonce(): string {
    let text = "";
    const possible =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }
}
