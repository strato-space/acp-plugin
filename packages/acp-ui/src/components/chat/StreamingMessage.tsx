import { useMemo } from "react";
import { useChatStore } from "@/store";
import { Markdown } from "@/components/ui/markdown";
import { RunFrame } from "./RunFrame";
import type { ToolState } from "@/components/ai/tool";

export function StreamingMessage() {
  const { streaming, isThinking, messages, selectedAgentId, agents } =
    useChatStore();

  const lastUserText = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.type === "user") return m.text;
    }
    return null;
  }, [messages]);
  const promptText = streaming.inputText || lastUserText;

  const showAnything =
    isThinking ||
    !!streaming.currentText ||
    !!streaming.thinkingText ||
    Object.keys(streaming.tools).length > 0;

  if (!showAnything) return null;

  const title = (() => {
    const agent = agents.find((a) => a.id === selectedAgentId);
    return agent?.name || selectedAgentId || "StratoProject";
  })();

  const frameState: ToolState = (() => {
    const tools = Object.values(streaming.tools);
    if (tools.some((t) => t.status === "failed")) return "failed";
    if (isThinking || tools.some((t) => t.status === "running"))
      return "running";
    return "streaming";
  })();

  return (
    <div
      className="mx-auto w-full max-w-thread px-1 sm:px-2 py-4 animate-slide-in"
      role="article"
      aria-label="Agent response"
      data-role="assistant"
    >
      <div className="mx-2 leading-normal text-foreground break-words">
        <RunFrame
          title={title}
          state={frameState}
          inputText={promptText}
          thinkingText={streaming.thinkingText}
          tools={
            Object.keys(streaming.tools).length > 0 ? streaming.tools : null
          }
          outputText={streaming.currentText || null}
          expandedToolId={streaming.expandedToolId}
        />

        {streaming.currentText && (
          <div className="mt-4">
            <Markdown content={streaming.currentText} />
          </div>
        )}
      </div>
    </div>
  );
}
