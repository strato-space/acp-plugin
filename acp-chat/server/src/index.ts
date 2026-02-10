import http from "http";
import path from "path";
import fs from "fs";
import express from "express";
import { WebSocketServer } from "ws";
import type { WebSocket } from "ws";

import type { SessionNotification, ContentBlock } from "@agentclientprotocol/sdk";
import { ACPClient } from "./acp/client";
import {
  getAgent,
  getAgentsWithStatus,
  getFirstAvailableAgent,
  setCustomAgents,
  type AgentConfig,
} from "./acp/agents";
import { loadExternalAgentSettings } from "./acp/external_settings";

type ConnectionState = "disconnected" | "connecting" | "connected" | "error";

type Attachment = {
  id: string;
  type: "file" | "image" | "code";
  name: string;
  content: string;
  path?: string;
  language?: string;
  lineRange?: [number, number];
  mimeType?: string;
};

type IncomingMessage =
  | { type: "ready"; agentId?: string; modeId?: string; modelId?: string }
  | { type: "connect" }
  | { type: "cancel" }
  | { type: "newChat" }
  | { type: "clearChat" }
  | { type: "selectAgent"; agentId: string }
  | { type: "selectMode"; modeId: string }
  | { type: "selectModel"; modelId: string }
  | { type: "sendMessage"; text?: string; attachments?: Attachment[] };

function send(ws: WebSocket, msg: Record<string, unknown>) {
  ws.send(JSON.stringify(msg));
}

function getAuthToken(req: http.IncomingMessage): string | null {
  const header = req.headers["authorization"];
  if (typeof header === "string") {
    const m = header.match(/^Bearer\s+(.+)$/i);
    if (m) return m[1].trim();
  }
  try {
    const u = new URL(req.url ?? "", "http://localhost");
    const q = u.searchParams.get("token");
    if (q && q.trim()) return q.trim();
  } catch {
    // ignore
  }
  return null;
}

function toDisplayText(text: string, attachments?: Attachment[]): string {
  const displayParts: string[] = [];

  if (attachments && attachments.length > 0) {
    for (const att of attachments) {
      if (att.type === "image") {
        displayParts.push(`[Image: ${att.name}]`);
      } else if (att.type === "code") {
        const lang = att.language || "";
        const range = att.lineRange ? ` (lines ${att.lineRange[0]}-${att.lineRange[1]})` : "";
        displayParts.push(
          `\`\`\`${lang}\n// File: ${att.path || att.name}${range}\n${att.content}\n\`\`\``
        );
      } else {
        displayParts.push(
          `\`\`\`\n// File: ${att.path || att.name}\n${att.content}\n\`\`\``
        );
      }
    }
  }

  if (text && text.trim()) displayParts.push(text);
  return displayParts.join("\n\n");
}

function toContentBlocks(text: string, attachments?: Attachment[]): ContentBlock[] {
  const blocks: ContentBlock[] = [];

  if (attachments && attachments.length > 0) {
    for (const att of attachments) {
      if (att.type === "image") {
        const base64Data = att.content.includes(",") ? att.content.split(",")[1] : att.content;
        blocks.push({
          type: "image",
          data: base64Data,
          mimeType: att.mimeType || "image/png",
        });
        continue;
      }

      if (att.type === "code") {
        const lang = att.language || "";
        const range = att.lineRange ? ` (lines ${att.lineRange[0]}-${att.lineRange[1]})` : "";
        const codeBlock = `\`\`\`${lang}\n// File: ${att.path || att.name}${range}\n${att.content}\n\`\`\``;
        blocks.push({ type: "text", text: codeBlock });
        continue;
      }

      const fileBlock = `\`\`\`\n// File: ${att.path || att.name}\n${att.content}\n\`\`\``;
      blocks.push({ type: "text", text: fileBlock });
    }
  }

  if (text && text.trim()) blocks.push({ type: "text", text });
  return blocks;
}

function mapConnectionState(state: ConnectionState): ConnectionState {
  return state;
}

function mapToolStatus(status: unknown): "running" | "completed" | "failed" {
  const raw = typeof status === "string" ? status.toLowerCase() : "";
  if (["completed", "complete", "done", "success", "succeeded"].includes(raw)) return "completed";
  if (["failed", "error"].includes(raw)) return "failed";
  return "running";
}

type WsContext = {
  ws: WebSocket;
  client: ACPClient;
  hasSession: boolean;
  streamingText: string;
  stderrBuffer: string;
  agentId: string;
};

const APP_VERSION = (() => {
  const env = (process.env.ACP_APP_VERSION || process.env.ACP_CHAT_VERSION || "").trim();
  if (env) {
    // Avoid showing confusing non-version identifiers (e.g. "acp-chat") in the UI.
    // Accept semver-ish values like "0.1.20" or "0.1.20-dev.1".
    const looksLikeSemver = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(env);
    if (looksLikeSemver) return env;
  }
  try {
    // Walk up to the monorepo root (repo package.json).
    // When built, __dirname is `acp-chat/server/dist`.
    const rootPkg = path.resolve(__dirname, "../../../package.json");
    const parsed = JSON.parse(fs.readFileSync(rootPkg, "utf8")) as { version?: unknown };
    if (typeof parsed.version === "string" && parsed.version.trim()) return parsed.version.trim();
  } catch {
    // ignore
  }
  return "";
})();

function ensureStratoProjectAgent(agents: AgentConfig[]): AgentConfig[] {
  const out = [...agents];

  const hasTransportAcp = (a: AgentConfig) => {
    const idx = a.args.indexOf("--transport");
    if (idx === -1) return false;
    const next = a.args[idx + 1];
    return typeof next === "string" && next.toLowerCase() === "acp";
  };

  const ensureWatch = (a: AgentConfig) => {
    // fast-agent supports `--watch` to reload AgentCard changes.
    // Only apply it to ACP transports to avoid surprising behavior for non-ACP agents.
    if (hasTransportAcp(a) && !a.args.includes("--watch")) {
      a.args = [...a.args, "--watch"];
    }
  };

  for (const a of out) ensureWatch(a);

  const has = out.some((a) => a.id.toLowerCase() === "stratoproject");
  if (!has) {
    out.push({
      id: "stratoproject",
      name: "StratoProject",
      command: "uv",
      args: [
        "--directory",
        "/home/strato-space/prompt/StratoProject/app",
        "run",
        "--active",
        "StratoProject.py",
        "--transport",
        "acp",
        "--watch",
      ],
      env: { PYTHONUNBUFFERED: "1" },
    });
  }

  return out;
}

async function ensureConnected(ctx: WsContext) {
  const state = ctx.client.getState();
  if (state === "connecting") return;
  if (state === "connected") return;
  await ctx.client.connect();
}

async function ensureSession(ctx: WsContext) {
  if (ctx.hasSession) return;
  const workingDir = process.cwd();
  await ctx.client.newSession(workingDir);
  ctx.hasSession = true;
}

function translateSessionUpdate(ctx: WsContext, n: SessionNotification) {
  const update = n.update;

  if (update.sessionUpdate === "agent_message_chunk") {
    if (update.content.type === "text") {
      ctx.streamingText += update.content.text;
      send(ctx.ws, { type: "streamChunk", text: update.content.text });
    }
    return;
  }

  if (update.sessionUpdate === "agent_thought_chunk") {
    if (update.content.type === "text") {
      send(ctx.ws, { type: "thinkingChunk", text: update.content.text });
    }
    return;
  }

  if (update.sessionUpdate === "tool_call") {
    const meta = (update as unknown as { _meta?: unknown })._meta;
    send(ctx.ws, {
      type: "toolCallStart",
      name: update.title,
      toolCallId: update.toolCallId,
      kind: update.kind,
      meta,
      rawInput: (update as unknown as { rawInput?: unknown }).rawInput,
      rawOutput: (update as unknown as { rawOutput?: unknown }).rawOutput,
    });
    return;
  }

  if (update.sessionUpdate === "tool_call_update") {
    send(ctx.ws, {
      type: "toolCallComplete",
      toolCallId: update.toolCallId,
      title: update.title,
      kind: update.kind,
      content: update.content,
      rawInput: update.rawInput,
      rawOutput: update.rawOutput,
      meta: (update as unknown as { _meta?: unknown })._meta,
      status: mapToolStatus(update.status),
    });
    return;
  }

  if (update.sessionUpdate === "available_commands_update") {
    send(ctx.ws, { type: "availableCommands", commands: update.availableCommands });
    return;
  }

  if (update.sessionUpdate === "plan") {
    send(ctx.ws, { type: "plan", plan: { entries: update.entries } });
    return;
  }

  if (update.sessionUpdate === "current_mode_update") {
    send(ctx.ws, { type: "modeUpdate", modeId: update.currentModeId });
    return;
  }
}

async function handleIncoming(ctx: WsContext, msg: IncomingMessage) {
  switch (msg.type) {
    case "ready": {
      // Initialize UI with server-side state and immediately connect.
      send(ctx.ws, {
        type: "connectionState",
        state: mapConnectionState(ctx.client.getState()),
      });
      send(ctx.ws, { type: "appInfo", version: APP_VERSION || "0.1.22" });

      const agents = getAgentsWithStatus();
      if (agents.length === 0) {
        // Nothing to connect to. Keep the UI responsive and explicit.
        send(ctx.ws, { type: "agents", agents: [], selected: null });
        send(ctx.ws, { type: "sessionMetadata", modes: null, models: null, commands: null });
        // Treat this as an error so the UI shows the alert (it only renders alerts in error state).
        send(ctx.ws, { type: "connectionState", state: "error" });
        send(ctx.ws, {
          type: "connectAlert",
          text: "No ACP agents are configured on this host.",
        });
        return;
      }
      let selected: string | null = null;
      let selectedAvailable = false;

      // If the client provides a preferred agent id, honor it when valid.
      const requestedAgentId =
        typeof msg.agentId === "string" && msg.agentId.trim()
          ? msg.agentId.trim()
          : null;

      if (requestedAgentId) {
        const requested = getAgent(requestedAgentId);
        if (requested) {
          ctx.agentId = requestedAgentId;
          ctx.client.setAgent(requested);
          ctx.hasSession = false;
          selected = requestedAgentId;
          selectedAvailable =
            agents.find((a) => a.id === requestedAgentId)?.available ?? false;
        }
      }

      // If no requested agent was applied, pick the first configured agent.
      if (!selected) {
        const fallback = agents.find((a) => a.available) ?? agents[0] ?? null;
        if (fallback) {
          ctx.agentId = fallback.id;
          ctx.client.setAgent(fallback);
          ctx.hasSession = false;
          selected = fallback.id;
          selectedAvailable = fallback.available;
        }
      }

      send(ctx.ws, {
        type: "agents",
        agents: agents.map((a) => ({ id: a.id, name: a.name, available: a.available })),
        selected,
      });
      send(ctx.ws, { type: "sessionMetadata", modes: null, models: null, commands: null });
      // `acp-chat` does not persist sessions server-side; keep the client-side (local) sessions intact.

      // Auto-connect on load when we have a valid *available* selected agent.
      if (selected && selectedAvailable) {
        try {
          send(ctx.ws, { type: "connectionState", state: "connecting" });
          await ensureConnected(ctx);
          send(ctx.ws, { type: "connectionState", state: "connected" });
          await ensureSession(ctx);

          if (typeof msg.modeId === "string" && msg.modeId.trim()) {
            await ctx.client.setMode(msg.modeId.trim());
          }
          if (typeof msg.modelId === "string" && msg.modelId.trim()) {
            await ctx.client.setModel(msg.modelId.trim());
          }

          const meta = ctx.client.getSessionMetadata();
          send(ctx.ws, {
            type: "sessionMetadata",
            modes: meta?.modes ?? null,
            models: meta?.models ?? null,
            commands: meta?.commands ?? null,
          });
        } catch (e) {
          send(ctx.ws, { type: "connectionState", state: "error" });
          send(ctx.ws, {
            type: "connectAlert",
            text: e instanceof Error ? e.message : String(e),
          });
        }
      } else if (selected && !selectedAvailable) {
        send(ctx.ws, { type: "connectionState", state: "disconnected" });
        send(ctx.ws, {
          type: "connectAlert",
          text: `Agent is not available: ${selected}`,
        });
      }
      return;
    }

    case "selectAgent": {
      const nextAgentId = msg.agentId;
      const a = getAgent(nextAgentId);
      if (!a) {
        send(ctx.ws, { type: "error", text: `Unknown agent: ${nextAgentId}` });
        return;
      }
      const status = getAgentsWithStatus().find((agent) => agent.id === nextAgentId);
      if (status && !status.available) {
        send(ctx.ws, { type: "connectionState", state: "disconnected" });
        send(ctx.ws, { type: "connectAlert", text: `Agent is not available: ${status.name}` });
        send(ctx.ws, { type: "agentChanged", agentId: nextAgentId });
        return;
      }
      ctx.agentId = nextAgentId;
      ctx.client.setAgent(a);
      ctx.hasSession = false;
      send(ctx.ws, { type: "agentChanged", agentId: nextAgentId });
      send(ctx.ws, { type: "sessionMetadata", modes: null, models: null, commands: null });

      // Auto-connect on agent switch (no Connect button in the UI).
      try {
        send(ctx.ws, { type: "connectionState", state: "connecting" });
        await ensureConnected(ctx);
        send(ctx.ws, { type: "connectionState", state: "connected" });
        await ensureSession(ctx);
        const meta = ctx.client.getSessionMetadata();
        send(ctx.ws, { type: "sessionMetadata", modes: meta?.modes ?? null, models: meta?.models ?? null, commands: meta?.commands ?? null });
      } catch (e) {
        send(ctx.ws, { type: "connectionState", state: "error" });
        send(ctx.ws, { type: "connectAlert", text: e instanceof Error ? e.message : String(e) });
      }
      return;
    }

    case "connect": {
      try {
        send(ctx.ws, { type: "connectionState", state: "connecting" });
        await ensureConnected(ctx);
        send(ctx.ws, { type: "connectionState", state: "connected" });
        await ensureSession(ctx);
        const meta = ctx.client.getSessionMetadata();
        send(ctx.ws, { type: "sessionMetadata", modes: meta?.modes ?? null, models: meta?.models ?? null, commands: meta?.commands ?? null });
      } catch (e) {
        send(ctx.ws, { type: "connectionState", state: "error" });
        send(ctx.ws, { type: "connectAlert", text: e instanceof Error ? e.message : String(e) });
      }
      return;
    }

    case "selectMode": {
      try {
        await ctx.client.setMode(msg.modeId);
        const meta = ctx.client.getSessionMetadata();
        send(ctx.ws, { type: "sessionMetadata", modes: meta?.modes ?? null, models: meta?.models ?? null, commands: meta?.commands ?? null });
      } catch (e) {
        send(ctx.ws, { type: "error", text: e instanceof Error ? e.message : String(e) });
      }
      return;
    }

    case "selectModel": {
      try {
        await ctx.client.setModel(msg.modelId);
        const meta = ctx.client.getSessionMetadata();
        send(ctx.ws, { type: "sessionMetadata", modes: meta?.modes ?? null, models: meta?.models ?? null, commands: meta?.commands ?? null });
      } catch (e) {
        send(ctx.ws, { type: "error", text: e instanceof Error ? e.message : String(e) });
      }
      return;
    }

    case "cancel": {
      await ctx.client.cancel();
      return;
    }

    case "newChat": {
      ctx.hasSession = false;
      send(ctx.ws, { type: "chatCleared" });
      send(ctx.ws, { type: "sessionMetadata", modes: null, models: null, commands: null });
      try {
        await ensureConnected(ctx);
        await ensureSession(ctx);
        const meta = ctx.client.getSessionMetadata();
        send(ctx.ws, { type: "sessionMetadata", modes: meta?.modes ?? null, models: meta?.models ?? null, commands: meta?.commands ?? null });
      } catch {
        // ignore
      }
      return;
    }

    case "clearChat": {
      send(ctx.ws, { type: "chatCleared" });
      return;
    }

    case "sendMessage": {
      const text = msg.text ?? "";
      const attachments = msg.attachments ?? [];

      const displayText = toDisplayText(text, attachments);
      const imageAttachments = attachments.filter((a) => a.type === "image");

      send(ctx.ws, { type: "userMessage", text: displayText, attachments: imageAttachments.length > 0 ? imageAttachments : undefined });

      ctx.streamingText = "";
      ctx.stderrBuffer = "";
      send(ctx.ws, { type: "streamStart" });

      try {
        await ensureConnected(ctx);
        await ensureSession(ctx);
        const response = await ctx.client.sendMessage(toContentBlocks(text, attachments));

        if (ctx.streamingText.length === 0) {
          send(ctx.ws, { type: "error", text: "Agent returned no streaming response." });
          send(ctx.ws, { type: "streamEnd", stopReason: "error" });
        } else {
          send(ctx.ws, { type: "streamEnd", stopReason: response.stopReason });
        }
        ctx.streamingText = "";
      } catch (e) {
        send(ctx.ws, { type: "error", text: e instanceof Error ? e.message : String(e) });
        send(ctx.ws, { type: "streamEnd", stopReason: "error" });
        ctx.streamingText = "";
        ctx.stderrBuffer = "";
      }
      return;
    }
  }
}

// Load custom agents from the same VS Code settings locations as the plugin.
// This keeps `acp-chat` aligned with your local environment (e.g. StratoProject).
{
  const external = loadExternalAgentSettings();
  const agents = ensureStratoProjectAgent(external.agents);
  const includeBuiltins = true;
  if (external.includeBuiltins === false) {
    // eslint-disable-next-line no-console
    console.warn(
      "[acp-chat] includeBuiltins=false ignored; built-in agents are always enabled for agents-dev"
    );
  }
  setCustomAgents({ includeBuiltins, agents });
  if (external.sourcePath) {
    // eslint-disable-next-line no-console
    console.log(
      `[acp-chat] loaded custom agents: ${agents.length} includeBuiltins=${includeBuiltins} from ${external.sourcePath}`
    );
  } else if (agents.length > 0) {
    // eslint-disable-next-line no-console
    console.log(
      `[acp-chat] custom agents: ${agents.length} includeBuiltins=${includeBuiltins} (defaults)`
    );
  }
}

const PORT = Number.parseInt(process.env.ACP_CHAT_PORT || "8732", 10);
const HOST = process.env.ACP_CHAT_HOST || "127.0.0.1";
const AUTH_TOKEN = process.env.ACP_CHAT_AUTH_TOKEN || "";

const app = express();
app.use(express.json({ limit: "10mb" }));

app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.get("/api/agents", (_req, res) => {
  const agents = getAgentsWithStatus();
  res.json({
    agents: agents.map((a) => ({ id: a.id, name: a.name, available: a.available })),
  });
});

// Serve static client (optional; build web first)
const webDist = path.resolve(__dirname, "../../web/dist");
if (fs.existsSync(webDist)) {
  app.use(
    express.static(webDist, {
      setHeaders: (res, filePath) => {
        // Avoid stale UI bugs after deploys by preventing caching of HTML.
        if (path.basename(filePath) === "index.html") {
          res.setHeader("Cache-Control", "no-store");
          return;
        }

        // Hashed assets are safe to cache aggressively.
        if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
          return;
        }

        res.setHeader("Cache-Control", "public, max-age=3600");
      },
    })
  );
  app.get("*", (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.sendFile(path.join(webDist, "index.html"));
  });
}

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

wss.on("connection", (ws, req) => {
  if (AUTH_TOKEN) {
    const token = getAuthToken(req);
    if (!token || token !== AUTH_TOKEN) {
      ws.close(1008, "unauthorized");
      return;
    }
  }

  const connectTimeoutMs = Number.parseInt(process.env.ACP_CONNECT_TIMEOUT_MS || "600000", 10);
  const client = new ACPClient({ connectTimeoutMs });
  const first = getFirstAvailableAgent();
  client.setAgent(first);

  const ctx: WsContext = {
    ws,
    client,
    hasSession: false,
    streamingText: "",
    stderrBuffer: "",
    agentId: first.id,
  };

  const unsubState = client.setOnStateChange((state) => {
    send(ws, { type: "connectionState", state });
  });
  const unsubUpdates = client.setOnSessionUpdate((n) => translateSessionUpdate(ctx, n));
  const unsubStderr = client.setOnStderr((_text) => {
    // Keep for debugging; we don't forward stderr to the UI by default.
  });

  ws.on("message", async (data) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(data.toString("utf8"));
    } catch {
      send(ws, { type: "error", text: "Invalid JSON message" });
      return;
    }

    const msg = parsed as IncomingMessage;
    try {
      await handleIncoming(ctx, msg);
    } catch (e) {
      send(ws, { type: "error", text: e instanceof Error ? e.message : String(e) });
    }
  });

  ws.on("close", () => {
    unsubState();
    unsubUpdates();
    unsubStderr();
    client.dispose();
  });
});

server.listen(PORT, HOST, () => {
  // eslint-disable-next-line no-console
  console.log(`[acp-chat] listening on http://${HOST}:${PORT}`);
});
