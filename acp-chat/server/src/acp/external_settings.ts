import fs from "fs";
import os from "os";
import path from "path";

import {
  getAgentServers,
  getIncludeBuiltins,
  isRecord,
  mergeScopedExternalSettings,
  parseJsonc,
  toAgentConfigsFromServers,
  type AgentServerSetting,
} from "@strato-space/acp-runtime-shared";

import type { AgentConfig } from "./agents";

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

export type ExternalAgentSettings = {
  includeBuiltins?: boolean;
  agents: AgentConfig[];
  sourcePath?: string;
};

export function loadExternalAgentSettings(): ExternalAgentSettings {
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

  // Walk up from current working directory so workspace-level settings such as
  // /home/.vscode/settings.json are discovered without hardcoded paths.
  let currentDir = process.cwd();
  while (true) {
    pushCandidate({
      path: path.join(currentDir, ".vscode", "settings.json"),
      scope: "workspace",
    });
    const parent = path.dirname(currentDir);
    if (parent === currentDir) break;
    currentDir = parent;
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
    } catch {
      // ignore invalid files; users can still rely on built-ins.
      continue;
    }
  }

  const merged = mergeScopedExternalSettings(scopedEntries);
  const agents = toAgentConfigsFromServers(merged.servers, {
    expandVars,
  });

  return {
    includeBuiltins: merged.includeBuiltins,
    agents,
    sourcePath: merged.sourcePath,
  };
}
