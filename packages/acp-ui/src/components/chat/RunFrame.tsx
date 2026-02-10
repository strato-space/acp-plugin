import { memo, useMemo } from "react";
import type { Tool as ToolType } from "@/types";
import {
  Tool as ToolFrame,
  ToolHeader,
  ToolContent,
  type ToolState,
} from "@/components/ai/tool";
import { IOFrame } from "@/components/tools/IOFrame";
import { ToolList } from "@/components/tools/ToolList";
import { cn } from "@/lib/utils";
import { useChatStore } from "@/store";
import {
  Bot,
  ArrowDownToLine,
  ArrowUpFromLine,
  Brain,
} from "lucide-react";

export type RunFrameProps = {
  title?: string;
  state?: ToolState;
  inputText?: string | null;
  thinkingText?: string | null;
  tools?: Record<string, ToolType> | null;
  outputText?: string | null;
  expandedToolId?: string | null;
  defaultOpen?: boolean;
  className?: string;
};

export const RunFrame = memo(function RunFrame({
  title = "StratoProject",
  state,
  inputText,
  thinkingText,
  tools,
  outputText,
  expandedToolId,
  defaultOpen = true,
  className,
}: RunFrameProps) {
  const hierarchyStyle = useChatStore((s) => s.hierarchyStyle);

  const hasTools = !!tools && Object.keys(tools).length > 0;
  const hasThinking = !!thinkingText && thinkingText.trim().length > 0;

  const counters = useMemo(() => {
    if (!tools) return null;
    const ids = Object.keys(tools);
    if (ids.length === 0) return null;
    let agentCount = 0;
    let toolCount = 0;
    let running = 0;
    let done = 0;
    let failed = 0;
    for (const id of ids) {
      const t = tools[id];
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
          "flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-muted text-foreground border border-border text-[10px]",
          className
        )}
      >
        {label}
      </span>
    );

    return (
      <span className="flex items-center gap-1.5">
        {toolCount > 0 ? (
          <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-muted text-foreground border border-border text-[10px]">
            {toolCount} tool{toolCount !== 1 ? "s" : ""}
          </span>
        ) : null}
        {agentCount > 0 ? (
          <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-muted text-foreground border border-border text-[10px]">
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
          <span className="px-1.5 py-0.5 rounded-full border border-destructive bg-muted text-destructive text-[10px]">
            {failed} failed
          </span>
        ) : null}
      </span>
    );
  }, [tools]);

  const computedState: ToolState = useMemo(() => {
    if (state) return state;
    if (hasTools && tools) {
      const statuses = Object.values(tools).map((t) => t.status);
      if (statuses.some((s) => s === "failed")) return "failed";
      if (statuses.some((s) => s === "running")) return "running";
    }
    if (hasThinking) return "running";
    return "completed";
  }, [hasThinking, hasTools, state, tools]);

  const showAny =
    (inputText && inputText.trim().length > 0) ||
    hasThinking ||
    hasTools ||
    (outputText && outputText.trim().length > 0);

  const normalizedInput = useMemo(() => {
    if (!inputText) return null;
    const t = inputText.replace(/\[Image:.*?\]\n*/g, "").trim();
    return t || null;
  }, [inputText]);

  if (!showAny) return null;

  return (
    <ToolFrame defaultOpen={defaultOpen} variant={hierarchyStyle} className={cn(className)}>
      <ToolHeader
        title={title}
        state={computedState}
        icon={<Bot className="size-4 shrink-0 text-muted-foreground" />}
        afterTitle={counters}
      />
      <ToolContent>
        <div className="space-y-2 p-3">
          {normalizedInput && (
            <IOFrame
              title="Input"
              icon={<ArrowDownToLine className="size-4 shrink-0 text-muted-foreground" />}
              value={normalizedInput}
              defaultOpen={false}
            >
              <pre className="rounded-md bg-muted p-2 text-xs font-mono overflow-x-auto max-h-[200px] overflow-y-auto whitespace-pre-wrap break-words">
                {normalizedInput}
              </pre>
            </IOFrame>
          )}

          {hasThinking && (
            <IOFrame
              title="Reasoning"
              icon={<Brain className="size-4 shrink-0 text-muted-foreground" />}
              value={thinkingText}
              defaultOpen
            >
              <pre className="rounded-md bg-muted p-2 text-xs font-mono overflow-x-auto max-h-[240px] overflow-y-auto whitespace-pre-wrap break-words">
                {thinkingText}
              </pre>
            </IOFrame>
          )}

          {hasTools && tools && (
            <div className="px-2 pr-4 pb-2">
              <ToolList tools={tools} expandedToolId={expandedToolId} showHeader={false} />
            </div>
          )}

          {outputText && outputText.trim() && (
            <IOFrame
              title="Output"
              icon={<ArrowUpFromLine className="size-4 shrink-0 text-muted-foreground" />}
              value={outputText}
              defaultOpen={false}
            >
              <pre className="rounded-md bg-muted p-2 text-xs font-mono overflow-x-auto max-h-[240px] overflow-y-auto whitespace-pre-wrap break-words">
                {outputText}
              </pre>
            </IOFrame>
          )}
        </div>
      </ToolContent>
    </ToolFrame>
  );
});
