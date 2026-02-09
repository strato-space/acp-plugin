import { memo, useMemo } from "react";
import type { Tool } from "@/types";
import { cn } from "@/lib/utils";
import { useChatStore } from "@/store";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  Bot,
} from "lucide-react";
import { ToolItem } from "./ToolItem";
import { IOFrame } from "./IOFrame";
import {
  Tool as ToolFrame,
  ToolHeader,
  ToolContent,
  ToolInput,
  ToolOutput,
  type ToolState,
} from "@/components/ai/tool";
import { ArrowDownToLine, ArrowUpFromLine } from "lucide-react";

interface AgentTaskItemProps {
  id: string;
  tool: Tool;
  defaultExpanded?: boolean;
  depth?: number;
}

export const AgentTaskItem = memo(function AgentTaskItem({
  id,
  tool,
  defaultExpanded = false,
  depth = 0,
}: AgentTaskItemProps) {
  const hierarchyStyle = useChatStore((s) => s.hierarchyStyle);
  const AgentIcon = Bot;

  const mapStatus = (status: Tool["status"]): ToolState => {
    switch (status) {
      case "running":
        return "running";
      case "completed":
        return "completed";
      case "failed":
        return "failed";
      default:
        return "pending";
    }
  };

  // Count sub-tools
  const subToolIds = useMemo(() => {
    return tool.subTools ? Object.keys(tool.subTools) : [];
  }, [tool.subTools]);

  const subToolStats = useMemo(() => {
    if (!tool.subTools) return { total: 0, running: 0, completed: 0, failed: 0 };
    const tools = Object.values(tool.subTools);
    return {
      total: tools.length,
      running: tools.filter((t) => t.status === "running").length,
      completed: tools.filter((t) => t.status === "completed").length,
      failed: tools.filter((t) => t.status === "failed").length,
    };
  }, [tool.subTools]);

  const hasSubTools = subToolIds.length > 0;

  // Status icon
  const StatusIcon = () => {
    if (tool.status === "completed") {
      return <CheckCircle2 className="h-4 w-4 text-success" />;
    }
    if (tool.status === "failed") {
      return <XCircle className="h-4 w-4 text-destructive" />;
    }
    return <Loader2 className="h-4 w-4 text-warning animate-spin" />;
  };

  const title = useMemo(() => tool.name || "Agent", [tool.name]);

  const counters = useMemo(() => {
    if (!hasSubTools || !tool.subTools) return null;
    const children = Object.values(tool.subTools);
    let agentCount = 0;
    let toolCount = 0;
    let running = 0;
    let done = 0;
    let failed = 0;
    for (const t of children) {
      const kind = t.kind;
      const isAgent = kind === "task" || kind === "agent" || t.name === "Task";
      if (isAgent) agentCount += 1;
      else toolCount += 1;
      if (t.status === "running") running += 1;
      else if (t.status === "completed") done += 1;
      else if (t.status === "failed") failed += 1;
    }
    return (
      <span className="flex items-center gap-1.5">
        {toolCount > 0 ? (
          <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-muted/40 text-foreground border border-border/50 text-[10px]">
            {toolCount} tool{toolCount !== 1 ? "s" : ""}
          </span>
        ) : null}
        {agentCount > 0 ? (
          <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-muted/40 text-foreground border border-border/50 text-[10px]">
            {agentCount} agent{agentCount !== 1 ? "s" : ""}
          </span>
        ) : null}
        {running > 0 ? (
          <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-warning/10 text-warning text-[10px]">
            <span className="h-1.5 w-1.5 rounded-full bg-warning animate-pulse" />
            {running} running
          </span>
        ) : null}
        {done > 0 ? (
          <span className="px-1.5 py-0.5 rounded-full bg-success/10 text-success text-[10px]">
            {done} done
          </span>
        ) : null}
        {failed > 0 ? (
          <span className="px-1.5 py-0.5 rounded-full bg-destructive/10 text-destructive text-[10px]">
            {failed} failed
          </span>
        ) : null}
      </span>
    );
  }, [hasSubTools, tool.subTools]);

  const parsedInput = useMemo(() => {
    if (!tool.input) return null;
    try {
      return JSON.parse(tool.input);
    } catch {
      return tool.input;
    }
  }, [tool.input]);

  const truncatedOutput = useMemo(() => {
    if (!tool.output) return null;
    return tool.output.length > 1000
      ? tool.output.slice(0, 1000) + "\n... (truncated)"
      : tool.output;
  }, [tool.output]);

  return (
    <ToolFrame
      defaultOpen={defaultExpanded}
      variant={hierarchyStyle}
      className={cn(depth > 0 && "ml-4")}
    >
      <ToolHeader
        title={title}
        state={mapStatus(tool.status)}
        icon={<AgentIcon className="size-4 shrink-0 text-muted-foreground" />}
        afterTitle={counters}
      />
      <ToolContent>
        {/* INPUT */}
        {tool.input && (
          <div className="px-3 pb-2">
            <IOFrame
              title="Input"
              icon={<ArrowDownToLine className="size-4 shrink-0 text-muted-foreground" />}
              value={parsedInput}
            >
              <ToolInput input={parsedInput} className="px-0 pb-0" />
            </IOFrame>
          </div>
        )}

        {/* Tool calls blocks */}
        {hasSubTools && (
          <div className="space-y-2 overflow-hidden px-3 pr-4 pb-2">
            {subToolIds.map((subId) => {
              const subTool = tool.subTools![subId];
              if (subTool.kind === "task" || subTool.kind === "agent") {
                return (
                  <AgentTaskItem
                    key={subId}
                    id={subId}
                    tool={subTool}
                    depth={depth + 1}
                  />
                );
              }
              return <ToolItem key={subId} id={subId} tool={subTool} />;
            })}
          </div>
        )}

        {/* OUTPUT */}
        {truncatedOutput && (
          <div className="px-3 pb-3">
            <IOFrame
              title="Output"
              icon={<ArrowUpFromLine className="size-4 shrink-0 text-muted-foreground" />}
              value={truncatedOutput}
            >
              <ToolOutput output={truncatedOutput} className="px-0 pb-0" />
            </IOFrame>
          </div>
        )}
      </ToolContent>
    </ToolFrame>
  );
});
