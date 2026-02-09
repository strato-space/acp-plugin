import { useChatStore } from "@/store";
import { useVsCodeApi } from "@/hooks/useVsCodeApi";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { StoredSession } from "@/types";

interface SessionSidebarProps {
  isOpen: boolean;
  onToggle: () => void;
}

export function SessionSidebar({ isOpen, onToggle }: SessionSidebarProps) {
  const {
    sessions,
    currentSessionId,
    agents,
    collapsedAgentIds,
    toggleAgentCollapsed,
    appVersion,
  } = useChatStore();
  const { selectSession, newChat, deleteSession } = useVsCodeApi();

  // Group sessions by agent
  const sessionsByAgent = sessions.reduce(
    (acc, session) => {
      const agentId = session.agentId;
      if (!acc[agentId]) {
        acc[agentId] = [];
      }
      acc[agentId].push(session);
      return acc;
    },
    {} as Record<string, StoredSession[]>
  );

  const getAgentName = (agentId: string) => {
    const agent = agents.find((a) => a.id === agentId);
    return agent?.name || agentId;
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
      return date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
    } else if (days === 1) {
      return "Yesterday";
    } else if (days < 7) {
      return date.toLocaleDateString([], { weekday: "short" });
    } else {
      return date.toLocaleDateString([], { month: "short", day: "numeric" });
    }
  };

  return (
    <>
      {/* Sidebar */}
      <div
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex flex-col bg-background border-r border-border transition-transform duration-300 ease-in-out",
          "w-64",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b border-border">
          <div className="flex items-center gap-2">
            <span className="relative inline-flex items-center justify-center">
              <svg
                className="w-5 h-5"
                viewBox="0 0 128 128"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
              >
                <g transform="translate(4, 34) scale(0.208)">
                  <path
                    d="M568.003 115.821L517.278 27.9661C507.183 10.4816 489.084 0.0227367 468.894 0.0227367C448.727 0.0227367 430.674 10.4361 420.556 27.8752L343.251 161.749H242.755C236.23 161.749 230.386 158.384 227.135 152.745C223.861 147.106 223.861 140.376 227.135 134.715L277.861 46.8603C281.112 41.2216 286.955 37.8338 293.481 37.8338C300.006 37.8338 305.827 41.1988 309.101 46.8603L312.125 52.0897C313.353 54.2042 315.604 55.5002 318.036 55.5002C320.469 55.5002 322.743 54.1815 323.948 52.067L337.385 28.5118C338.795 26.0335 338.522 22.9413 336.703 20.7586C325.699 7.57131 309.874 0 293.322 0C292.662 0 292.003 0 291.321 0.0454733C272.04 0.75031 254.76 11.1864 245.074 27.9434L200.215 105.657L155.81 29.1484C145.465 11.2092 126.594 0.0227367 106.608 0.0227367C105.949 0.0227367 105.289 0.0227367 104.607 0.06821C85.3265 0.773047 68.0467 11.2092 58.3608 27.9661L7.65806 115.821C-6.25678 139.899 -0.868187 168.82 21.05 187.759C29.8945 195.422 41.6039 199.628 54.0181 199.628H148.648C151.081 199.628 153.332 198.332 154.56 196.217L168.52 172.026C169.748 169.911 169.748 167.319 168.52 165.205C167.292 163.09 165.041 161.794 162.608 161.794H56.0417C49.5163 161.794 43.6729 158.429 40.4216 152.79C37.1475 147.152 37.1475 140.422 40.4216 134.76L91.1471 46.9057C94.3985 41.2671 100.242 37.8793 106.767 37.8793C113.293 37.8793 119.113 41.2443 122.387 46.9057L194.826 172.526C195.031 172.89 195.258 173.208 195.531 173.526C198.76 178.665 202.83 183.485 207.786 187.782C216.631 195.444 228.34 199.651 240.754 199.651H321.424L315.581 209.769C314.353 211.883 314.353 214.475 315.581 216.59C316.809 218.704 319.059 220 321.492 220H349.436C351.868 220 354.119 218.704 355.347 216.59L364.396 200.901L367.17 196.468C367.17 196.468 367.261 196.331 367.284 196.263L453.274 46.9285C456.525 41.2898 462.369 37.902 468.894 37.902C475.42 37.902 481.263 41.2671 484.514 46.9285L535.24 134.783C538.491 140.422 538.514 147.174 535.24 152.813C531.988 158.452 526.145 161.84 519.62 161.84H418.669C416.236 161.84 413.985 163.136 412.757 165.25L398.774 189.442C397.546 191.556 397.546 194.148 398.774 196.263C400.002 198.377 402.253 199.673 404.686 199.673H518.21C539.81 199.673 559.295 188.237 569.026 169.843C578.053 152.79 577.666 132.623 567.981 115.843L568.003 115.821Z"
                    fill="currentColor"
                  />
                </g>
                {/* AI dots */}
                <circle
                  cx="42"
                  cy="114"
                  r="3"
                  fill="currentColor"
                  opacity="0.85"
                />
                <circle
                  cx="64"
                  cy="114"
                  r="3"
                  fill="currentColor"
                  opacity="0.85"
                />
                <circle
                  cx="86"
                  cy="114"
                  r="3"
                  fill="currentColor"
                  opacity="0.85"
                />
              </svg>
            </span>
            <span className="font-semibold text-sm">
              ACP{appVersion ? ` v${appVersion}` : ""}
            </span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={onToggle}
          >
            <svg
              className="w-4 h-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </Button>
        </div>

        {/* New Chat Button */}
        <div className="p-2">
          <Button
            variant="ghost"
            className="w-full justify-start gap-2 text-sm"
            onClick={newChat}
          >
            <svg
              className="w-4 h-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
            New Chat
          </Button>
        </div>

        {/* Sessions List */}
        <div className="flex-1 overflow-y-auto px-2 pb-2">
          {Object.entries(sessionsByAgent).map(([agentId, agentSessions]) => (
            <div key={agentId} className="mb-4">
              <button
                type="button"
                className={cn(
                  "w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-md",
                  "text-xs font-medium text-muted-foreground hover:bg-muted/40 transition-colors"
                )}
                onClick={() => toggleAgentCollapsed(agentId)}
                aria-expanded={!collapsedAgentIds.includes(agentId)}
              >
                <span className="truncate">{getAgentName(agentId)}</span>
                <svg
                  className={cn(
                    "w-3.5 h-3.5 shrink-0 transition-transform",
                    !collapsedAgentIds.includes(agentId) ? "rotate-180" : ""
                  )}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>

              {!collapsedAgentIds.includes(agentId) && (
                <div className="space-y-1">
                  {agentSessions.map((session) => (
                    <div
                      key={session.id}
                      className={cn(
                        "group w-full flex items-center gap-2 px-2 py-2 rounded-lg text-left text-sm transition-colors",
                        "hover:bg-muted cursor-pointer",
                        currentSessionId === session.id && "bg-muted"
                      )}
                      onClick={() => selectSession(session.id)}
                    >
                      <span className="flex-1 truncate">{session.title}</span>
                      <span className="text-xs text-muted-foreground group-hover:hidden">
                        {formatTime(session.timestamp)}
                      </span>
                      <button
                        className="hidden group-hover:flex items-center justify-center w-5 h-5 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteSession(session.id);
                        }}
                        aria-label="Delete session"
                      >
                        <svg
                          className="w-3.5 h-3.5"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}

          {sessions.length === 0 && (
            <div className="text-center py-8 text-muted-foreground text-sm">
              No sessions yet
            </div>
          )}
        </div>
      </div>

      {/* Toggle Button (when closed) */}
      {!isOpen && (
        <Button
          variant="ghost"
          size="icon"
          className="fixed top-2 left-2 z-30 h-8 w-8"
          onClick={onToggle}
        >
          <svg
            className="w-4 h-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M3 12h18M3 6h18M3 18h18" />
          </svg>
        </Button>
      )}

      {/* Backdrop (mobile) */}
      {isOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={onToggle}
        />
      )}
    </>
  );
}
