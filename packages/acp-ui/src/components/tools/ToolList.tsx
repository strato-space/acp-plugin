import { memo, useMemo } from "react";
import type { Tool } from "@/types";
import { ToolItem } from "./ToolItem";
import { AgentTaskItem } from "./AgentTaskItem";
import { cn } from "@/lib/utils";
import { Wrench, ChevronDown, Bot } from "lucide-react";
import { useChatStore } from "@/store";
import { bucketToolIds, getVisibleToolIds } from "./toolListVisibility";

interface ToolListProps {
  tools: Record<string, Tool>;
  expandedToolId?: string | null;
  showHeader?: boolean;
}

export const ToolList = memo(function ToolList({
  tools,
  expandedToolId,
  showHeader = true,
}: ToolListProps) {
  const toolIds = Object.keys(tools);
  const showAllByDefault = useChatStore(
    (state) => state.toolListShowAllByDefault
  );
  const setShowAllByDefault = useChatStore(
    (state) => state.setToolListShowAllByDefault
  );

  if (toolIds.length === 0) return null;

  // Separate agent tasks from regular tools
  const { agentToolIds, regularToolIds, isAgentToolId } = useMemo(() => {
    return bucketToolIds(toolIds, tools);
  }, [toolIds, tools]);

  const toolCount = regularToolIds.length;

  // Count running tools
  const runningCount = toolIds.filter(
    (id) => tools[id].status === "running"
  ).length;
  const completedCount = toolIds.filter(
    (id) => tools[id].status === "completed"
  ).length;
  const failedCount = toolIds.filter(
    (id) => tools[id].status === "failed"
  ).length;
  const agentCount = agentToolIds.length;

  const { visibleToolIds, hiddenCount } = useMemo(() => {
    return getVisibleToolIds({
      toolIds,
      regularToolIds,
      isAgentToolId,
      showAllRegularTools: showAllByDefault,
    });
  }, [toolIds, regularToolIds, isAgentToolId, showAllByDefault]);

  return (
    <div className="space-y-2 overflow-hidden">
      {/* Header with stats */}
      {showHeader && (
        <div className="flex items-center gap-3 text-sm flex-wrap">
          <div className="flex items-center gap-2 text-xs flex-wrap">
            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-muted text-foreground border border-border">
              <Wrench className="h-3 w-3" />
              {toolCount} tool{toolCount !== 1 ? "s" : ""}
            </span>
            {agentCount > 0 && (
              <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-muted text-foreground border border-border">
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
              <span className="px-1.5 py-0.5 rounded-full border border-destructive bg-muted text-destructive">
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
          onClick={() => setShowAllByDefault(!showAllByDefault)}
          className={cn(
            "w-full flex items-center justify-center gap-1.5 py-2 text-xs text-muted-foreground",
            "rounded-lg border border-dashed border-border hover:border-border hover:bg-muted",
            "transition-colors duration-200"
          )}
        >
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 transition-transform duration-200",
              showAllByDefault && "rotate-180"
            )}
          />
          {showAllByDefault
            ? "Show less"
            : `Show ${hiddenCount} more tool${hiddenCount !== 1 ? "s" : ""}`}
        </button>
      )}
    </div>
  );
});
