import type { Tool } from "../../types";
import { detectToolKindFromName } from "../../lib/ansi";

export const MAX_VISIBLE_TOOLS = 5;

export interface ToolIdBuckets {
  agentToolIds: string[];
  regularToolIds: string[];
  isAgentToolId: Record<string, boolean>;
}

export function bucketToolIds(
  toolIds: string[],
  tools: Record<string, Tool>
): ToolIdBuckets {
  const agentToolIds: string[] = [];
  const regularToolIds: string[] = [];
  const isAgentToolId: Record<string, boolean> = {};

  for (const id of toolIds) {
    const tool = tools[id];
    const kind = tool.kind || detectToolKindFromName(tool.name);
    const isAgent = kind === "task" || kind === "agent" || tool.name === "Task";
    if (isAgent) {
      agentToolIds.push(id);
      isAgentToolId[id] = true;
    } else {
      regularToolIds.push(id);
      isAgentToolId[id] = false;
    }
  }

  return { agentToolIds, regularToolIds, isAgentToolId };
}

export function getVisibleToolIds(params: {
  toolIds: string[];
  regularToolIds: string[];
  isAgentToolId: Record<string, boolean>;
  showAllRegularTools: boolean;
  maxVisibleTools?: number;
}): { visibleToolIds: string[]; hiddenCount: number } {
  const {
    toolIds,
    regularToolIds,
    isAgentToolId,
    showAllRegularTools,
    maxVisibleTools = MAX_VISIBLE_TOOLS,
  } = params;

  const hiddenCount = Math.max(0, regularToolIds.length - maxVisibleTools);

  if (showAllRegularTools || hiddenCount === 0) {
    return { visibleToolIds: toolIds, hiddenCount };
  }

  // Sliding window: show the most recent regular tools while keeping
  // top-level agent/task rows always visible.
  const visibleRegular = new Set(regularToolIds.slice(-maxVisibleTools));
  const visibleToolIds = toolIds.filter(
    (id) => isAgentToolId[id] || visibleRegular.has(id)
  );

  return { visibleToolIds, hiddenCount };
}
