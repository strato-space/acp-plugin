import { memo, useCallback, useState } from "react";
import { Copy, Check } from "lucide-react";
import type { Message } from "@/types";
import type { ToolState } from "@/components/ai/tool";
import { useChatStore } from "@/store";
import { useVsCodeApi } from "@/hooks/useVsCodeApi";
import { Markdown } from "@/components/ui/markdown";
import { RunFrame } from "./RunFrame";

interface MessageBubbleProps {
  message: Message;
  inputText?: string | null;
}

export const MessageBubble = memo(function MessageBubble({
  message,
  inputText = null,
}: MessageBubbleProps) {
  const { copyMessage } = useVsCodeApi();
  const { agents, selectedAgentId } = useChatStore();
  const [copied, setCopied] = useState(false);

  const copyText = (() => {
    if (message.type === "user") {
      return message.text.replace(/\[Image:.*?\]\n*/g, "").trim();
    }
    return message.text;
  })();

  const handleCopy = useCallback(() => {
    copyMessage(copyText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [copyText, copyMessage]);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if (message.type === "user" || message.type === "assistant") {
        e.preventDefault();
        copyMessage(copyText);
      }
    },
    [message.type, copyText, copyMessage]
  );

  // Error messages - centered with red styling
  if (message.type === "error") {
    return (
      <div
        className="mx-auto w-full max-w-thread px-2 py-4 animate-slide-in"
        role="article"
        aria-label="Error message"
      >
        <div className="rounded-xl border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
          {message.text}
        </div>
      </div>
    );
  }

  // System messages - centered, subtle
  if (message.type === "system") {
    return (
      <div
        className="mx-auto w-full max-w-thread px-2 py-2 animate-slide-in"
        role="article"
        aria-label="System message"
      >
        <div className="text-center text-xs text-muted-foreground">
          {message.text}
        </div>
      </div>
    );
  }

  // User message - right aligned with muted background (like my-app)
  if (message.type === "user") {
    const hasImages = message.attachments && message.attachments.length > 0;

    return (
      <div
        className="mx-auto grid w-full max-w-thread grid-cols-[minmax(72px,1fr)_auto] gap-y-2 px-2 py-4 animate-slide-in first:mt-3 last:mb-5"
        role="article"
        aria-label="Your message"
        onContextMenu={handleContextMenu}
        data-role="user"
      >
        <div className="col-start-2 min-w-0">
          {/* 이미지 첨부파일 표시 */}
          {hasImages && (
            <div className="flex flex-wrap gap-2 mb-2 justify-end">
              {message.attachments!.map((att) => (
                <div
                  key={att.id}
                  className="relative h-24 w-24 rounded-xl overflow-hidden border border-border bg-muted"
                >
                  <img
                    src={att.content}
                    alt={att.name}
                    className="h-full w-full object-cover"
                  />
                </div>
              ))}
            </div>
          )}
          {/* 텍스트 메시지 (이미지 태그 텍스트 제외) */}
          {message.text && !message.text.match(/^\[Image:.*\]$/) && (
            <div className="rounded-3xl bg-muted px-5 py-2.5 text-sm text-foreground break-words">
              {message.html ? (
                <div
                  className="prose prose-sm max-w-none"
                  dangerouslySetInnerHTML={{ __html: message.html }}
                />
              ) : (
                <div className="whitespace-pre-wrap">
                  {/* [Image: ...] 텍스트 제거 */}
                  {message.text.replace(/\[Image:.*?\]\n*/g, "").trim()}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Copy button (user) */}
        {copyText && (
          <div className="col-start-2 flex justify-end">
            <button
              onClick={handleCopy}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              aria-label="Copy message"
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5 text-success" />
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                </>
              )}
            </button>
          </div>
        )}
      </div>
    );
  }

  // Assistant message - full width, left aligned (like my-app)
  const title = (() => {
    const agent = agents.find((a) => a.id === selectedAgentId);
    return agent?.name || selectedAgentId || "StratoProject";
  })();

  const frameState: ToolState = (() => {
    const tools = message.tools ? Object.values(message.tools as any) : [];
    if (tools.some((t: any) => t?.status === "failed")) return "failed";
    if (tools.some((t: any) => t?.status === "running")) return "running";
    return "completed";
  })();

  return (
    <div
      className="mx-auto w-full max-w-thread px-2 py-4 animate-slide-in last:mb-24"
      role="article"
      aria-label="Agent response"
      onContextMenu={handleContextMenu}
      data-role="assistant"
    >
      <div className="mx-2 text-foreground break-words leading-normal">
        <RunFrame
          title={title}
          state={frameState}
          inputText={inputText}
          tools={message.tools && Object.keys(message.tools).length > 0 ? message.tools : null}
          outputText={message.text}
          defaultOpen={!!(message.tools && Object.keys(message.tools).length > 0)}
        />

        {message.html ? (
          <div
            className="prose prose-sm max-w-none mt-4"
            dangerouslySetInnerHTML={{ __html: message.html }}
          />
        ) : (
          <div className="mt-4">
            <Markdown content={message.text} />
          </div>
        )}

        {/* Copy button - always visible */}
        {message.text && (
          <div className="mt-3 flex justify-start">
            <button
              onClick={handleCopy}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              aria-label="Copy message"
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5 text-success" />
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
});
