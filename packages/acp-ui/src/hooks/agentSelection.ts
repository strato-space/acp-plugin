import type { Agent } from "../types";

export function shouldApplyAgentChanged(
  agentId: string,
  agents: Agent[]
): boolean {
  const normalizedAgentId = agentId.trim();
  if (!normalizedAgentId) return false;
  const matchingAgent = agents.find((agent) => agent.id === normalizedAgentId);
  if (!matchingAgent) return true;
  return matchingAgent.available;
}
