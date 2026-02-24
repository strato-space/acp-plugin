import { useCallback, useEffect, useMemo, useRef } from "react";
import type { VsCodeApi } from "../vscode";
import type {
  ExtensionMessage,
  WebviewState,
  Tool,
  Attachment,
  StoredSession,
} from "../types";
import { useChatStore } from "../store";
import { detectToolKindFromName } from "@/lib/ansi";
import { buildToolDisplayName, normalizeBaseToolName } from "@/lib/toolTitle";
import type { Model } from "../types";

export type ReasoningLevel = "system" | "minimal" | "low" | "medium" | "high";

export const REASONING_OPTIONS: Array<{ id: ReasoningLevel; name: string }> = [
  { id: "system", name: "System Default" },
  { id: "minimal", name: "Minimal" },
  { id: "low", name: "Low" },
  { id: "medium", name: "Medium" },
  { id: "high", name: "High" },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function getStringProp(obj: unknown, key: string): string | undefined {
  if (!isRecord(obj)) return undefined;
  const v = obj[key];
  return typeof v === "string" ? v : undefined;
}

function getMetaString(meta: unknown, key: string): string | undefined {
  if (!isRecord(meta)) return undefined;
  const v = meta[key];
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function safeJsonStringify(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    try {
      return String(value);
    } catch {
      return null;
    }
  }
}

function safeJsonParse(value: string | null | undefined): unknown {
  if (!value) return undefined;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

const FAST_AGENT_FALLBACK_MODELS: Model[] = [
  { modelId: "codexplan", name: "codexplan: gpt-5.3-codex" },
  { modelId: "codex", name: "codex: gpt-5.2-codex" },
  { modelId: "claude-opus-4-6", name: "claude-opus-4-6: claude-opus-4-6" },
  { modelId: "sonnet", name: "sonnet: claude-sonnet-4-5" },
  { modelId: "gemini25pro", name: "gemini25pro: gemini-2.5-pro" },
  { modelId: "deepseek32", name: "deepseek32: DeepSeek-V3.2" },
  { modelId: "qwen3", name: "qwen3: Qwen3-Next-80B-A3B-Instruct" },
  { modelId: "kimi25", name: "kimi25: Kimi-K2.5" },
  { modelId: "gpt52", name: "gpt52: gpt-5.2" },
];

function isFastAgentSelected(
  selectedAgentId: string | null | undefined,
  agents: Array<{ id: string; name: string }>
): boolean {
  const id = (selectedAgentId || "").trim().toLowerCase();
  if (!id) return false;
  if (id === "fast-agent-acp") return true;
  const selected = agents.find((a) => a.id.toLowerCase() === id);
  if (!selected) return false;
  return selected.name.toLowerCase().includes("fast agent");
}

function isCodexSelected(
  selectedAgentId: string | null | undefined,
  agents: Array<{ id: string; name: string }>
): boolean {
  const id = (selectedAgentId || "").trim().toLowerCase();
  if (!id) return false;
  if (id === "codex") return true;
  const selected = agents.find((a) => a.id.toLowerCase() === id);
  if (!selected) return false;
  return selected.name.toLowerCase().includes("codex");
}

function normalizeFastAgentModelId(modelId: string | null | undefined): string {
  const raw = (modelId || "").trim();
  if (!raw) return "";
  const q = raw.indexOf("?");
  if (q === -1) return raw;
  try {
    const base = raw.slice(0, q);
    const params = new URLSearchParams(raw.slice(q + 1));
    params.delete("reasoning");
    const rest = params.toString();
    return rest ? `${base}?${rest}` : base;
  } catch {
    return raw.slice(0, q);
  }
}

function modelSupportsReasoning(modelId: string | null | undefined): boolean {
  const normalized = normalizeFastAgentModelId(modelId).toLowerCase();
  if (!normalized) return false;
  return /(codex|gpt|o[134]\b|claude|sonnet|opus|gemini)/i.test(normalized);
}

export function shouldShowReasoningControl(
  selectedAgentId: string | null | undefined,
  agents: Array<{ id: string; name: string }>,
  currentModelId: string | null | undefined
): boolean {
  if (isCodexSelected(selectedAgentId, agents)) return true;
  if (isFastAgentSelected(selectedAgentId, agents)) {
    return modelSupportsReasoning(currentModelId);
  }
  return false;
}

function resolveFallbackModelId(
  currentModelId: string | null | undefined
): string {
  const preferred = normalizeFastAgentModelId(currentModelId);
  if (
    preferred &&
    FAST_AGENT_FALLBACK_MODELS.some((m) => m.modelId === preferred)
  ) {
    return preferred;
  }
  return FAST_AGENT_FALLBACK_MODELS[0]?.modelId ?? "";
}

function mergeUniqueModels(primary: Model[], required: Model[]): Model[] {
  const merged: Model[] = [];
  const seen = new Set<string>();
  const pushUnique = (model: Model) => {
    const key = (model.modelId || "").trim().toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    merged.push(model);
  };
  for (const model of primary) pushUnique(model);
  for (const model of required) pushUnique(model);
  return merged;
}

function resolveCurrentModelId(
  models: Model[],
  preferredCurrentId: string | null | undefined
): string {
  const preferred = (preferredCurrentId || "").trim();
  if (preferred && models.some((m) => m.modelId === preferred)) {
    return preferred;
  }
  return models[0]?.modelId ?? "";
}

function isConnectNoiseBanner(text: string): boolean {
  const t = (text || "").trim();
  if (!t) return false;
  // Some ACP emitters send informational banners like:
  // "Switched to stratoproject. Connecting..."
  // The UI already has an explicit connection indicator.
  return /\bSwitched\s+to\b[\s\S]*?\bConnecting\b/i.test(t);
}

function stripConnectNoiseBanners(text: string): string {
  if (!text) return text;
  // Some agents emit banner-like text as part of the assistant stream, which would
  // otherwise end up inside the chat transcript. Strip these aggressively but only
  // for the known "Switched to ... Connecting..." pattern.
  //
  // Be tolerant to:
  // - different casing (StratoProject vs stratoproject)
  // - punctuation (".", "...", or unicode ellipsis)
  // - line breaks (some transports split it across chunks)
  return text.replace(
    /(?:^|\n)\s*Switched\s+to[\s\S]*?\bConnecting\b(?:\.{1,3}|…)?\s*(?=\n|$)/gi,
    ""
  );
}

function extractToolOutput(msg: ExtensionMessage): string | null {
  // Prefer rawOutput when available.
  if (msg.rawOutput !== undefined && msg.rawOutput !== null) {
    if (typeof msg.rawOutput === "string") {
      const t = msg.rawOutput.trim();
      if (t) return msg.rawOutput;
    } else {
      const maybeOutput = getStringProp(msg.rawOutput, "output");
      if (typeof maybeOutput === "string" && maybeOutput.trim()) {
        return maybeOutput;
      }
    }

    // If rawOutput exists but doesn't contain a meaningful `output` string,
    // fall back to content blocks before stringifying the rawOutput object.
  }

  // Fall back to content blocks, if present.
  if (Array.isArray(msg.content)) {
    const parts: string[] = [];
    for (const item of msg.content) {
      const legacyText = (item as any)?.content?.text;
      if (typeof legacyText === "string") {
        parts.push(legacyText);
        continue;
      }
      // ACP SDK ContentBlock shape: { type: "text", text: "..." }
      const type = (item as any)?.type;
      const text = (item as any)?.text;
      if (type === "text" && typeof text === "string") parts.push(text);
    }
    if (parts.length > 0) return parts.join("\n");
  }

  if (msg.rawOutput !== undefined && msg.rawOutput !== null) {
    return safeJsonStringify(msg.rawOutput);
  }

  return null;
}

// Throttle interval for streaming updates (ms)
const STREAM_THROTTLE_MS = 50;
const TOOL_THROTTLE_MS = 100;

// Acquire VS Code API once at module level
let vsCodeApi: VsCodeApi | null = null;

function getVsCodeApi(): VsCodeApi {
  if (!vsCodeApi) {
    if (typeof acquireVsCodeApi === "undefined") {
      // Mock for development outside VS Code
      console.warn("[ACP] Running outside VS Code - using mock API");
      vsCodeApi = {
        postMessage: (msg: unknown) => console.log("[Mock] postMessage:", msg),
        getState: <T>() => undefined as T | undefined,
        setState: <T>(state: T) => state,
      };
    } else {
      vsCodeApi = acquireVsCodeApi();
      console.log("[ACP] VS Code API acquired successfully");
    }
  }
  return vsCodeApi;
}

// Initialize immediately
const vscode = getVsCodeApi();

// Export a function to initialize message handling
// This should be called once from App component
export function useVsCodeInit() {
  const connectionState = useChatStore((state) => state.connectionState);
  const inputValue = useChatStore((state) => state.inputValue);
  const messages = useChatStore((state) => state.messages);
  const currentSessionId = useChatStore((state) => state.currentSessionId);
  const selectedAgentId = useChatStore((state) => state.selectedAgentId);
  const currentModeId = useChatStore((state) => state.currentModeId);
  const currentModelId = useChatStore((state) => state.currentModelId);
  const currentReasoningId = useChatStore((state) => state.currentReasoningId);
  const collapsedAgentIds = useChatStore((state) => state.collapsedAgentIds);
  const sidebarOpen = useChatStore((state) => state.sidebarOpen);
  const hierarchyStyle = useChatStore((state) => state.hierarchyStyle);
  const settingsOpen = useChatStore((state) => state.settingsOpen);
  const runFrameOpenByDefault = useChatStore(
    (state) => state.runFrameOpenByDefault
  );
  const toolListShowAllByDefault = useChatStore(
    (state) => state.toolListShowAllByDefault
  );

  // Stream chunk buffer for throttling
  const streamBufferRef = useRef<string>("");
  const streamTimeoutRef = useRef<number | null>(null);

  // Thinking chunk buffer for throttling
  const thinkingBufferRef = useRef<string>("");
  const thinkingTimeoutRef = useRef<number | null>(null);

  // Tool updates buffer for batching
  const toolUpdatesRef = useRef<Map<string, Tool>>(new Map());
  const toolTimeoutRef = useRef<number | null>(null);
  // Agents-as-tools support: nest tool calls under the most recent running Task tool.
  const activeTaskStackRef = useRef<string[]>([]);
  const toolParentRef = useRef<Map<string, string>>(new Map());
  // Work around buggy/non-standard ACP emitters that change toolCallId mid-flight
  // (e.g. start uses one id, progress/completion uses another).
  const toolAliasRef = useRef<Map<string, string>>(new Map());

  // Debug: message counter
  const messageCountRef = useRef(0);

  // Get store actions directly from getState - they are stable
  const getActions = useCallback(() => useChatStore.getState(), []);

  const postMessage = useCallback((message: unknown) => {
    console.log("[ACP] Sending message:", message);
    vscode.postMessage(message);
  }, []);

  const saveState = useCallback(() => {
    const stateNow = useChatStore.getState();
    const state: WebviewState = {
      schemaVersion: 8,
      isConnected: connectionState === "connected",
      inputValue: inputValue,
      collapsedAgentIds,
      sidebarOpen,
      // Hierarchy control is hidden in Settings; keep the default Frame style.
      hierarchyStyle: "frame",
      settingsOpen,
      selectedAgentId: stateNow.selectedAgentId ?? null,
      currentModeId: stateNow.currentModeId ?? null,
      currentModelId: stateNow.currentModelId ?? null,
      currentReasoningId: stateNow.currentReasoningId ?? null,
      runFrameOpenByDefault: stateNow.runFrameOpenByDefault,
      toolListShowAllByDefault: stateNow.toolListShowAllByDefault,
    };
    vscode.setState(state);
  }, [
    connectionState,
    inputValue,
    collapsedAgentIds,
    sidebarOpen,
    settingsOpen,
    selectedAgentId,
    currentModeId,
    currentModelId,
    currentReasoningId,
    hierarchyStyle,
    runFrameOpenByDefault,
    toolListShowAllByDefault,
  ]);

  const restoreState = useCallback((): WebviewState | undefined => {
    const state = vscode.getState<WebviewState>();
    if (state) {
      if (state.inputValue) {
        getActions().setInputValue(state.inputValue);
      }
      if (state.collapsedAgentIds && Array.isArray(state.collapsedAgentIds)) {
        getActions().setCollapsedAgentIds(state.collapsedAgentIds);
      }
      // Always default to a focused chat view; users can open the session sidebar via the hamburger.
      getActions().setSidebarOpen(false);
      // Hierarchy control is currently hidden in the UI; force the default Frame style
      // even if a previous session stored "line".
      getActions().setHierarchyStyle("frame");
      if (typeof state.settingsOpen === "boolean") {
        getActions().setSettingsOpen(state.settingsOpen);
      }
      if (
        typeof state.selectedAgentId === "string" &&
        state.selectedAgentId.trim()
      ) {
        getActions().setSelectedAgent(state.selectedAgentId.trim());
      }
      if (
        typeof state.currentModeId === "string" &&
        state.currentModeId.trim()
      ) {
        getActions().setCurrentMode(state.currentModeId.trim());
      }
      if (
        typeof state.currentModelId === "string" &&
        state.currentModelId.trim()
      ) {
        getActions().setCurrentModel(state.currentModelId.trim());
      }
      if (
        typeof state.currentReasoningId === "string" &&
        state.currentReasoningId.trim()
      ) {
        getActions().setCurrentReasoning(state.currentReasoningId.trim());
      }
      if (typeof state.runFrameOpenByDefault === "boolean") {
        getActions().setRunFrameOpenByDefault(state.runFrameOpenByDefault);
      }
      if (typeof state.toolListShowAllByDefault === "boolean") {
        getActions().setToolListShowAllByDefault(
          state.toolListShowAllByDefault
        );
      }
      return state;
    }
    // No persisted state yet; still enforce the default hierarchy.
    // Default to a focused chat view; users can open the session sidebar via the hamburger.
    getActions().setSidebarOpen(false);
    getActions().setHierarchyStyle("frame");
    return undefined;
  }, [getActions]);

  // Handle incoming messages from extension
  useEffect(() => {
    const handleMessage = (event: MessageEvent<ExtensionMessage>) => {
      const msg = event.data;
      messageCountRef.current++;
      console.log(`[DEBUG] Message #${messageCountRef.current}: ${msg.type}`);
      const actions = getActions();

      switch (msg.type) {
        case "connectAlert":
          {
            const text = (msg.text ?? "").trim();
            // Ignore idempotent connect errors; the status indicator is enough and we don't
            // want a sticky banner for "already connected/connecting" states.
            if (
              !text ||
              /Already (connected|connecting)/i.test(text) ||
              /connected or connecting/i.test(text) ||
              isConnectNoiseBanner(text)
            ) {
              actions.setConnectAlert(null);
            } else {
              actions.setConnectAlert(text);
            }
          }
          break;

        case "userMessage":
          if (
            (msg.text && !isConnectNoiseBanner(msg.text)) ||
            msg.attachments?.length
          ) {
            actions.addMessage({
              type: "user",
              text: msg.text || "",
              attachments: msg.attachments,
            });
            actions.setIsThinking(true);
          }
          break;

        case "streamStart":
          actions.startStreaming();
          break;

        case "streamChunk":
          if (msg.text) {
            // Buffer stream chunks and flush at throttled intervals
            streamBufferRef.current += msg.text;
            if (!streamTimeoutRef.current) {
              streamTimeoutRef.current = window.setTimeout(() => {
                if (streamBufferRef.current) {
                  streamBufferRef.current = stripConnectNoiseBanners(
                    streamBufferRef.current
                  );
                  console.log(
                    `[DEBUG] Flushing streamChunk: ${streamBufferRef.current.length} chars`
                  );
                  if (streamBufferRef.current.trim()) {
                    actions.appendStreamChunk(streamBufferRef.current);
                  }
                  streamBufferRef.current = "";
                }
                streamTimeoutRef.current = null;
              }, STREAM_THROTTLE_MS);
            }
          }
          break;

        case "thinkingChunk":
          if (msg.text) {
            // Buffer thinking chunks and flush at throttled intervals
            thinkingBufferRef.current += msg.text;
            console.log(
              `[DEBUG] thinkingChunk received: +${msg.text.length} chars, buffer: ${thinkingBufferRef.current.length} chars`
            );
            if (!thinkingTimeoutRef.current) {
              thinkingTimeoutRef.current = window.setTimeout(() => {
                const bufferLen = thinkingBufferRef.current.length;
                if (thinkingBufferRef.current) {
                  thinkingBufferRef.current = stripConnectNoiseBanners(
                    thinkingBufferRef.current
                  );
                  console.log(`[DEBUG] Flushing buffer: ${bufferLen} chars`);
                  if (thinkingBufferRef.current.trim()) {
                    actions.appendThinkingChunk(thinkingBufferRef.current);
                  }
                  thinkingBufferRef.current = "";
                }
                thinkingTimeoutRef.current = null;
              }, 100);
            }
          }
          break;

        case "streamEnd":
          // Flush any remaining buffered stream text
          if (streamTimeoutRef.current) {
            clearTimeout(streamTimeoutRef.current);
            streamTimeoutRef.current = null;
          }
          if (streamBufferRef.current) {
            streamBufferRef.current = stripConnectNoiseBanners(
              streamBufferRef.current
            );
            if (streamBufferRef.current.trim()) {
              actions.appendStreamChunk(streamBufferRef.current);
            }
            streamBufferRef.current = "";
          }
          // Flush any remaining buffered thinking text
          if (thinkingTimeoutRef.current) {
            clearTimeout(thinkingTimeoutRef.current);
            thinkingTimeoutRef.current = null;
          }
          if (thinkingBufferRef.current) {
            thinkingBufferRef.current = stripConnectNoiseBanners(
              thinkingBufferRef.current
            );
            if (thinkingBufferRef.current.trim()) {
              actions.appendThinkingChunk(thinkingBufferRef.current);
            }
            thinkingBufferRef.current = "";
          }
          // Flush any pending tool updates
          if (toolTimeoutRef.current) {
            clearTimeout(toolTimeoutRef.current);
            toolTimeoutRef.current = null;
          }
          if (toolUpdatesRef.current.size > 0) {
            actions.batchUpdateTools(toolUpdatesRef.current);
            toolUpdatesRef.current = new Map();
          }

          // Reset nesting state at the end of an assistant response.
          activeTaskStackRef.current = [];
          toolParentRef.current = new Map();
          toolAliasRef.current = new Map();

          // If the agent finished the prompt but some tools never emitted a final
          // completion update, don't leave them stuck in "running" forever.
          // We conservatively finalize them at stream end.
          {
            const state = useChatStore.getState();
            const desiredStatus: Tool["status"] =
              msg.stopReason === "error" ? "failed" : "completed";
            const finalize = new Map<string, Tool>();
            for (const [id, tool] of Object.entries(state.streaming.tools)) {
              if (tool.status === "running") {
                finalize.set(id, { ...tool, status: desiredStatus });
              }
            }
            // Also finalize any tools that were already moved into message history
            // (e.g. when tools ran before text streaming started).
            for (let i = state.messages.length - 1; i >= 0; i--) {
              const m = state.messages[i];
              if (!m.tools) continue;
              for (const [id, tool] of Object.entries(m.tools)) {
                if (tool.status === "running") {
                  finalize.set(id, { ...tool, status: desiredStatus });
                }
              }
            }
            if (finalize.size > 0) {
              actions.batchUpdateTools(finalize);
            }
          }

          const maybeHtml =
            typeof msg.html === "string"
              ? stripConnectNoiseBanners(msg.html)
              : msg.html;
          actions.endStreaming(maybeHtml);
          break;

        case "toolCallStart":
          if (msg.toolCallId && msg.name) {
            const displayHintInput = { rawInput: msg.rawInput, meta: msg.meta };
            const displayName = buildToolDisplayName(
              msg.name,
              displayHintInput,
              msg.kind as any
            );
            const detectedKind = detectToolKindFromName(
              displayName,
              msg.kind as any
            );
            const isTaskTool =
              detectedKind === "task" || detectedKind === "agent";

            const metaParentTaskIdRaw = getMetaString(
              msg.meta,
              "parentToolCallId"
            );
            const metaParentTaskId =
              metaParentTaskIdRaw && metaParentTaskIdRaw !== msg.toolCallId
                ? metaParentTaskIdRaw
                : null;

            const tool: Tool = {
              name: displayName,
              input: safeJsonStringify(msg.rawInput),
              output: extractToolOutput(msg),
              status: "running",
              kind: detectedKind,
            };

            // If a task is running, treat subsequent non-task tools as its children.
            const parentTaskId =
              metaParentTaskId ||
              (!isTaskTool && activeTaskStackRef.current.length > 0
                ? activeTaskStackRef.current[
                    activeTaskStackRef.current.length - 1
                  ]
                : null);

            if (parentTaskId) {
              toolParentRef.current.set(msg.toolCallId, parentTaskId);

              const state = useChatStore.getState();
              const bufferedParent = toolUpdatesRef.current.get(parentTaskId);
              const storeParent = state.streaming.tools[parentTaskId];
              const existingParent = bufferedParent || storeParent;
              const existingSubTools = existingParent?.subTools ?? {};

              toolUpdatesRef.current.set(parentTaskId, {
                ...(existingParent ?? {
                  name: "Task",
                  input: null,
                  output: null,
                  status: "running",
                  kind: "task",
                }),
                subTools: { ...existingSubTools, [msg.toolCallId]: tool },
              });
            } else {
              toolUpdatesRef.current.set(msg.toolCallId, tool);
              if (isTaskTool && !parentTaskId) {
                activeTaskStackRef.current.push(msg.toolCallId);
              }
            }

            if (!toolTimeoutRef.current) {
              toolTimeoutRef.current = window.setTimeout(() => {
                if (toolUpdatesRef.current.size > 0) {
                  console.log(
                    `[DEBUG] Flushing ${toolUpdatesRef.current.size} tool updates`
                  );
                  actions.batchUpdateTools(toolUpdatesRef.current);
                  toolUpdatesRef.current = new Map();
                }
                toolTimeoutRef.current = null;
              }, TOOL_THROTTLE_MS);
            }
          }
          break;

        case "toolCallComplete":
          if (msg.toolCallId) {
            const findMatchingRunningToolId = (
              baseName: string,
              kind?: string
            ): string | null => {
              const state = useChatStore.getState();

              // 1) Prefer current streaming tools (most recent)
              for (const [id, tool] of Object.entries(state.streaming.tools)) {
                if (tool.status !== "running") continue;
                if (kind && tool.kind && tool.kind !== kind) continue;
                if (normalizeBaseToolName(tool.name) === baseName) return id;
              }

              // 2) Fall back to recent assistant messages that already finalized tools
              for (let i = state.messages.length - 1; i >= 0; i--) {
                const m = state.messages[i];
                if (!m.tools) continue;
                for (const [id, tool] of Object.entries(m.tools)) {
                  if (tool.status !== "running") continue;
                  if (kind && tool.kind && tool.kind !== kind) continue;
                  if (normalizeBaseToolName(tool.name) === baseName) return id;
                }
              }

              return null;
            };

            // If the emitter changed toolCallId, map it back to the original one
            // so we don't leave the original stuck in "running".
            let logicalToolCallId = msg.toolCallId;
            const aliased = toolAliasRef.current.get(msg.toolCallId);
            if (aliased) {
              logicalToolCallId = aliased;
            } else {
              const state = useChatStore.getState();
              const hasExact =
                !!toolUpdatesRef.current.get(msg.toolCallId) ||
                !!state.streaming.tools[msg.toolCallId] ||
                state.messages.some((m) => !!m.tools?.[msg.toolCallId]);

              if (!hasExact) {
                const title = msg.title || "Tool";
                const baseName = normalizeBaseToolName(title);
                const matchId = findMatchingRunningToolId(baseName, msg.kind);
                if (matchId && matchId !== msg.toolCallId) {
                  toolAliasRef.current.set(msg.toolCallId, matchId);
                  logicalToolCallId = matchId;
                }
              }
            }

            const metaParentTaskIdRaw = getMetaString(
              msg.meta,
              "parentToolCallId"
            );
            const metaParentTaskId =
              metaParentTaskIdRaw &&
              metaParentTaskIdRaw !== msg.toolCallId &&
              metaParentTaskIdRaw !== logicalToolCallId
                ? metaParentTaskIdRaw
                : null;

            if (metaParentTaskId) {
              toolParentRef.current.set(logicalToolCallId, metaParentTaskId);
              // Also map the raw id so future alias matches can still find the parent.
              toolParentRef.current.set(msg.toolCallId, metaParentTaskId);
            }

            const output = extractToolOutput(msg);
            const input = safeJsonStringify(msg.rawInput);

            // Check buffer first, then store for existing tool data
            const bufferedTool = toolUpdatesRef.current.get(logicalToolCallId);
            const storeTool = actions.streaming?.tools?.[logicalToolCallId];
            const existingTool = bufferedTool || storeTool;
            const existingInput =
              existingTool?.input && existingTool.input !== input
                ? safeJsonParse(existingTool.input)
                : undefined;
            const displayHintInput = {
              rawInput: msg.rawInput,
              meta: msg.meta,
              previousInput: existingInput,
            };

            const displayName = buildToolDisplayName(
              msg.title || msg.name || existingTool?.name || "Unknown",
              displayHintInput,
              (msg.kind || existingTool?.kind) as any
            );

            const isTaskTool = (() => {
              const nameForKind = displayName;
              const kindForDetect = (msg.kind || existingTool?.kind) as any;
              const detected = detectToolKindFromName(
                nameForKind,
                kindForDetect
              );
              return detected === "task" || detected === "agent";
            })();

            const detectedKind = detectToolKindFromName(
              displayName,
              (msg.kind || existingTool?.kind) as any
            );

            const updatedTool: Tool = {
              name: displayName,
              kind: detectedKind,
              input: input ?? existingTool?.input ?? null,
              output: output ?? existingTool?.output ?? null,
              status: (msg.status as Tool["status"]) || "completed",
              subTools: existingTool?.subTools,
            };

            const parentTaskId =
              toolParentRef.current.get(logicalToolCallId) ?? metaParentTaskId;
            if (parentTaskId) {
              const state = useChatStore.getState();
              const bufferedParent = toolUpdatesRef.current.get(parentTaskId);
              const storeParent = state.streaming.tools[parentTaskId];
              const existingParent = bufferedParent || storeParent;
              const existingSubTools = existingParent?.subTools ?? {};
              const existingChild = existingSubTools[logicalToolCallId];

              toolUpdatesRef.current.set(parentTaskId, {
                ...(existingParent ?? {
                  name: "Task",
                  input: null,
                  output: null,
                  status: "running",
                  kind: "task",
                }),
                subTools: {
                  ...existingSubTools,
                  [logicalToolCallId]: {
                    ...(existingChild ?? {}),
                    ...updatedTool,
                  },
                },
              });
            } else {
              toolUpdatesRef.current.set(logicalToolCallId, updatedTool);

              // Pop task stack when tasks complete.
              if (
                isTaskTool &&
                (updatedTool.status === "completed" ||
                  updatedTool.status === "failed")
              ) {
                const stack = activeTaskStackRef.current;
                const idx = stack.lastIndexOf(logicalToolCallId);
                if (idx >= 0) {
                  activeTaskStackRef.current = stack.slice(0, idx);
                }
              }
            }

            if (!toolTimeoutRef.current) {
              toolTimeoutRef.current = window.setTimeout(() => {
                if (toolUpdatesRef.current.size > 0) {
                  console.log(
                    `[DEBUG] Flushing ${toolUpdatesRef.current.size} tool updates`
                  );
                  actions.batchUpdateTools(toolUpdatesRef.current);
                  toolUpdatesRef.current = new Map();
                }
                toolTimeoutRef.current = null;
              }, TOOL_THROTTLE_MS);
            }
          }
          break;

        case "error":
          actions.setIsThinking(false);
          if (msg.text && !isConnectNoiseBanner(msg.text)) {
            actions.addMessage({ type: "error", text: msg.text });
          }
          break;

        case "agentError":
          if (msg.text && !isConnectNoiseBanner(msg.text)) {
            actions.addMessage({ type: "error", text: msg.text });
          }
          break;

        case "connectionState":
          if (msg.state) {
            const next = msg.state as
              | "disconnected"
              | "connecting"
              | "connected"
              | "error";
            actions.setConnectionState(next);
            // Connection banners should never stick around once we transition.
            if (next === "connected" || next === "connecting") {
              actions.setConnectAlert(null);
            }
          }
          break;

        case "agents":
          if (msg.agents) {
            actions.setAgents(msg.agents, msg.selected);
          }
          break;

        case "appInfo":
          actions.setAppVersion(
            typeof msg.version === "string" ? msg.version : null
          );
          break;

        case "agentChanged":
          if (msg.agentId) {
            const agentId = msg.agentId.trim();
            if (agentId) {
              const stateNow = useChatStore.getState();
              actions.setSelectedAgent(agentId);

              // Switching agents should not wipe existing sessions. Instead, start a new
              // empty session for the newly-selected agent.
              const currentSession = stateNow.getCurrentSession();
              const alreadyOnAgent =
                currentSession?.agentId === agentId &&
                stateNow.selectedAgentId === agentId;

              if (!alreadyOnAgent) {
                actions.addSession({
                  title: "New Chat",
                  agentId,
                  timestamp: Date.now(),
                  messages: [],
                });
              }
            }
          }
          actions.setModes([], "");
          actions.setModels([], "");
          actions.setAvailableCommands([]);
          break;

        case "chatCleared":
          // The UI may have already created a new local session entry (sidebar) before
          // asking the host to start a new chat. Preserve the selected session id to
          // avoid duplicating empty sessions.
          actions.clearThreadMessages();
          actions.setModes([], "");
          actions.setModels([], "");
          actions.setAvailableCommands([]);
          break;

        case "triggerNewChat":
          postMessage({ type: "newChat" });
          break;

        case "triggerClearChat":
          postMessage({ type: "clearChat" });
          break;

        case "sessionMetadata": {
          const stateNow = useChatStore.getState();
          const fastAgentSelected = isFastAgentSelected(
            stateNow.selectedAgentId,
            stateNow.agents
          );

          if (msg.modes?.availableModes?.length) {
            actions.setModes(msg.modes.availableModes, msg.modes.currentModeId);
          }
          if (msg.models?.availableModels?.length) {
            if (fastAgentSelected) {
              const mergedModels = mergeUniqueModels(
                msg.models.availableModels,
                FAST_AGENT_FALLBACK_MODELS
              );
              const currentModelId = resolveCurrentModelId(
                mergedModels,
                normalizeFastAgentModelId(
                  msg.models.currentModelId || stateNow.currentModelId
                )
              );
              actions.setModels(mergedModels, currentModelId);
            } else {
              actions.setModels(
                msg.models.availableModels,
                msg.models.currentModelId
              );
            }
          } else {
            if (fastAgentSelected) {
              const currentModelId = resolveCurrentModelId(
                FAST_AGENT_FALLBACK_MODELS,
                normalizeFastAgentModelId(
                  (typeof msg.models?.currentModelId === "string" &&
                  msg.models.currentModelId.trim()
                    ? msg.models.currentModelId.trim()
                    : stateNow.currentModelId) || ""
                )
              );
              actions.setModels(
                FAST_AGENT_FALLBACK_MODELS,
                currentModelId || resolveFallbackModelId("")
              );
            }
          }
          if (typeof msg.reasoningId === "string" && msg.reasoningId.trim()) {
            actions.setCurrentReasoning(msg.reasoningId.trim());
          }
          if (msg.commands) {
            actions.setAvailableCommands(msg.commands);
          }
          break;
        }

        case "reasoningUpdate":
          if (typeof msg.reasoningId === "string" && msg.reasoningId.trim()) {
            actions.setCurrentReasoning(msg.reasoningId.trim());
          }
          break;

        case "modeUpdate":
          if (msg.modeId) {
            actions.setCurrentMode(msg.modeId);
          }
          break;

        case "availableCommands":
          if (msg.commands) {
            actions.setAvailableCommands(msg.commands);
          }
          break;

        case "plan":
          if (msg.plan?.entries) {
            actions.setPlan(msg.plan.entries);
          }
          break;

        case "planComplete":
          actions.setPlan(null);
          break;

        case "filesAttached":
          if (msg.files && Array.isArray(msg.files)) {
            for (const file of msg.files) {
              actions.addAttachment({
                type: file.type || "file",
                name: file.name,
                content: file.content || "",
                path: file.path,
                language: file.language,
                lineRange: file.lineRange,
                mimeType: file.mimeType,
              });
            }
          }
          break;

        case "codeAttached":
          if (msg.code) {
            actions.addAttachment({
              type: "code",
              name: msg.code.fileName || "selection",
              content: msg.code.content,
              path: msg.code.path,
              language: msg.code.language,
              lineRange: msg.code.lineRange,
            });
          }
          break;

        case "sessions":
          if (msg.sessions) {
            actions.setSessions(msg.sessions);
          }
          break;
      }
    };

    window.addEventListener("message", handleMessage);
    return () => {
      window.removeEventListener("message", handleMessage);
      // Cleanup all throttle timeouts
      if (streamTimeoutRef.current) {
        clearTimeout(streamTimeoutRef.current);
      }
      if (thinkingTimeoutRef.current) {
        clearTimeout(thinkingTimeoutRef.current);
      }
      if (toolTimeoutRef.current) {
        clearTimeout(toolTimeoutRef.current);
      }
    };
  }, [getActions, postMessage]);

  // Restore state on mount (intentionally run only once)
  useEffect(() => {
    const restored = restoreState();
    postMessage({
      type: "ready",
      agentId:
        typeof restored?.selectedAgentId === "string" &&
        restored.selectedAgentId.trim()
          ? restored.selectedAgentId.trim()
          : undefined,
      modeId:
        typeof restored?.currentModeId === "string" &&
        restored.currentModeId.trim()
          ? restored.currentModeId.trim()
          : undefined,
      modelId:
        typeof restored?.currentModelId === "string" &&
        restored.currentModelId.trim()
          ? restored.currentModelId.trim()
          : undefined,
      reasoningId:
        typeof restored?.currentReasoningId === "string" &&
        restored.currentReasoningId.trim()
          ? restored.currentReasoningId.trim()
          : undefined,
    });
  }, []);

  // Save state when relevant values change
  useEffect(() => {
    saveState();
  }, [saveState]);

  // Auto-save session when messages change
  useEffect(() => {
    // Only save if we have messages and agent is selected
    if (messages.length > 0 && selectedAgentId) {
      const actions = getActions();

      // If no session exists, create one
      let sessionId = currentSessionId;
      if (!sessionId) {
        sessionId = actions.addSession({
          title: generateSessionTitle(messages),
          agentId: selectedAgentId,
          timestamp: Date.now(),
          messages: [],
        });
      }

      const session = {
        id: sessionId,
        title: generateSessionTitle(messages),
        agentId: selectedAgentId,
        timestamp: Date.now(),
        messages: messages.map((m) => ({
          id: m.id,
          type: m.type,
          text: m.text,
          promptText: m.promptText,
          html: m.html,
          thinkingText: m.thinkingText,
          timestamp: m.timestamp,
          attachments: m.attachments,
          tools: m.tools,
        })),
      };
      // Keep local sessions in sync even if the host doesn't persist sessions
      // (e.g. `acp-chat` web service ignores saveSession messages).
      actions.upsertSession(session as StoredSession);
      postMessage({ type: "saveSession", session });
    }
  }, [messages, currentSessionId, selectedAgentId, postMessage, getActions]);
}

// Generate a title from the first user message
function generateSessionTitle(
  messages: Array<{ type: string; text: string }>
): string {
  const firstUserMessage = messages.find((m) => m.type === "user");
  if (firstUserMessage) {
    const text = firstUserMessage.text.trim();
    return text.length > 50 ? text.substring(0, 50) + "..." : text;
  }
  return "New Chat";
}

// Hook for components to use VSCode API actions
export function useVsCodeApi() {
  const postMessage = useCallback((message: unknown) => {
    console.log("[ACP] Sending message:", message);
    vscode.postMessage(message);
  }, []);

  // Return stable function references
  return useMemo(
    () => ({
      postMessage,
      connect: () => {
        console.log("[ACP] Connect button clicked");
        const state = useChatStore.getState();
        // Avoid breaking the UI state machine by flipping to "connecting"
        // when we're already connected/connecting. The extension host will
        // still handle the connect request idempotently.
        if (
          state.connectionState === "connected" ||
          state.connectionState === "connecting"
        ) {
          state.setConnectAlert(null);
          return;
        }

        // Optimistically flip to "connecting" to avoid accidental double-clicks while
        // the extension host is starting the agent process.
        state.setConnectionState("connecting");
        state.setConnectAlert(null);
        postMessage({ type: "connect" });
      },
      sendMessage: (text: string, attachments?: Attachment[]) => {
        console.log(
          "[ACP] Send message:",
          text,
          "attachments:",
          attachments?.length || 0
        );
        postMessage({ type: "sendMessage", text, attachments });
      },
      cancel: () => {
        console.log("[ACP] Cancel requested");
        postMessage({ type: "cancel" });
      },
      selectAgent: (agentId: string) =>
        postMessage({ type: "selectAgent", agentId }),
      selectMode: (modeId: string) =>
        postMessage({ type: "selectMode", modeId }),
      selectModel: (modelId: string) =>
        postMessage({ type: "selectModel", modelId }),
      selectReasoning: (reasoningId: string) =>
        postMessage({ type: "selectReasoning", reasoningId }),
      copyMessage: (text: string) => postMessage({ type: "copyMessage", text }),
      newChat: () => {
        // Create a new session locally before sending to extension
        const { addSession, selectedAgentId } = useChatStore.getState();
        addSession({
          title: "New Chat",
          agentId: selectedAgentId || "claude-code",
          timestamp: Date.now(),
          messages: [],
        });
        postMessage({ type: "newChat" });
      },
      clearChat: () => {
        // Clear locally first so the UI is responsive even if the host takes time.
        useChatStore.getState().clearThreadMessages();
        postMessage({ type: "clearChat" });
      },
      selectFiles: () => postMessage({ type: "selectFiles" }),
      selectImages: () => postMessage({ type: "selectImages" }),
      selectSession: (sessionId: string) => {
        const { selectSession } = useChatStore.getState();
        selectSession(sessionId);
      },
      saveSession: (session: {
        id: string;
        title: string;
        agentId: string;
        timestamp: number;
        messages: Array<{
          id: string;
          type: string;
          text: string;
          promptText?: string;
          html?: string;
          thinkingText?: string;
          timestamp: number;
          attachments?: unknown[];
          tools?: Record<string, unknown>;
        }>;
      }) => {
        postMessage({ type: "saveSession", session });
      },
      deleteSession: (sessionId: string) => {
        const { deleteSession } = useChatStore.getState();
        deleteSession(sessionId);
        postMessage({ type: "deleteSession", sessionId });
      },
    }),
    [postMessage]
  );
}
