import { useMemo, memo, forwardRef } from "react";
import { useChatStore } from "@/store";
import { useShallow } from "zustand/react/shallow";
import { ToolList } from "@/components/tools/ToolList";
import {
  ChainOfThought,
  ChainOfThoughtHeader,
  ChainOfThoughtContent,
  ChainOfThoughtStep,
} from "@/components/ai/chain-of-thought";
import { cn } from "@/lib/utils";
import {
  BrainIcon,
  FileSearchIcon,
  PencilIcon,
  TerminalIcon,
  type LucideProps,
} from "lucide-react";

const MAX_THINKING_DISPLAY = 5000;

const RunningEllipsisIcon = forwardRef<SVGSVGElement, LucideProps>(
  ({ className, ...props }, ref) => (
    <svg
      ref={ref}
      viewBox="0 0 24 24"
      aria-hidden="true"
      {...props}
      className={cn(className)}
    >
      <circle
        cx="6"
        cy="12"
        r="1.5"
        className="fill-current animate-pulse [animation-delay:-0.3s]"
      />
      <circle
        cx="12"
        cy="12"
        r="1.5"
        className="fill-current animate-pulse [animation-delay:-0.15s]"
      />
      <circle cx="18" cy="12" r="1.5" className="fill-current animate-pulse" />
    </svg>
  )
);

RunningEllipsisIcon.displayName = "RunningEllipsisIcon";

export const ThinkingIndicator = memo(function ThinkingIndicator() {
  // Subscribe to primitive values individually
  const isThinking = useChatStore((state) => state.isThinking);
  const thinkingText = useChatStore((state) => state.streaming.thinkingText);
  const expandedToolId = useChatStore((state) => state.streaming.expandedToolId);

  // Use shallow comparison for objects to avoid unnecessary re-renders
  const tools = useChatStore(useShallow((state) => state.streaming.tools));

  // Memoize truncated thinking text
  const displayText = useMemo(() => {
    if (thinkingText.length <= MAX_THINKING_DISPLAY) {
      return thinkingText;
    }
    return "..." + thinkingText.slice(-MAX_THINKING_DISPLAY);
  }, [thinkingText]);

  // Get tool stats for step display
  const toolStats = useMemo(() => {
    const toolList = Object.values(tools);
    const running = toolList.filter((t) => t.status === "running").length;
    const completed = toolList.filter((t) => t.status === "completed").length;
    const total = toolList.length;

    // Get last active tool types for display
    const activeToolTypes = toolList
      .filter((t) => t.status === "running")
      .map((t) => t.kind || "other")
      .slice(0, 3);

    return { running, completed, total, activeToolTypes };
  }, [tools]);

  if (!isThinking) return null;

  const hasThinkingText = thinkingText.length > 0;
  const hasTools = Object.keys(tools).length > 0;
  const isStreaming = hasThinkingText;

  return (
    <div
      className="mx-auto w-full max-w-thread px-2 py-4 animate-in fade-in slide-in-from-bottom-2 duration-300 overflow-hidden"
      role="status"
      aria-label="Agent is thinking"
      data-role="assistant"
    >
      <div className="mx-2 space-y-4 overflow-hidden">
        <ChainOfThought defaultOpen={hasThinkingText}>
          {/* Header */}
          <ChainOfThoughtHeader
            icon={<RunningEllipsisIcon className="size-4" />}
            className="text-muted-foreground hover:text-foreground"
          >
            {isStreaming ? (
              <span className="flex items-center gap-1.5">
                <span className="relative">
                  Reasoning
                  <span className="absolute inset-0 animate-shimmer bg-gradient-to-r from-transparent via-blue-400/30 to-transparent bg-[length:200%_100%]">
                    Reasoning
                  </span>
                </span>
                <span className="text-xs text-muted-foreground/80">
                  ({Math.round(thinkingText.length / 1000)}k)
                </span>
              </span>
            ) : (
              "Reasoning"
            )}
          </ChainOfThoughtHeader>

          {/* Content */}
          <ChainOfThoughtContent>
            {/* Thinking step */}
            {hasThinkingText && (
              <ChainOfThoughtStep
                icon={RunningEllipsisIcon}
                label="Thinking..."
                status={isStreaming ? "active" : "complete"}
              >
                <div className="whitespace-pre-wrap break-words font-mono text-xs bg-muted/30 rounded-lg p-3 max-h-48 overflow-y-auto">
                  {displayText}
                </div>
              </ChainOfThoughtStep>
            )}

            {/* Tool execution steps */}
            {toolStats.running > 0 && (
              <ChainOfThoughtStep
                icon={
                  toolStats.activeToolTypes.includes("search")
                    ? FileSearchIcon
                  : toolStats.activeToolTypes.includes("edit")
                      ? PencilIcon
                  : toolStats.activeToolTypes.includes("execute")
                        ? TerminalIcon
                        : RunningEllipsisIcon
                }
                label={`Executing ${toolStats.running} tool${toolStats.running > 1 ? "s" : ""}...`}
                status="active"
              />
            )}

            {toolStats.completed > 0 && toolStats.running === 0 && (
              <ChainOfThoughtStep
                icon={BrainIcon}
                label={`Completed ${toolStats.completed} tool${toolStats.completed > 1 ? "s" : ""}`}
                status="complete"
              />
            )}

            {/* Minimal loading indicator when no text yet */}
            {!hasThinkingText && !hasTools && (
              <ChainOfThoughtStep
                icon={RunningEllipsisIcon}
                label="Processing"
                status="active"
                className="text-muted-foreground"
              />
            )}
          </ChainOfThoughtContent>
        </ChainOfThought>

        {/* Tools Section */}
        {hasTools && (
          <div className="border-t border-border/50 pt-4 overflow-hidden">
            <ToolList tools={tools} expandedToolId={expandedToolId} />
          </div>
        )}
      </div>
    </div>
  );
});
