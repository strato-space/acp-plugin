import fs from "fs";
import os from "os";
import path from "path";

import type { AgentConfig } from "./agents";

type AgentServerSetting = {
  name?: string;
  command?: string;
  args?: unknown;
  cwd?: string;
  env?: Record<string, string>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
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
        continue;
      }
      if (c === "\\") {
        escaping = true;
        continue;
      }
      if (c === quote) {
        inString = false;
      }
      continue;
    }

    if ((c === '"' || c === "'") && !inString) {
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
    const stripped = removeTrailingCommas(stripJsonComments(noBom));
    try {
      return JSON.parse(stripped) as unknown;
    } catch {
      return null;
    }
  }
}

function expandVars(value: string): string {
  return value.replace(/\$\{([^}]+)\}/g, (_m, key: string) => {
    if (key === "userHome") return os.homedir();
    if (key.startsWith("env:")) {
      const envKey = key.slice("env:".length);
      return process.env[envKey] ?? "";
    }
    return "";
  });
}

function getAgentServers(parsed: Record<string, unknown>): Record<string, AgentServerSetting> {
  const assistant = parsed["assistant"];
  const assistantServers = (() => {
    if (!isRecord(assistant)) return undefined;
    const v =
      (assistant as Record<string, unknown>)["agent_servers"] ??
      (assistant as Record<string, unknown>)["agentServers"];
    return isRecord(v) ? (v as Record<string, AgentServerSetting>) : undefined;
  })();

  const v =
    parsed["acp.agentServers"] ??
    parsed["acp.agent_servers"] ??
    parsed["nexus.agentServers"] ??
    parsed["nexus.agent_servers"] ??
    parsed["agentServers"] ??
    parsed["agent_servers"] ??
    assistantServers;
  return isRecord(v) ? (v as Record<string, AgentServerSetting>) : {};
}

function getIncludeBuiltins(parsed: Record<string, unknown>): boolean | undefined {
  const v = parsed["acp.includeBuiltInAgents"] ?? parsed["nexus.includeBuiltInAgents"];
  return typeof v === "boolean" ? v : undefined;
}

export type ExternalAgentSettings = {
  includeBuiltins?: boolean;
  agents: AgentConfig[];
  sourcePath?: string;
};

export function loadExternalAgentSettings(): ExternalAgentSettings {
  const candidates = [
    path.join(os.homedir(), ".vscode", "settings.json"),
    // Remote-SSH / server-side VS Code settings.
    path.join(os.homedir(), ".vscode-server", "data", "Machine", "settings.json"),
    path.join(os.homedir(), ".vscode-server", "data", "User", "settings.json"),
    "/home/.vscode/settings.json",
    "/home/strato-space/.vscode/settings.json",
  ];

  for (const p of candidates) {
    try {
      if (!fs.existsSync(p)) continue;
      const raw = fs.readFileSync(p, "utf8");
      const parsed = parseJsonc(raw);
      if (!isRecord(parsed)) continue;

      const includeBuiltins = getIncludeBuiltins(parsed);
      const servers = getAgentServers(parsed);
      if (Object.keys(servers).length === 0 && includeBuiltins === undefined) {
        continue;
      }

      const agents: AgentConfig[] = [];
      for (const [id, rawServer] of Object.entries(servers)) {
        if (!rawServer || typeof rawServer !== "object") continue;
        const command = (rawServer as any).command;
        if (!command || typeof command !== "string") continue;

        const args: string[] = Array.isArray((rawServer as any).args)
          ? (rawServer as any).args.filter((a: unknown): a is string => typeof a === "string")
          : [];

        agents.push({
          id,
          name: (rawServer as any).name && typeof (rawServer as any).name === "string" ? (rawServer as any).name : id,
          command: expandVars(command),
          args: args.map(expandVars),
          cwd: (rawServer as any).cwd && typeof (rawServer as any).cwd === "string" ? expandVars((rawServer as any).cwd) : undefined,
          env: (rawServer as any).env && typeof (rawServer as any).env === "object" ? (rawServer as any).env : undefined,
        });
      }

      return { includeBuiltins, agents, sourcePath: p };
    } catch {
      // ignore invalid files; users can still rely on built-ins.
      continue;
    }
  }

  return { agents: [] };
}
