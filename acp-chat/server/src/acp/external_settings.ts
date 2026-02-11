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
}

function getIncludeBuiltins(parsed: Record<string, unknown>): boolean | undefined {
  const v = parsed["acp.includeBuiltInAgents"];
  return typeof v === "boolean" ? v : undefined;
}

export type ExternalAgentSettings = {
  includeBuiltins?: boolean;
  agents: AgentConfig[];
  sourcePath?: string;
};

export function loadExternalAgentSettings(): ExternalAgentSettings {
  const candidates: Array<{ path: string; scope: "global" | "workspace" }> = [
    { path: path.join(os.homedir(), ".vscode", "settings.json"), scope: "global" },
    // Remote-SSH / server-side VS Code settings.
    {
      path: path.join(os.homedir(), ".vscode-server", "data", "Machine", "settings.json"),
      scope: "global",
    },
    {
      path: path.join(os.homedir(), ".vscode-server", "data", "User", "settings.json"),
      scope: "global",
    },
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

      const include = getIncludeBuiltins(parsed);
      const servers = getAgentServers(parsed);
      if (Object.keys(servers).length === 0 && include === undefined) {
        continue;
      }
      if (candidate.scope === "workspace") {
        Object.assign(workspaceServers, servers);
        if (include !== undefined) includeWorkspace = include;
      } else {
        Object.assign(globalServers, servers);
        if (include !== undefined) includeGlobal = include;
      }
      loadedPaths.push(p);
    } catch {
      // ignore invalid files; users can still rely on built-ins.
      continue;
    }
  }

  const mergedServers = { ...globalServers, ...workspaceServers };
  const agents: AgentConfig[] = [];
  for (const [id, rawServer] of Object.entries(mergedServers)) {
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

  const includeBuiltins =
    includeWorkspace !== undefined ? includeWorkspace : includeGlobal;

  return {
    includeBuiltins,
    agents,
    sourcePath: loadedPaths.length > 0 ? loadedPaths.join(", ") : undefined,
  };
}
