import { memo, useState, useMemo } from "react";
import type { Tool } from "@/types";
import { ToolItem } from "./ToolItem";
import { AgentTaskItem } from "./AgentTaskItem";
import { detectToolKindFromName } from "@/lib/ansi";
import { cn } from "@/lib/utils";
import { Wrench, ChevronDown, Bot } from "lucide-react";

interface ToolListProps {
  tools: Record<string, Tool>;
  expandedToolId?: string | null;
  showHeader?: boolean;
}

const MAX_VISIBLE_TOOLS = 5;

export const ToolList = memo(function ToolList({
  tools,
  expandedToolId,
  showHeader = true,
}: ToolListProps) {
  const toolIds = Object.keys(tools);
  const [showAll, setShowAll] = useState(false);

  if (toolIds.length === 0) return null;

  // Separate agent tasks from regular tools
  const { agentToolIds, regularToolIds, isAgentToolId } = useMemo(() => {
    const agents: string[] = [];
    const regular: string[] = [];
    const isAgent: Record<string, boolean> = {};

    toolIds.forEach((id) => {
      const tool = tools[id];
      const kind = tool.kind || detectToolKindFromName(tool.name);
      if (kind === "task" || kind === "agent" || tool.name === "Task") {
        agents.push(id);
        isAgent[id] = true;
      } else {
        regular.push(id);
        isAgent[id] = false;
      }
    });

    return { agentToolIds: agents, regularToolIds: regular, isAgentToolId: isAgent };
  }, [toolIds, tools]);

  const toolCount = regularToolIds.length;

  // Count running tools
  const runningCount = toolIds.filter(id => tools[id].status === "running").length;
  const completedCount = toolIds.filter(id => tools[id].status === "completed").length;
  const failedCount = toolIds.filter(id => tools[id].status === "failed").length;
  const agentCount = agentToolIds.length;

  // Keep tool rendering chronological (Object.keys insertion order), but still
  // collapse excessive regular tools while always showing agent tasks.
  const { visibleToolIds, hiddenCount } = useMemo(() => {
    let shownRegular = 0;
    const visible: string[] = [];
    for (const id of toolIds) {
      if (isAgentToolId[id]) {
        visible.push(id);
        continue;
      }
      if (showAll || shownRegular < MAX_VISIBLE_TOOLS) {
        visible.push(id);
      } else {
        // hidden regular tool
      }
      shownRegular += 1;
    }
    const hidden = Math.max(0, regularToolIds.length - MAX_VISIBLE_TOOLS);
    return { visibleToolIds: visible, hiddenCount: hidden };
  }, [toolIds, isAgentToolId, regularToolIds.length, showAll]);

  return (
    <div className="space-y-2 overflow-hidden">
      {/* Header with stats */}
      {showHeader && (
        <div className="flex items-center gap-3 text-sm flex-wrap">
          <div className="flex items-center gap-2 text-xs">
            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-muted/40 text-foreground border border-border/50">
              <Wrench className="h-3 w-3" />
              {toolCount} tool{toolCount !== 1 ? "s" : ""}
            </span>
            {agentCount > 0 && (
              <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-muted/40 text-foreground border border-border/50">
                <Bot className="h-3 w-3" />
                {agentCount} agent{agentCount !== 1 ? "s" : ""}
              </span>
            )}
            {runningCount > 0 && (
              <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-warning/10 text-warning">
                <span className="h-1.5 w-1.5 rounded-full bg-warning animate-pulse" />
                {runningCount} running
              </span>
            )}
            {completedCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-success/10 text-success">
                {completedCount} done
              </span>
            )}
            {failedCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-destructive/10 text-destructive">
                {failedCount} failed
              </span>
            )}
          </div>
        </div>
      )}

      {/* Tools (chronological) */}
      <div className="space-y-2 overflow-hidden">
        {visibleToolIds.map((id) => {
          const t = tools[id];
          if (!t) return null;
          if (isAgentToolId[id]) {
            return (
              <AgentTaskItem
                key={id}
                id={id}
                tool={t}
                defaultExpanded={id === expandedToolId}
              />
            );
          }
          return (
            <ToolItem
              key={id}
              id={id}
              tool={t}
              defaultExpanded={id === expandedToolId}
            />
          );
        })}
      </div>

      {/* Show more/less button */}
      {hiddenCount > 0 && (
        <button
          onClick={() => setShowAll(!showAll)}
          className={cn(
            "w-full flex items-center justify-center gap-1.5 py-2 text-xs text-muted-foreground",
            "rounded-lg border border-dashed border-border/50 hover:border-border hover:bg-muted/30",
            "transition-colors duration-200"
          )}
        >
          <ChevronDown className={cn(
            "h-3.5 w-3.5 transition-transform duration-200",
            showAll && "rotate-180"
          )} />
          {showAll ? "Show less" : `Show ${hiddenCount} more tool${hiddenCount !== 1 ? "s" : ""}`}
        </button>
      )}
    </div>
  );
});
