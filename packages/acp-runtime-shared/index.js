/** @typedef {"system"|"minimal"|"low"|"medium"|"high"} ReasoningLevel */

/**
 * @typedef AgentConfig
 * @property {string} id
 * @property {string} name
 * @property {string} command
 * @property {string[]} args
 * @property {string=} cwd
 * @property {Record<string,string>=} env
 */

/**
 * @typedef AgentServerSetting
 * @property {string=} type
 * @property {string=} name
 * @property {string=} command
 * @property {unknown=} args
 * @property {string=} cwd
 * @property {Record<string,string>=} env
 */

/** @type {AgentConfig[]} */
const BUILTIN_AGENTS = [
  {
    id: "codex",
    name: "Codex CLI",
    command: "npx",
    args: ["--yes", "@zed-industries/codex-acp@latest"],
  },
  {
    id: "fast-agent-acp",
    name: "Fast Agent ACP",
    command: "uvx",
    args: ["fast-agent-acp", "--shell", "--model", "codex"],
  },
  {
    id: "github-copilot",
    name: "GitHub Copilot",
    command: "npx",
    args: ["--yes", "@github/copilot-language-server@latest", "--acp"],
  },
  {
    id: "claude-code",
    name: "Claude Code",
    command: "npx",
    args: ["--yes", "@zed-industries/claude-code-acp@latest"],
  },
  {
    id: "gemini",
    name: "Gemini CLI",
    command: "npx",
    args: ["--yes", "@google/gemini-cli@latest", "--experimental-acp"],
  },
  {
    id: "qwen-code",
    name: "Qwen Code",
    command: "npx",
    args: [
      "--yes",
      "@qwen-code/qwen-code@latest",
      "--acp",
      "--experimental-skills",
    ],
  },
  {
    id: "auggie",
    name: "Auggie CLI",
    command: "npx",
    args: ["--yes", "@augmentcode/auggie@latest", "--acp"],
  },
  {
    id: "qoder",
    name: "Qoder CLI",
    command: "npx",
    args: ["--yes", "@qoder-ai/qodercli@latest", "--acp"],
  },
  {
    id: "opencode",
    name: "OpenCode",
    command: "npx",
    args: ["--yes", "opencode-ai@latest", "acp"],
  },
];

/**
 * @param {string | undefined | null} value
 * @returns {ReasoningLevel}
 */
function normalizeReasoningLevel(value) {
  const v = (value || "").trim().toLowerCase();
  if (v === "minimal" || v === "low" || v === "medium" || v === "high") return v;
  return "system";
}

/**
 * @param {{id: string, name: string}} agent
 * @returns {boolean}
 */
function isCodexAgent(agent) {
  const id = agent.id.toLowerCase();
  if (id === "codex") return true;
  return agent.name.toLowerCase().includes("codex");
}

/**
 * @param {{id: string, name: string}} agent
 * @returns {boolean}
 */
function isFastAgent(agent) {
  const id = agent.id.toLowerCase();
  if (id === "fast-agent-acp") return true;
  return agent.name.toLowerCase().includes("fast agent");
}

/**
 * @param {string} modelId
 * @param {ReasoningLevel} reasoning
 * @returns {string}
 */
function withModelReasoning(modelId, reasoning) {
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

/**
 * @param {string[]} args
 * @param {string} key
 * @param {string} value
 * @returns {string[]}
 */
function upsertArg(args, key, value) {
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

/**
 * @param {string[]} args
 * @returns {string[]}
 */
function removeCodexReasoningOverride(args) {
  const out = [];
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

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isRecord(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/**
 * @param {string} input
 * @returns {string}
 */
function stripJsonComments(input) {
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

/**
 * @param {string} input
 * @returns {string}
 */
function removeTrailingCommas(input) {
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

/**
 * @param {string} raw
 * @returns {unknown}
 */
function parseJsonc(raw) {
  const noBom = raw.replace(/^\uFEFF/, "");
  try {
    return JSON.parse(noBom);
  } catch {
    const stripped = removeTrailingCommas(stripJsonComments(noBom));
    try {
      return JSON.parse(stripped);
    } catch {
      return null;
    }
  }
}

/**
 * @param {Record<string, unknown>} parsed
 * @returns {Record<string, AgentServerSetting>}
 */
function getAgentServers(parsed) {
  const merged = {};

  const merge = (v) => {
    if (!isRecord(v)) return;
    Object.assign(merged, v);
  };

  merge(parsed["acp.agents"]);
  merge(parsed["agent_servers"]);

  return merged;
}

/**
 * @param {Record<string, unknown>} parsed
 * @returns {boolean | undefined}
 */
function getIncludeBuiltins(parsed) {
  const v = parsed["acp.includeBuiltInAgents"];
  return typeof v === "boolean" ? v : undefined;
}

/**
 * @param {string[]} args
 * @returns {boolean}
 */
function hasTransportAcpArg(args) {
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--transport") {
      const next = args[i + 1];
      if (typeof next === "string" && next.toLowerCase() === "acp") return true;
    }
    const lower = a.toLowerCase();
    if (lower.startsWith("--transport=")) {
      const value = lower.slice("--transport=".length);
      if (value === "acp") return true;
    }
  }
  return false;
}

/**
 * @param {string[]} args
 * @returns {string[]}
 */
function ensureWatchForAcpTransport(args) {
  if (!hasTransportAcpArg(args)) return args;
  if (args.includes("--watch")) return args;
  return [...args, "--watch"];
}

/**
 * @param {Record<string, AgentServerSetting>} servers
 * @param {{
 *   expandVars: (value: string) => string,
 *   ensureWatchForTransportAcp?: boolean
 * }} options
 * @returns {AgentConfig[]}
 */
function toAgentConfigsFromServers(servers, options) {
  const agents = [];
  for (const [id, rawServer] of Object.entries(servers)) {
    if (!rawServer || typeof rawServer !== "object") continue;

    const command = rawServer.command;
    if (!command || typeof command !== "string") continue;

    const rawArgs = Array.isArray(rawServer.args)
      ? rawServer.args.filter((a) => typeof a === "string")
      : [];

    let args = rawArgs.map(options.expandVars);
    if (options.ensureWatchForTransportAcp) {
      args = ensureWatchForAcpTransport(args);
    }

    agents.push({
      id,
      name:
        rawServer.name && typeof rawServer.name === "string"
          ? rawServer.name
          : id,
      command: options.expandVars(command),
      args,
      cwd:
        rawServer.cwd && typeof rawServer.cwd === "string"
          ? options.expandVars(rawServer.cwd)
          : undefined,
      env:
        rawServer.env && typeof rawServer.env === "object"
          ? rawServer.env
          : undefined,
    });
  }
  return agents;
}

/**
 * @param {{scope: "global"|"workspace", servers: Record<string, AgentServerSetting>, includeBuiltins?: boolean, sourcePath?: string}[]} entries
 * @returns {{servers: Record<string, AgentServerSetting>, includeBuiltins?: boolean, sourcePath?: string}}
 */
function mergeScopedExternalSettings(entries) {
  const globalServers = {};
  const workspaceServers = {};
  let includeGlobal;
  let includeWorkspace;
  /** @type {string[]} */
  const loadedPaths = [];

  for (const entry of entries) {
    if (entry.scope === "workspace") {
      Object.assign(workspaceServers, entry.servers);
      if (entry.includeBuiltins !== undefined) includeWorkspace = entry.includeBuiltins;
    } else {
      Object.assign(globalServers, entry.servers);
      if (entry.includeBuiltins !== undefined) includeGlobal = entry.includeBuiltins;
    }
    if (entry.sourcePath) loadedPaths.push(entry.sourcePath);
  }

  return {
    servers: { ...globalServers, ...workspaceServers },
    includeBuiltins: includeWorkspace !== undefined ? includeWorkspace : includeGlobal,
    sourcePath: loadedPaths.length > 0 ? loadedPaths.join(", ") : undefined,
  };
}

/**
 * @param {{ includeBuiltins?: boolean, builtins: AgentConfig[], customAgents: AgentConfig[], ensureWatchForTransportAcpCustom?: boolean }} options
 * @returns {(AgentConfig & { source: "builtin" | "custom" })[]}
 */
function resolveEffectiveAgents(options) {
  const merged = new Map();
  if (options.includeBuiltins ?? true) {
    for (const agent of options.builtins) {
      merged.set(agent.id, { ...agent, source: "builtin" });
    }
  }

  for (const agent of options.customAgents) {
    const args = Array.isArray(agent.args) ? agent.args : [];
    const normalized = options.ensureWatchForTransportAcpCustom
      ? { ...agent, args: ensureWatchForAcpTransport(args) }
      : { ...agent, args };
    merged.set(agent.id, { ...normalized, source: "custom" });
  }

  return [...merged.values()];
}

/**
 * @param {unknown} status
 * @returns {"running" | "completed" | "failed"}
 */
function mapToolStatus(status) {
  const raw = typeof status === "string" ? status.toLowerCase() : "";
  if (["completed", "complete", "done", "success", "succeeded"].includes(raw)) {
    return "completed";
  }
  if (["failed", "error"].includes(raw)) return "failed";
  return "running";
}

/**
 * @param {string} text
 * @param {Array<{type: "file" | "image" | "code", name: string, content: string, path?: string, language?: string, lineRange?: [number, number], mimeType?: string}> | undefined} attachments
 * @returns {string}
 */
function toDisplayText(text, attachments) {
  const displayParts = [];
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

/**
 * @param {string} text
 * @param {Array<{type: "file" | "image" | "code", name: string, content: string, path?: string, language?: string, lineRange?: [number, number], mimeType?: string}> | undefined} attachments
 * @returns {Array<{type: "text", text: string} | {type: "image", data: string, mimeType: string}>}
 */
function toContentBlocks(text, attachments) {
  const blocks = [];
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
        blocks.push({
          type: "text",
          text: `\`\`\`${lang}\n// File: ${att.path || att.name}${range}\n${att.content}\n\`\`\``,
        });
        continue;
      }
      blocks.push({
        type: "text",
        text: `\`\`\`\n// File: ${att.path || att.name}\n${att.content}\n\`\`\``,
      });
    }
  }
  if (text && text.trim()) blocks.push({ type: "text", text });
  return blocks;
}

/**
 * @param {any} update
 * @returns {Array<Record<string, unknown>>}
 */
function mapSessionUpdateToUiEvents(update) {
  if (!update || typeof update !== "object") return [];

  if (update.sessionUpdate === "agent_message_chunk") {
    if (update.content?.type === "text") {
      return [{ type: "streamChunk", text: update.content.text }];
    }
    return [];
  }

  if (update.sessionUpdate === "agent_thought_chunk") {
    if (update.content?.type === "text") {
      return [{ type: "thinkingChunk", text: update.content.text }];
    }
    return [];
  }

  if (update.sessionUpdate === "tool_call") {
    return [
      {
        type: "toolCallStart",
        name: update.title,
        toolCallId: update.toolCallId,
        kind: update.kind,
        meta: update._meta,
        rawInput: update.rawInput,
        rawOutput: update.rawOutput,
      },
    ];
  }

  if (update.sessionUpdate === "tool_call_update") {
    return [
      {
        type: "toolCallComplete",
        toolCallId: update.toolCallId,
        title: update.title,
        kind: update.kind,
        content: update.content,
        rawInput: update.rawInput,
        rawOutput: update.rawOutput,
        meta: update._meta,
        status: mapToolStatus(update.status),
      },
    ];
  }

  if (update.sessionUpdate === "available_commands_update") {
    return [{ type: "availableCommands", commands: update.availableCommands }];
  }

  if (update.sessionUpdate === "plan") {
    return [{ type: "plan", plan: { entries: update.entries } }];
  }

  if (update.sessionUpdate === "current_mode_update") {
    return [{ type: "modeUpdate", modeId: update.currentModeId }];
  }

  return [];
}

module.exports = {
  BUILTIN_AGENTS,
  normalizeReasoningLevel,
  isCodexAgent,
  isFastAgent,
  withModelReasoning,
  upsertArg,
  removeCodexReasoningOverride,
  isRecord,
  stripJsonComments,
  removeTrailingCommas,
  parseJsonc,
  getAgentServers,
  getIncludeBuiltins,
  hasTransportAcpArg,
  ensureWatchForAcpTransport,
  toAgentConfigsFromServers,
  mergeScopedExternalSettings,
  resolveEffectiveAgents,
  mapToolStatus,
  toDisplayText,
  toContentBlocks,
  mapSessionUpdateToUiEvents,
};
