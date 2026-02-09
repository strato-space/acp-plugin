import { useEffect, useRef } from "react";
import { useChatStore } from "@/store";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageBubble } from "./MessageBubble";
import { StreamingMessage } from "./StreamingMessage";
import { PlanDisplay } from "./PlanDisplay";

export function ChatContainer() {
  const { messages, streaming, isThinking, plan, connectAlert } = useChatStore();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streaming.currentText, isThinking, plan]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const container = scrollRef.current;
    if (!container) return;

    const messageEls = container.querySelectorAll("[role='article']");
    const focused = document.activeElement;
    const currentIndex = Array.from(messageEls).indexOf(focused as Element);

    if (e.key === "ArrowDown" && currentIndex < messageEls.length - 1) {
      e.preventDefault();
      (messageEls[currentIndex + 1] as HTMLElement).focus();
    } else if (e.key === "ArrowUp" && currentIndex > 0) {
      e.preventDefault();
      (messageEls[currentIndex - 1] as HTMLElement).focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      (messageEls[0] as HTMLElement)?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      (messageEls[messageEls.length - 1] as HTMLElement)?.focus();
    }
  };

  return (
    <ScrollArea
      className="relative flex flex-1 flex-col overflow-x-auto overflow-y-scroll px-4"
      scrollRef={scrollRef}
      onKeyDown={handleKeyDown}
    >
      <div className="flex flex-col" role="log" aria-live="polite">
        {/* Transient connect banner (cleared once we connect/reconnect) */}
        {connectAlert && (
          <div
            className="mx-auto w-full max-w-thread px-2 py-4 animate-slide-in"
            role="status"
            aria-label="Connection status"
          >
            <div className="rounded-xl border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
              {connectAlert}
            </div>
          </div>
        )}

        {messages.map((message, idx) => {
          let inputText: string | null = null;
          if (message.type === "assistant") {
            for (let j = idx - 1; j >= 0; j--) {
              const prev = messages[j];
              if (prev.type === "user") {
                inputText = prev.text;
                break;
              }
            }
          }
          return (
            <MessageBubble key={message.id} message={message} inputText={inputText} />
          );
        })}

        {/* Currently streaming message */}
        <StreamingMessage />

        {/* Plan display */}
        {plan && plan.length > 0 && (
          <div className="mx-auto w-full max-w-thread px-2 py-4">
            <PlanDisplay entries={plan} />
          </div>
        )}

        {/* Thinking indicator */}
      </div>

      {/* Spacer for non-empty thread */}
      {messages.length > 0 && <div className="min-h-8 grow" />}
    </ScrollArea>
  );
}
