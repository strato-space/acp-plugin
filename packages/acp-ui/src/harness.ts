import { useChatStore } from "./store";
import type { AcpHostBridge } from "./hostBridge";
import type { Agent, Message, Model, Mode, StoredSession, Tool } from "./types";

const HARNESS_AGENTS: Agent[] = [
  { id: "codex-cli", name: "Codex CLI", available: true, source: "builtin" },
  {
    id: "fast-agent-acp",
    name: "Fast Agent ACP",
    available: true,
    source: "builtin",
  },
  {
    id: "workspace-agent",
    name: "Workspace Agent",
    available: true,
    source: "custom",
  },
];

const HARNESS_MODES: Mode[] = [
  { id: "build", name: "build" },
  { id: "plan", name: "plan" },
];

const HARNESS_MODELS: Model[] = [
  { modelId: "codex", name: "codex (gpt-5.2-codex)" },
  { modelId: "codexplan", name: "codexplan (gpt-5.3-codex)" },
];

function createTool(name: string, status: Tool["status"], input: string, output: string): Tool {
  return {
    name,
    status,
    input,
    output,
  };
}

function createHarnessSessions(): StoredSession[] {
  const now = Date.now();

  const primaryMessages: Message[] = [
    {
      id: "h-user-1",
      type: "user",
      text: "Explain ACP request",
      timestamp: now - 30_000,
    },
    {
      id: "h-assistant-1",
      type: "assistant",
      text: "ACP is the runtime protocol here; MCP stays isolated from the /agents surface.",
      promptText: "Explain ACP request",
      thinkingText: "Reading ACP host state. Comparing transport boundaries. Producing a compact answer.",
      timestamp: now - 20_000,
      tools: {
        "tool-1": createTool("Read AGENTS.md", "completed", "{\"path\":\"/repo/AGENTS.md\"}", "{\"ok\":true}"),
        "tool-2": createTool("Read spec", "completed", "{\"path\":\"/repo/plan/acp-ui-component-base-spec.md\"}", "{\"ok\":true}"),
        "tool-3": createTool("Read package", "completed", "{\"path\":\"/repo/packages/acp-ui/package.json\"}", "{\"ok\":true}"),
        "tool-4": createTool("Check route", "completed", "{\"path\":\"/app/src/App.tsx\"}", "{\"ok\":true}"),
        "tool-5": createTool("Check socket", "completed", "{\"path\":\"/app/src/services/acpSocket.ts\"}", "{\"ok\":true}"),
        "tool-6": createTool("Compare baseline", "completed", "{\"path\":\"/docs/ACP_UI_EVAL_BASELINE.md\"}", "{\"ok\":true}"),
        "tool-7": createTool("Summarize result", "completed", "{\"scope\":\"agents\"}", "{\"summary\":\"done\"}"),
      },
    },
  ];

  const secondaryMessages: Message[] = [
    {
      id: "h-user-2",
      type: "user",
      text: "Ping",
      timestamp: now - 10_000,
    },
    {
      id: "h-assistant-2",
      type: "assistant",
      text: "pong",
      promptText: "Ping",
      timestamp: now - 9_000,
    },
  ];

  return [
    {
      id: "session-acp-primary",
      title: "Explain ACP request",
      agentId: "fast-agent-acp",
      timestamp: now - 20_000,
      messages: primaryMessages,
    },
    {
      id: "session-acp-secondary",
      title: "Ping",
      agentId: "codex-cli",
      timestamp: now - 9_000,
      messages: secondaryMessages,
    },
  ];
}

export interface AcpHarnessSeedOptions {
  sidebarOpen?: boolean;
  currentSessionId?: string;
}

export function createAcpUiHarnessBridge(): AcpHostBridge {
  let persistedState: unknown;
  let currentSessionId: string | null = "session-acp-primary";

  return {
    transport: {
      send(message: unknown): void {
        console.info("[ACP UI harness] transport.send", message);
      },
    },
    persistence: {
      getState<T>(): T | undefined {
        return persistedState as T | undefined;
      },
      setState<T>(state: T): T {
        persistedState = state;
        return state;
      },
    },
    route: {
      getCurrentSessionId(): string | null {
        return currentSessionId;
      },
      setCurrentSessionId(sessionId: string | null): void {
        currentSessionId = sessionId;
      },
    },
  };
}

export function seedAcpUiHarnessState(options: AcpHarnessSeedOptions = {}): StoredSession[] {
  const sessions = createHarnessSessions();
  const currentSessionId = options.currentSessionId ?? sessions[0]?.id ?? null;
  const currentSession = sessions.find((session) => session.id === currentSessionId) ?? sessions[0] ?? null;

  useChatStore.setState({
    connectionState: "connected",
    connectAlert: null,
    appVersion: "0.1.35",
    sessions,
    currentSessionId: currentSession?.id ?? null,
    collapsedAgentIds: [],
    sidebarOpen: options.sidebarOpen ?? false,
    agents: HARNESS_AGENTS,
    selectedAgentId: currentSession?.agentId ?? HARNESS_AGENTS[1].id,
    modes: HARNESS_MODES,
    currentModeId: HARNESS_MODES[0].id,
    models: HARNESS_MODELS,
    currentModelId: HARNESS_MODELS[0].modelId,
    currentReasoningId: "medium",
    messages: currentSession?.messages ?? [],
    lastUserInputText: "Explain ACP request",
    streaming: {
      currentText: "",
      thinkingText: "",
      inputText: null,
      tools: {},
      expandedToolId: null,
      hasActiveTool: false,
    },
    availableCommands: [],
    plan: null,
    inputValue: "",
    attachments: [],
    isThinking: false,
    hierarchyStyle: "frame",
    settingsOpen: false,
    runFrameOpenByDefault: true,
    toolListShowAllByDefault: false,
  });

  return sessions;
}
