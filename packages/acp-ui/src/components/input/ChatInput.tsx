import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { Paperclip, ImageIcon, MoreHorizontal, Trash2 } from "lucide-react";
import { useChatStore } from "@/store";
import { useVsCodeApi } from "@/hooks/useVsCodeApi";
import { Button } from "@/components/ui/button";
import { CommandAutocomplete } from "./CommandAutocomplete";
import { SettingsDropdown } from "./SettingsDropdown";
import { AttachmentChip } from "./AttachmentChip";
import type { AvailableCommand, Attachment } from "@/types";
import { cn } from "@/lib/utils";

// Mode별 색상 매핑
const MODE_COLORS: Record<string, { border: string; button: string; indicator: string; badge: string }> = {
  code: { border: "border-blue-500", button: "bg-blue-600 hover:bg-blue-700", indicator: "bg-blue-500", badge: "bg-blue-500/20 text-blue-400" },
  agent: { border: "border-violet-500", button: "bg-violet-600 hover:bg-violet-700", indicator: "bg-violet-500", badge: "bg-violet-500/20 text-violet-400" },
  architect: { border: "border-emerald-500", button: "bg-emerald-600 hover:bg-emerald-700", indicator: "bg-emerald-500", badge: "bg-emerald-500/20 text-emerald-400" },
  plan: { border: "border-emerald-500", button: "bg-emerald-600 hover:bg-emerald-700", indicator: "bg-emerald-500", badge: "bg-emerald-500/20 text-emerald-400" },
  ask: { border: "border-amber-500", button: "bg-amber-600 hover:bg-amber-700", indicator: "bg-amber-500", badge: "bg-amber-500/20 text-amber-400" },
  bypass: { border: "border-red-500", button: "bg-red-600 hover:bg-red-700", indicator: "bg-red-500", badge: "bg-red-500/20 text-red-400" },
  // Default (theme tokens). Avoid `/alpha` Tailwind variants for CSS-variable colors.
  default: { border: "border-border", button: "bg-primary hover:opacity-90", indicator: "bg-primary", badge: "bg-muted" },
};

function getModeColors(modeId: string | null) {
  if (!modeId) return MODE_COLORS.default;
  const lowerMode = modeId.toLowerCase();
  for (const [key, colors] of Object.entries(MODE_COLORS)) {
    if (lowerMode.includes(key)) return colors;
  }
  return MODE_COLORS.default;
}

export function ChatInput() {
  const {
    inputValue,
    setInputValue,
    availableCommands,
    isThinking,
    connectionState,
    attachments,
    addAttachment,
    removeAttachment,
    clearAttachments,
    // Agent & Mode info
    agents,
    selectedAgentId,
    modes,
    currentModeId,
    toggleSettingsOpen,
  } = useChatStore();
  const { sendMessage, selectFiles, selectImages, selectMode, cancel } = useVsCodeApi();

  const [selectedCommandIndex, setSelectedCommandIndex] = useState(-1);
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const flushLockRef = useRef(false);

  const [queuedMessages, setQueuedMessages] = useState<
    Array<{ id: string; text: string; attachments?: Attachment[] }>
  >([]);

  // 현재 연결된 에이전트 이름
  const selectedAgent = useMemo(() => {
    return agents.find((a) => a.id === selectedAgentId);
  }, [agents, selectedAgentId]);

  const selectedAgentLabel = useMemo(() => {
    const id = (selectedAgentId || "").trim();
    if (selectedAgent?.name) return selectedAgent.name;
    return id ? id : null;
  }, [selectedAgent?.name, selectedAgentId]);

  // 현재 모드에 따른 색상
  const modeColors = useMemo(() => getModeColors(currentModeId), [currentModeId]);

  // 현재 모드 이름
  const currentModeName = useMemo(() => {
    const mode = modes.find((m) => m.id === currentModeId);
    const rawId = (currentModeId || "").trim();
    const rawName = (mode?.name || "").trim();
    // If the mode name is just a casing variant of the id, prefer the canonical
    // agent display name (e.g. "StratoProject") to avoid "Stratoproject".
    if (rawName && rawId && rawName.toLowerCase() !== rawId.toLowerCase()) {
      return rawName;
    }
    const id = rawId;
    if (!id) return null;
    const agentMatch = agents.find(
      (a) => a.name.toLowerCase() === id.toLowerCase() || a.id.toLowerCase() === id.toLowerCase()
    );
    return agentMatch?.name || id;
  }, [modes, currentModeId, agents]);

  // Shift+Tab 모드 전환 핸들러
  const handleModeSwitch = useCallback(() => {
    if (modes.length < 2) return;
    const currentIndex = modes.findIndex((m) => m.id === currentModeId);
    const nextIndex = (currentIndex + 1) % modes.length;
    selectMode(modes[nextIndex].id);
  }, [modes, currentModeId, selectMode]);

  const getFilteredCommands = useCallback(
    (query: string): AvailableCommand[] => {
      if (!query.startsWith("/")) return [];
      const search = query.slice(1).toLowerCase();
      return availableCommands.filter(
        (cmd) =>
          cmd.name.toLowerCase().startsWith(search) ||
          cmd.description?.toLowerCase().includes(search)
      );
    },
    [availableCommands]
  );

  const filteredCommands = getFilteredCommands(inputValue.split(/\s/)[0]);

  const handleSend = useCallback(() => {
    const text = inputValue.trim();
    const hasAttachments = attachments.length > 0;

    // If we're currently running and there's nothing to send, treat this as Stop.
    if (isThinking && !text && !hasAttachments) {
      cancel();
      return;
    }

    if (!text && !hasAttachments) return;

    // If the agent is busy, queue follow-ups instead of sending immediately.
    if (isThinking) {
      setQueuedMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          text,
          attachments: hasAttachments ? attachments : undefined,
        },
      ]);
      setInputValue("");
      clearAttachments();
      setShowAutocomplete(false);
      if (textareaRef.current) textareaRef.current.style.height = "auto";
      return;
    }

    sendMessage(text, hasAttachments ? attachments : undefined);
    setInputValue("");
    clearAttachments();
    setShowAutocomplete(false);
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  }, [
    inputValue,
    attachments,
    sendMessage,
    setInputValue,
    clearAttachments,
    isThinking,
    cancel,
  ]);

  const handleSelectCommand = useCallback(
    (index: number) => {
      const commands = filteredCommands;
      if (index >= 0 && index < commands.length) {
        setInputValue("/" + commands[index].name + " ");
        setShowAutocomplete(false);
        setSelectedCommandIndex(-1);
        textareaRef.current?.focus();
      }
    },
    [filteredCommands, setInputValue]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const commands = filteredCommands;

      if (showAutocomplete && commands.length > 0) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setSelectedCommandIndex((prev) =>
            Math.min(prev + 1, commands.length - 1)
          );
          return;
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          setSelectedCommandIndex((prev) => Math.max(prev - 1, 0));
          return;
        } else if (
          e.key === "Tab" ||
          (e.key === "Enter" && selectedCommandIndex >= 0)
        ) {
          e.preventDefault();
          handleSelectCommand(selectedCommandIndex);
          return;
        } else if (e.key === "Escape") {
          e.preventDefault();
          setShowAutocomplete(false);
          setSelectedCommandIndex(-1);
          return;
        }
      }

      // Shift+Tab: 모드 전환 (Claude Code 등)
      if (e.key === "Tab" && e.shiftKey) {
        e.preventDefault();
        handleModeSwitch();
        return;
      }

      // Check for IME composition (Korean, Japanese, Chinese input)
      // During composition, isComposing is true and we should not send
      if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
        e.preventDefault();
        handleSend();
      } else if (e.key === "Escape") {
        e.preventDefault();
        setInputValue("");
        setShowAutocomplete(false);
        if (textareaRef.current) {
          textareaRef.current.style.height = "auto";
        }
      }
    },
    [
      showAutocomplete,
      filteredCommands,
      selectedCommandIndex,
      handleSelectCommand,
      handleSend,
      setInputValue,
      handleModeSwitch,
    ]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value;
      setInputValue(value);

      // Auto-resize
      const textarea = textareaRef.current;
      if (textarea) {
        textarea.style.height = "auto";
        textarea.style.height = Math.min(textarea.scrollHeight, 128) + "px";
      }

      // Update autocomplete
      const firstWord = value.split(/\s/)[0];
      if (firstWord.startsWith("/") && !value.includes(" ")) {
        const filtered = getFilteredCommands(firstWord);
        setShowAutocomplete(filtered.length > 0);
        setSelectedCommandIndex(filtered.length > 0 ? 0 : -1);
      } else {
        setShowAutocomplete(false);
        setSelectedCommandIndex(-1);
      }
    },
    [setInputValue, getFilteredCommands]
  );

  // Handle file drop
  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      const files = Array.from(e.dataTransfer.files);
      for (const file of files) {
        const reader = new FileReader();
        reader.onload = (event) => {
          const content = event.target?.result as string;
          const isImage = file.type.startsWith("image/");

          addAttachment({
            type: isImage ? "image" : "file",
            name: file.name,
            content: content,
            mimeType: file.type,
          });
        };

        if (file.type.startsWith("image/")) {
          reader.readAsDataURL(file);
        } else {
          reader.readAsText(file);
        }
      }
    },
    [addAttachment]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Only set to false if leaving the drop zone entirely
    if (!dropZoneRef.current?.contains(e.relatedTarget as Node)) {
      setIsDragging(false);
    }
  }, []);

  // Handle paste (for images)
  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const items = Array.from(e.clipboardData.items);

      for (const item of items) {
        if (item.type.startsWith("image/")) {
          e.preventDefault();
          const file = item.getAsFile();
          if (!file) continue;

          const reader = new FileReader();
          reader.onload = (event) => {
            const content = event.target?.result as string;
            addAttachment({
              type: "image",
              name: `pasted-image-${Date.now()}.png`,
              content: content,
              mimeType: item.type,
            });
          };
          reader.readAsDataURL(file);
        }
      }
    },
    [addAttachment]
  );

  // Hide autocomplete when input is empty
  useEffect(() => {
    if (!inputValue) {
      setShowAutocomplete(false);
      setSelectedCommandIndex(-1);
    }
  }, [inputValue]);

  // Flush queued follow-ups once the agent becomes idle.
  useEffect(() => {
    if (isThinking) {
      flushLockRef.current = false;
      return;
    }
    if (queuedMessages.length === 0) return;
    if (flushLockRef.current) return;

    flushLockRef.current = true;
    const next = queuedMessages[0];
    setQueuedMessages((prev) => prev.slice(1));
    sendMessage(next.text, next.attachments && next.attachments.length > 0 ? next.attachments : undefined);
  }, [isThinking, queuedMessages, sendMessage]);

  const hasContent = inputValue.trim() || attachments.length > 0;
  const showStop = isThinking && !hasContent;
  const connectionDotClass = useMemo(() => {
    if (connectionState === "connected") return "bg-success";
    if (connectionState === "connecting") return "bg-warning animate-pulse";
    if (connectionState === "error") return "bg-destructive";
    return "bg-muted-foreground";
  }, [connectionState]);

  return (
    <div className="sticky bottom-0 w-full overflow-visible rounded-t-3xl bg-background pb-4">
      <div className="mx-auto w-full max-w-thread px-2">
        <div
          ref={dropZoneRef}
          className="relative flex w-full flex-col"
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
        >
          <CommandAutocomplete
            commands={filteredCommands}
            selectedIndex={selectedCommandIndex}
            onSelect={handleSelectCommand}
            onHover={setSelectedCommandIndex}
            visible={showAutocomplete}
          />

        {/* Drop overlay */}
        {isDragging && (
          <div className="absolute inset-0 z-50 flex items-center justify-center rounded-3xl border-2 border-dashed border-primary bg-muted">
            <div className="text-sm font-medium text-primary">
              Drop files here
            </div>
          </div>
        )}

        {/* Input container - my-app Composer style with mode-based colors */}
        <div className={cn(
          "flex w-full flex-col rounded-3xl border bg-card px-1 pt-2 shadow-sm transition-all duration-200",
          modeColors.border
        )}>
          {/* AI & Mode indicator */}
          {(selectedAgentLabel || currentModeId) && (
            <div className="flex items-center gap-2 px-3 pb-1.5">
              {selectedAgentLabel && (
                <button
                  type="button"
                  onClick={toggleSettingsOpen}
                  className="flex items-center gap-1.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                  title="Open settings"
                >
                  <span className={cn("h-1.5 w-1.5 rounded-full", connectionDotClass)} />
                  <span className="font-medium px-2 py-0.5 rounded-full border border-border bg-muted">
                    {selectedAgentLabel}
                  </span>
                </button>
              )}
              {currentModeName && modes.length > 1 && (
                <button
                  onClick={handleModeSwitch}
                  className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                  title="Shift+Tab to switch subagent/mode"
                >
                  <span className="opacity-60">·</span>
                  <span className={cn(
                    "px-1.5 py-0.5 rounded-md text-[9px] font-medium transition-colors",
                    modeColors.badge
                  )}>
                    {currentModeName}
                  </span>
                </button>
              )}
            </div>
          )}

          {/* Attachments area */}
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-1.5 px-3 pb-2">
              {attachments.map((attachment) => (
                <AttachmentChip
                  key={attachment.id}
                  attachment={attachment}
                  onRemove={removeAttachment}
                />
              ))}
            </div>
          )}

          {/* Queued follow-ups */}
          {queuedMessages.length > 0 && (
            <div className="px-3 pb-2 space-y-1.5">
              {queuedMessages.map((item) => {
                const preview = item.text.trim()
                  ? item.text.trim().replace(/\s+/g, " ").slice(0, 80)
                  : item.attachments && item.attachments.length > 0
                    ? `${item.attachments.length} attachment${item.attachments.length !== 1 ? "s" : ""}`
                    : "(empty)";

                return (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-2 rounded-xl border border-border bg-muted px-2.5 py-1.5"
                    title={item.text}
                  >
                    <div className="min-w-0 text-[11px] text-muted-foreground truncate">
                      {preview}
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 rounded-lg"
                        aria-label="Edit queued message"
                        title="Edit"
                        onClick={() => {
                          // Remove from queue and restore into the editor
                          setQueuedMessages((prev) => prev.filter((m) => m.id !== item.id));
                          setInputValue(item.text);
                          clearAttachments();
                          if (item.attachments && item.attachments.length > 0) {
                            for (const att of item.attachments) {
                              const { id: _id, ...rest } = att as any;
                              addAttachment(rest);
                            }
                          }
                          textareaRef.current?.focus();
                        }}
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 rounded-lg"
                        aria-label="Delete queued message"
                        title="Delete"
                        onClick={() =>
                          setQueuedMessages((prev) => prev.filter((m) => m.id !== item.id))
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <textarea
            id="input"
            ref={textareaRef}
            value={inputValue}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder="Ask anything"
            className="mb-1 max-h-32 min-h-16 w-full resize-none bg-transparent px-3.5 pt-1.5 pb-3 text-base outline-none placeholder:text-muted-foreground placeholder:opacity-25 focus:outline-none focus:ring-0 focus:border-0"
            rows={1}
            autoFocus
            aria-label="Message input"
            aria-expanded={showAutocomplete}
            aria-haspopup="listbox"
            aria-autocomplete="list"
          />

          {/* Action row - buttons */}
          <div className="relative mx-1 mt-2 mb-2 flex items-center justify-between">
            {/* Left side: Settings and attachment buttons */}
            <div className="flex items-center gap-1">
              <SettingsDropdown />

              {/* Reload webview (no window reload) */}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => window.location.reload()}
                className="h-8 w-8 rounded-full"
                aria-label="Reload"
                title="Reload"
              >
                <span className="text-base leading-none">↻</span>
              </Button>

              {/* Attach file button */}
              <Button
                variant="ghost"
                size="icon"
                onClick={selectFiles}
                className="h-8 w-8 rounded-full"
                aria-label="Attach file"
                title="Attach file"
              >
                <Paperclip className="h-4 w-4" />
              </Button>

              {/* Attach image button */}
              <Button
                variant="ghost"
                size="icon"
                onClick={selectImages}
                className="h-8 w-8 rounded-full"
                aria-label="Attach image"
                title="Attach image"
              >
                <ImageIcon className="h-4 w-4" />
              </Button>
            </div>

            {/* Send button on the right - color changes with mode */}
            <Button
              onClick={handleSend}
              disabled={!hasContent && !isThinking}
              size="icon"
              className={cn(
                "size-[34px] rounded-full p-1 transition-colors duration-200",
                (!hasContent && !isThinking) || showStop ? "" : modeColors.button
              )}
              aria-label={showStop ? "Stop" : isThinking ? "Queue message" : "Send message"}
              title={showStop ? "Stop" : isThinking ? "Queue message" : "Send"}
            >
              {showStop ? (
                <span className="text-base leading-none">■</span>
              ) : (
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="m5 12 7-7 7 7" />
                  <path d="M12 19V5" />
                </svg>
              )}
            </Button>
          </div>
	        </div>
	      </div>
	    </div>
	  </div>
	  );
}
