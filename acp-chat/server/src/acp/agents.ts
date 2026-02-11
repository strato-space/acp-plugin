import { execSync } from "child_process";

export interface AgentConfig {
  /**
   * Stable identifier used in the UI and persisted in global state.
   */
  id: string;
  /**
   * Human-readable name shown in the agent selector.
   */
  name: string;
  /**
   * Executable name (resolved from PATH) or `npx`.
   */
  command: string;
  /**
   * Arguments passed to the executable.
   */
  args: string[];
  /**
   * Optional working directory for the spawned agent process.
   * Useful when an agent relies on local project files (e.g. `uv run` with a pyproject.toml).
   */
  cwd?: string;
  /**
   * Optional environment variables merged over the VS Code extension host environment.
   */
  env?: Record<string, string>;
}

export interface AgentWithStatus extends AgentConfig {
  available: boolean;
  source: "builtin" | "custom";
}

// Built-in agents. Users can add/override these via VS Code settings.
export const AGENTS: AgentConfig[] = [
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
    args: ["fast-agent-acp", "--model", "codex"],
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
  const merged = new Map<string, EffectiveAgent>();

  if (includeBuiltins) {
    for (const agent of AGENTS) {
      merged.set(agent.id, { ...agent, source: "builtin" });
    }
  }

  for (const agent of customAgents) {
    merged.set(agent.id, { ...agent, source: "custom" });
  }

  return [...merged.values()];
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
