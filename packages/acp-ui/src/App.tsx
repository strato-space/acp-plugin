import { useChatStore } from "@/store";
import { useVsCodeInit } from "@/hooks/useVsCodeApi";
import { WelcomeView } from "@/components/layout/WelcomeView";
import { ChatContainer } from "@/components/chat/ChatContainer";
import { ChatInput } from "@/components/input/ChatInput";
import { SessionSidebar } from "@/components/layout/SessionSidebar";
import { cn } from "@/lib/utils";

export function App() {
  // Initialize VS Code API message handling
  useVsCodeInit();

  const { connectionState, messages, sidebarOpen, setSidebarOpen } =
    useChatStore();

  const isDisconnected = connectionState === "disconnected";
  const isConnecting = connectionState === "connecting";
  const hasMessages = messages.length > 0;

  // Only show welcome when disconnected and no messages, but keep the composer visible.
  const showWelcome = isDisconnected && !hasMessages;

  return (
    <div id="acp-root" className="h-full flex">
      {/* Session Sidebar */}
      <SessionSidebar
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
      />

      {/* Main Content */}
      <div
        className={cn(
          "flex-1 flex flex-col h-full transition-all duration-300",
          // Sidebar is `position: fixed`, so use padding instead of margin to keep content centered.
          sidebarOpen ? "pl-0 md:pl-64" : "pl-0"
        )}
      >
        {/* Sidebar open button (when closed) */}
        {!sidebarOpen && (
          <button
            type="button"
            className="fixed left-3 top-3 z-50 inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-background text-foreground shadow-sm backdrop-blur hover:bg-muted"
            aria-label="Open sidebar"
            title="Open sidebar"
            onClick={() => setSidebarOpen(true)}
          >
            <svg
              className="h-5 w-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M4 6h16" />
              <path d="M4 12h16" />
              <path d="M4 18h16" />
            </svg>
          </button>
        )}

        {/* Connecting indicator */}
        {isConnecting && (
          <div className="flex items-center justify-center py-4 text-muted-foreground text-sm animate-pulse">
            <svg
              className="animate-spin mr-2 h-4 w-4"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            Connecting...
          </div>
        )}

        {showWelcome ? <WelcomeView /> : <ChatContainer />}
        <ChatInput />
      </div>
    </div>
  );
}
