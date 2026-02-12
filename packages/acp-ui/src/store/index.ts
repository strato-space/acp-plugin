import { create } from "zustand";
import type {
  Agent,
  Mode,
  Model,
  Message,
  Tool,
  AvailableCommand,
  PlanEntry,
  Attachment,
  StoredSession,
} from "../types";

type ConnectionState = "disconnected" | "connecting" | "connected" | "error";

function mergeTools(existing: Tool, incoming: Partial<Tool>): Tool {
  const merged: Tool = {
    ...existing,
    ...incoming,
    name:
      incoming.name === "Unknown" || incoming.name === undefined
        ? existing.name
        : incoming.name,
    kind: incoming.kind ?? existing.kind,
    status: (incoming.status as Tool["status"]) ?? existing.status,
    input: incoming.input ?? existing.input,
    output: incoming.output ?? existing.output,
  };

  if (existing.subTools || incoming.subTools) {
    merged.subTools = {
      ...(existing.subTools ?? {}),
      ...(incoming.subTools ?? {}),
    };
  }

  if (existing.progress || incoming.progress) {
    merged.progress = {
      ...(existing.progress ?? {}),
      ...(incoming.progress ?? {}),
    };
  }

  return merged;
}

function applyToolUpdatesToMessages(
  messages: Message[],
  updates: Record<string, Partial<Tool>>
): Message[] {
  const pending = new Set(Object.keys(updates));
  if (pending.size === 0) return messages;

  let changed = false;
  let nextMessages = messages;

  // Search from newest to oldest - tools are almost always in recent messages.
  for (let i = nextMessages.length - 1; i >= 0; i--) {
    const msg = nextMessages[i];
    if (!msg.tools) continue;

    let newTools: Record<string, Tool> | null = null;

    for (const toolId of Object.keys(msg.tools)) {
      if (!pending.has(toolId)) continue;
      const incoming = updates[toolId];
      if (!incoming) continue;

      const existing = msg.tools[toolId];
      const merged = mergeTools(existing, incoming);

      if (!newTools) newTools = { ...msg.tools };
      newTools[toolId] = merged;
      pending.delete(toolId);
    }

    if (newTools) {
      if (!changed) {
        changed = true;
        nextMessages = [...nextMessages];
      }
      nextMessages[i] = { ...msg, tools: newTools };
    }

    if (pending.size === 0) break;
  }

  return nextMessages;
}

// Re-export for backward compatibility
export type Session = StoredSession;

interface StreamingState {
  currentText: string;
  thinkingText: string;
  tools: Record<string, Tool>;
  expandedToolId: string | null;
  hasActiveTool: boolean;
}

interface ChatStore {
  // Connection state
  connectionState: ConnectionState;
  setConnectionState: (state: ConnectionState) => void;
  connectAlert: string | null;
  setConnectAlert: (text: string | null) => void;
  appVersion: string | null;
  setAppVersion: (version: string | null) => void;

  // Sessions
  sessions: Session[];
  currentSessionId: string | null;
  collapsedAgentIds: string[];
  sidebarOpen: boolean;
  setSessions: (sessions: Session[]) => void;
  addSession: (session: Omit<Session, "id">) => string;
  upsertSession: (session: Session) => void;
  selectSession: (sessionId: string) => void;
  updateSessionTitle: (sessionId: string, title: string) => void;
  deleteSession: (sessionId: string) => void;
  setSidebarOpen: (open: boolean) => void;
  getCurrentSession: () => Session | null;
  setCollapsedAgentIds: (ids: string[]) => void;
  toggleAgentCollapsed: (agentId: string) => void;

  // Agents
  agents: Agent[];
  selectedAgentId: string | null;
  setAgents: (agents: Agent[], selected?: string) => void;
  setSelectedAgent: (agentId: string) => void;

  // Modes & Models
  modes: Mode[];
  currentModeId: string | null;
  models: Model[];
  currentModelId: string | null;
  currentReasoningId: string | null;
  setModes: (modes: Mode[], currentId: string) => void;
  setModels: (models: Model[], currentId: string) => void;
  setCurrentMode: (modeId: string) => void;
  setCurrentModel: (modelId: string) => void;
  setCurrentReasoning: (reasoningId: string) => void;

  // Messages
  messages: Message[];
  addMessage: (message: Omit<Message, "id" | "timestamp">) => void;
  updateLastAssistantMessage: (updates: Partial<Message>) => void;
  /**
   * Clear the current chat transcript UI state while preserving the selected session.
   * Use this for "clear chat" / "new chat" flows where the client has already created
   * a session entry and we don't want to accidentally create duplicate empty sessions.
   */
  clearThreadMessages: () => void;
  clearMessages: () => void;

  // Streaming
  streaming: StreamingState;
  startStreaming: () => void;
  appendStreamChunk: (text: string) => void;
  endStreaming: (html?: string) => void;

  // Tools
  addTool: (toolCallId: string, tool: Tool) => void;
  updateTool: (toolCallId: string, updates: Partial<Tool>) => void;
  batchUpdateTools: (tools: Map<string, Tool>) => void;
  finalizeToolsBeforeText: () => void;

  // Commands
  availableCommands: AvailableCommand[];
  setAvailableCommands: (commands: AvailableCommand[]) => void;

  // Plan
  plan: PlanEntry[] | null;
  setPlan: (entries: PlanEntry[] | null) => void;

  // Input
  inputValue: string;
  setInputValue: (value: string) => void;

  // Attachments
  attachments: Attachment[];
  addAttachment: (attachment: Omit<Attachment, "id">) => void;
  removeAttachment: (id: string) => void;
  clearAttachments: () => void;

  // Thinking
  isThinking: boolean;
  setIsThinking: (value: boolean) => void;
  appendThinkingChunk: (text: string) => void;
  clearThinking: () => void;

  // UI preferences (per webview panel)
  hierarchyStyle: "line" | "frame";
  setHierarchyStyle: (style: "line" | "frame") => void;
  settingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;
  toggleSettingsOpen: () => void;
  runFrameOpenByDefault: boolean;
  setRunFrameOpenByDefault: (open: boolean) => void;
  toolListShowAllByDefault: boolean;
  setToolListShowAllByDefault: (showAll: boolean) => void;
}

export const useChatStore = create<ChatStore>((set, get) => ({
  // Connection state
  connectionState: "disconnected",
  setConnectionState: (nextState) =>
    set((state) => ({
      connectionState: nextState,
      // Any connect banner is transient; clear it once we start (re)connecting or succeed.
      connectAlert:
        nextState === "connecting" || nextState === "connected"
          ? null
          : state.connectAlert,
    })),
  connectAlert: null,
  setConnectAlert: (text) =>
    set({ connectAlert: text && text.trim() ? text : null }),
  appVersion: null,
  setAppVersion: (version) => {
    const v = version && version.trim() ? version.trim() : null;
    if (!v) {
      set({ appVersion: null });
      return;
    }
    // Guard: avoid showing non-version identifiers (e.g. "acp-chat") as "v...".
    const semverish = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(v);
    set({ appVersion: semverish ? v : null });
  },

  // Sessions
  sessions: [],
  currentSessionId: null,
  collapsedAgentIds: [],
  // Default to a focused chat view; users can open the session sidebar via the hamburger.
  sidebarOpen: false,
  setSessions: (sessions) => set({ sessions }),
  addSession: (session) => {
    const id = crypto.randomUUID();
    const newSession = { ...session, id };
    set((state) => ({
      sessions: [newSession, ...state.sessions],
      currentSessionId: id,
      // Immediately switch the visible transcript to the new session.
      messages: newSession.messages,
      selectedAgentId: newSession.agentId,
      // Starting a new session should not inherit streaming/tool state from the previous one.
      streaming: {
        currentText: "",
        thinkingText: "",
        tools: {},
        expandedToolId: null,
        hasActiveTool: false,
      },
      plan: null,
      attachments: [],
      isThinking: false,
      connectAlert: null,
    }));
    return id;
  },
  upsertSession: (session) =>
    set((state) => ({
      // Keep the most recently updated session at the top.
      sessions: [session, ...state.sessions.filter((s) => s.id !== session.id)],
      currentSessionId:
        state.currentSessionId === session.id || state.currentSessionId === null
          ? session.id
          : state.currentSessionId,
    })),
  selectSession: (sessionId) => {
    const session = get().sessions.find((s) => s.id === sessionId);
    if (session) {
      set({
        currentSessionId: sessionId,
        messages: session.messages,
        selectedAgentId: session.agentId,
        // Switching between sessions should be a pure "view change" and must not
        // leak streaming/tools/plan state across sessions.
        streaming: {
          currentText: "",
          thinkingText: "",
          tools: {},
          expandedToolId: null,
          hasActiveTool: false,
        },
        plan: null,
        attachments: [],
        isThinking: false,
        connectAlert: null,
      });
    }
  },
  updateSessionTitle: (sessionId, title) =>
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === sessionId ? { ...s, title } : s
      ),
    })),
  deleteSession: (sessionId) =>
    set((state) => {
      const isActive = state.currentSessionId === sessionId;
      if (!isActive) {
        return {
          sessions: state.sessions.filter((s) => s.id !== sessionId),
          currentSessionId: state.currentSessionId,
        };
      }

      // Deleting the active session must also clear in-memory messages/streaming state,
      // otherwise the autosave effect will create a new session and "resurrect" it.
      return {
        sessions: state.sessions.filter((s) => s.id !== sessionId),
        currentSessionId: null,
        messages: [],
        streaming: {
          currentText: "",
          thinkingText: "",
          tools: {},
          expandedToolId: null,
          hasActiveTool: false,
        },
        plan: null,
        attachments: [],
        isThinking: false,
      };
    }),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  getCurrentSession: () => {
    const { currentSessionId, sessions } = get();
    return sessions.find((s) => s.id === currentSessionId) || null;
  },
  setCollapsedAgentIds: (collapsedAgentIds) => set({ collapsedAgentIds }),
  toggleAgentCollapsed: (agentId) =>
    set((state) => {
      const setIds = new Set(state.collapsedAgentIds);
      if (setIds.has(agentId)) setIds.delete(agentId);
      else setIds.add(agentId);
      return { collapsedAgentIds: Array.from(setIds) };
    }),

  // Agents
  agents: [],
  selectedAgentId: null,
  setAgents: (agents, selected) =>
    set({ agents, selectedAgentId: selected || null }),
  setSelectedAgent: (agentId) => set({ selectedAgentId: agentId }),

  // Modes & Models
  modes: [],
  currentModeId: null,
  models: [],
  currentModelId: null,
  currentReasoningId: "system",
  setModes: (modes, currentId) => set({ modes, currentModeId: currentId }),
  setModels: (models, currentId) => set({ models, currentModelId: currentId }),
  setCurrentMode: (modeId) => set({ currentModeId: modeId }),
  setCurrentModel: (modelId) => set({ currentModelId: modelId }),
  setCurrentReasoning: (reasoningId) =>
    set({ currentReasoningId: reasoningId }),

  // Messages
  messages: [],
  addMessage: (message) =>
    set((state) => ({
      messages: [
        ...state.messages,
        {
          ...message,
          id: crypto.randomUUID(),
          timestamp: Date.now(),
        },
      ],
    })),
  updateLastAssistantMessage: (updates) =>
    set((state) => {
      const messages = [...state.messages];
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].type === "assistant") {
          messages[i] = { ...messages[i], ...updates };
          break;
        }
      }
      return { messages };
    }),
  clearThreadMessages: () =>
    set((state) => {
      const sessionId = state.currentSessionId;
      const nextSessions =
        sessionId === null
          ? state.sessions
          : state.sessions.map((s) =>
              s.id === sessionId
                ? {
                    ...s,
                    messages: [],
                    timestamp: Date.now(),
                  }
                : s
            );

      return {
        sessions: nextSessions,
        messages: [],
        streaming: {
          currentText: "",
          thinkingText: "",
          tools: {},
          expandedToolId: null,
          hasActiveTool: false,
        },
        plan: null,
        attachments: [],
        isThinking: false,
      };
    }),
  clearMessages: () =>
    set({
      currentSessionId: null,
      messages: [],
      streaming: {
        currentText: "",
        thinkingText: "",
        tools: {},
        expandedToolId: null,
        hasActiveTool: false,
      },
      plan: null,
      attachments: [],
      isThinking: false,
    }),

  // Streaming
  streaming: {
    currentText: "",
    thinkingText: "",
    tools: {},
    expandedToolId: null,
    hasActiveTool: false,
  },
  startStreaming: () =>
    set({
      streaming: {
        currentText: "",
        thinkingText: "",
        tools: {},
        expandedToolId: null,
        hasActiveTool: false,
      },
      isThinking: true,
    }),
  appendStreamChunk: (text) =>
    set((state) => {
      const streaming = state.streaming;

      return {
        streaming: {
          ...streaming,
          currentText: streaming.currentText + text,
        },
        isThinking: false,
      };
    }),
  endStreaming: (html) =>
    set((state) => {
      const { streaming } = state;
      const finalText = streaming.currentText.trim();
      const finalThinking = streaming.thinkingText.trim();

      if (
        finalText ||
        finalThinking ||
        html ||
        Object.keys(streaming.tools).length > 0
      ) {
        const newMessage: Message = {
          id: crypto.randomUUID(),
          type: "assistant",
          text: finalText,
          html,
          thinkingText: finalThinking || undefined,
          tools:
            Object.keys(streaming.tools).length > 0
              ? { ...streaming.tools }
              : undefined,
          timestamp: Date.now(),
        };

        return {
          messages: [...state.messages, newMessage],
          streaming: {
            currentText: "",
            thinkingText: "",
            tools: {},
            expandedToolId: null,
            hasActiveTool: false,
          },
          isThinking: false,
        };
      }

      return {
        streaming: {
          currentText: "",
          thinkingText: "",
          tools: {},
          expandedToolId: null,
          hasActiveTool: false,
        },
        isThinking: false,
      };
    }),

  // Tools
  addTool: (toolCallId, tool) =>
    set((state) => {
      return {
        streaming: {
          ...state.streaming,
          tools: { ...state.streaming.tools, [toolCallId]: tool },
          hasActiveTool: true,
        },
        isThinking: true,
      };
    }),
  updateTool: (toolCallId, updates) =>
    set((state) => {
      const allowStreamingMutations =
        state.isThinking ||
        state.streaming.currentText.length > 0 ||
        state.streaming.thinkingText.length > 0 ||
        state.streaming.hasActiveTool;

      const existing = state.streaming.tools[toolCallId];
      const nextTool = existing ? mergeTools(existing, updates) : undefined;

      const messages = applyToolUpdatesToMessages(state.messages, {
        [toolCallId]: updates,
      });

      if (!allowStreamingMutations) {
        // If a tool update arrives after the assistant response finished,
        // don't resurrect a new "streaming" frame; just update message history.
        return { messages };
      }

      return {
        messages,
        streaming: {
          ...state.streaming,
          tools: {
            ...state.streaming.tools,
            ...(nextTool ? { [toolCallId]: nextTool } : {}),
          },
          expandedToolId: toolCallId,
        },
      };
    }),
  batchUpdateTools: (toolsMap) =>
    set((state) => {
      const allowStreamingMutations =
        state.isThinking ||
        state.streaming.currentText.length > 0 ||
        state.streaming.thinkingText.length > 0 ||
        state.streaming.hasActiveTool;

      // Convert Map to object and merge with existing tools
      const incomingTools: Record<string, Tool> = {};
      const newTools: Record<string, Tool> = {};
      toolsMap.forEach((tool, id) => {
        incomingTools[id] = tool;
        const existingTool = state.streaming.tools[id];
        if (existingTool) {
          newTools[id] = mergeTools(existingTool, tool);
        } else {
          newTools[id] = tool;
        }
      });

      const messages = applyToolUpdatesToMessages(
        state.messages,
        incomingTools
      );

      if (!allowStreamingMutations) {
        // Tool updates after stream end should only patch existing message tools.
        return { messages };
      }

      return {
        messages,
        streaming: {
          ...state.streaming,
          tools: { ...state.streaming.tools, ...newTools },
          hasActiveTool: true,
        },
        isThinking: true,
      };
    }),
  finalizeToolsBeforeText: () =>
    set((state) => {
      if (Object.keys(state.streaming.tools).length === 0) return state;

      const toolMessage: Message = {
        id: crypto.randomUUID(),
        type: "assistant",
        text: "",
        tools: { ...state.streaming.tools },
        timestamp: Date.now(),
      };

      return {
        messages: [...state.messages, toolMessage],
        streaming: {
          currentText: "",
          thinkingText: "",
          tools: {},
          expandedToolId: null,
          hasActiveTool: false,
        },
      };
    }),

  // Commands
  availableCommands: [],
  setAvailableCommands: (commands) => set({ availableCommands: commands }),

  // Plan
  plan: null,
  setPlan: (entries) => set({ plan: entries }),

  // Input
  inputValue: "",
  setInputValue: (value) => set({ inputValue: value }),

  // Attachments
  attachments: [],
  addAttachment: (attachment) =>
    set((state) => ({
      attachments: [
        ...state.attachments,
        { ...attachment, id: crypto.randomUUID() },
      ],
    })),
  removeAttachment: (id) =>
    set((state) => ({
      attachments: state.attachments.filter((a) => a.id !== id),
    })),
  clearAttachments: () => set({ attachments: [] }),

  // Thinking
  isThinking: false,
  setIsThinking: (value) => set({ isThinking: value }),
  appendThinkingChunk: (text) => {
    const prevLen = get().streaming.thinkingText.length;
    console.log(
      `[DEBUG] appendThinkingChunk called: +${text.length} chars, total will be: ${prevLen + text.length} chars`
    );
    set((state) => ({
      streaming: {
        ...state.streaming,
        thinkingText: state.streaming.thinkingText + text,
      },
    }));
  },
  clearThinking: () =>
    set((state) => ({
      streaming: {
        ...state.streaming,
        thinkingText: "",
      },
    })),

  // UI prefs
  hierarchyStyle: "frame",
  setHierarchyStyle: (style) => set({ hierarchyStyle: style }),
  settingsOpen: false,
  setSettingsOpen: (open) => set({ settingsOpen: open }),
  toggleSettingsOpen: () =>
    set((state) => ({ settingsOpen: !state.settingsOpen })),
  runFrameOpenByDefault: true,
  setRunFrameOpenByDefault: (open) => set({ runFrameOpenByDefault: open }),
  toolListShowAllByDefault: false,
  setToolListShowAllByDefault: (showAll) =>
    set({ toolListShowAllByDefault: showAll }),
}));
