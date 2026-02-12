import { memo, useMemo } from "react";
import type { Tool as ToolTypeFromTypes } from "@/types";
import { hasAnsiCodes, detectToolKindFromName } from "@/lib/ansi";
import { useChatStore } from "@/store";
import { AnsiRenderer } from "./AnsiRenderer";
import { IOFrame } from "./IOFrame";
import {
  Tool,
  ToolHeader,
  ToolContent,
  ToolInput,
  ToolOutput,
  type ToolState,
} from "@/components/ai/tool";
import { ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import { cn } from "@/lib/utils";

interface ToolItemProps {
  id: string;
  tool: ToolTypeFromTypes;
  defaultExpanded?: boolean;
}

// Map our tool status to shadcn Tool state
function mapStatus(status: ToolTypeFromTypes["status"]): ToolState {
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
}

export const ToolItem = memo(function ToolItem({
  id,
  tool,
  defaultExpanded = false,
}: ToolItemProps) {
  const hierarchyStyle = useChatStore((s) => s.hierarchyStyle);

  // Auto-detect kind from tool name if not explicitly set
  const effectiveKind = useMemo(
    () => detectToolKindFromName(tool.name, tool.kind),
    [tool.name, tool.kind]
  );

  const hasChildren = !!tool.subTools && Object.keys(tool.subTools).length > 0;

  const counters = useMemo(() => {
    if (!hasChildren || !tool.subTools) return null;
    const ids = Object.keys(tool.subTools);
    let agentCount = 0;
    let toolCount = 0;
    let running = 0;
    let done = 0;
    let failed = 0;
    for (const childId of ids) {
      const t = tool.subTools[childId];
      const kind = t.kind;
      const isAgent = kind === "task" || kind === "agent" || t.name === "Task";
      if (isAgent) agentCount += 1;
      else toolCount += 1;
      if (t.status === "running") running += 1;
      else if (t.status === "completed") done += 1;
      else if (t.status === "failed") failed += 1;
    }
    const pill = (label: string, className?: string) => (
      <span
        className={cn(
          "px-1.5 py-0.5 rounded-full bg-muted text-foreground border border-border text-[10px]",
          className
        )}
      >
        {label}
      </span>
    );
    return (
      <span className="flex items-center justify-end gap-1.5 flex-wrap">
        {toolCount > 0
          ? pill(`${toolCount} tool${toolCount !== 1 ? "s" : ""}`)
          : null}
        {agentCount > 0
          ? pill(`${agentCount} agent${agentCount !== 1 ? "s" : ""}`)
          : null}
        {running > 0 ? (
          <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-warning/10 text-warning text-[10px]">
            <span className="h-1.5 w-1.5 rounded-full bg-warning animate-pulse" />
            {running} running
          </span>
        ) : null}
        {done > 0
          ? pill(
              `${done} done`,
              "bg-success/10 text-success border-transparent"
            )
          : null}
        {failed > 0
          ? pill(`${failed} failed`, "border-destructive text-destructive")
          : null}
      </span>
    );
  }, [hasChildren, tool.subTools]);

  const truncatedOutput = tool.output
    ? tool.output.length > 1000
      ? tool.output.slice(0, 1000) + "\n... (truncated)"
      : tool.output
    : null;

  const showAnsi = truncatedOutput && hasAnsiCodes(truncatedOutput);

  // Parse input for display
  const parsedInput = useMemo(() => {
    if (!tool.input) return null;
    try {
      return JSON.parse(tool.input);
    } catch {
      return tool.input;
    }
  }, [tool.input]);

  return (
    <Tool defaultOpen={defaultExpanded} variant={hierarchyStyle}>
      <ToolHeader
        name={tool.name}
        state={mapStatus(tool.status)}
        afterTitle={counters}
      />
      <ToolContent>
        {tool.input && (
          <div className="px-3 pb-2">
            <IOFrame
              title="Input"
              icon={
                <ArrowDownToLine className="size-4 shrink-0 text-muted-foreground" />
              }
              value={parsedInput}
            >
              <ToolInput input={parsedInput} className="px-0 pb-0" />
            </IOFrame>
          </div>
        )}
        {truncatedOutput && (
          <div className="px-3 pb-3">
            <IOFrame
              title="Output"
              icon={
                <ArrowUpFromLine className="size-4 shrink-0 text-muted-foreground" />
              }
              value={truncatedOutput}
            >
              {showAnsi ? (
                <div className="overflow-x-auto rounded-md bg-muted p-2 text-xs font-mono max-h-[200px] overflow-y-auto">
                  <AnsiRenderer text={truncatedOutput} />
                </div>
              ) : (
                <ToolOutput output={truncatedOutput} className="px-0 pb-0" />
              )}
            </IOFrame>
          </div>
        )}

        {hasChildren && tool.subTools && (
          <div className="px-3 pr-4 pb-3">
            <div className="space-y-2">
              {Object.entries(tool.subTools).map(([childId, child]) => (
                <ToolItem key={childId} id={childId} tool={child} />
              ))}
            </div>
          </div>
        )}
      </ToolContent>
    </Tool>
  );
});
