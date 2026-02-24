import { execSync } from "child_process";
import {
  BUILTIN_AGENTS,
  resolveEffectiveAgents,
  type AgentConfig as SharedAgentConfig,
} from "@strato-space/acp-runtime-shared";

export type AgentConfig = SharedAgentConfig;

export interface AgentWithStatus extends AgentConfig {
  available: boolean;
  source: "builtin" | "custom";
}

// Built-in agents. Users can add/override these via VS Code settings.
export const AGENTS: AgentConfig[] = BUILTIN_AGENTS.map((agent) => ({
  ...agent,
  args: [...agent.args],
}));

// Externalized agent settings (VS Code config) are pushed into this module by the extension.
let includeBuiltins = true;
let customAgents: AgentConfig[] = [];

/**
 * Apply user-configured agents (from VS Code settings).
 *
 * - If `includeBuiltins` is false, only `agents` will be available.
 * - If a custom agent reuses an id from built-ins, it overrides the built-in config.
 */
export function setCustomAgents(options: {
  includeBuiltins?: boolean;
  agents: AgentConfig[];
}): void {
  includeBuiltins = options.includeBuiltins ?? true;
  customAgents = options.agents;
  cachedAgentsWithStatus = null;
}

type EffectiveAgent = AgentConfig & { source: "builtin" | "custom" };

function getEffectiveAgents(): EffectiveAgent[] {
  return resolveEffectiveAgents({
    includeBuiltins,
    builtins: AGENTS,
    customAgents,
  });
}

export function getAgent(id: string): AgentConfig | undefined {
  return getEffectiveAgents().find((a) => a.id === id);
}

export function getDefaultAgent(): AgentConfig {
  const agents = getEffectiveAgents();
  return agents[0] ?? AGENTS[0];
}

/**
 * Check if a command exists on the system PATH.
 * For npx commands, we assume they're available since npx can install on demand.
 */
function isCommandAvailable(command: string): boolean {
  if (command === "npx") {
    // npx can install packages on demand, assume available if node/npm is installed
    try {
      execSync("which npx || where npx", { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  }

  try {
    // Use 'which' on Unix, 'where' on Windows
    const whichCmd = process.platform === "win32" ? "where" : "which";
    execSync(`${whichCmd} ${command}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get all agents with their availability status.
 * Caches the result for performance.
 */
let cachedAgentsWithStatus: AgentWithStatus[] | null = null;

export function getAgentsWithStatus(forceRefresh = false): AgentWithStatus[] {
  if (cachedAgentsWithStatus && !forceRefresh) {
    return cachedAgentsWithStatus;
  }

  const effectiveAgents = getEffectiveAgents();
  cachedAgentsWithStatus = effectiveAgents.map((agent) => ({
    ...agent,
    available: isCommandAvailable(agent.command),
    source: agent.source,
  }));

  return cachedAgentsWithStatus;
}

/**
 * Get the first available agent, or fall back to the default.
 */
export function getFirstAvailableAgent(): AgentConfig {
  const agents = getAgentsWithStatus();
  const available = agents.find((a) => a.available);
  return available ?? getDefaultAgent();
}

export function isAgentAvailable(agentId: string): boolean {
  const agents = getAgentsWithStatus();
  const agent = agents.find((a) => a.id === agentId);
  return agent?.available ?? false;
}
