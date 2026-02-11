import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { useChatStore } from "@/store";
import { useVsCodeApi } from "@/hooks/useVsCodeApi";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export function SettingsDropdown() {
  const { settingsOpen: isOpen, setSettingsOpen, hierarchyStyle, setHierarchyStyle } = useChatStore();
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const showHierarchyControl = false;

  const {
    connectionState,
    agents,
    selectedAgentId,
    modes,
    currentModeId,
    models,
    currentModelId,
  } = useChatStore();

  const { selectAgent, selectMode, selectModel } = useVsCodeApi();

  const statusLabels: Record<string, string> = {
    disconnected: "Disconnected",
    connecting: "Connecting...",
    connected: "Connected",
    error: "Error",
  };

  // Calculate dropdown position to stay within viewport
  const calculatePosition = useCallback(() => {
    if (!buttonRef.current) return;

    const buttonRect = buttonRef.current.getBoundingClientRect();
    const dropdownWidth = 256; // 16rem
    const margin = 8;

    // Calculate right position, ensuring it doesn't go off-screen left
    let right = window.innerWidth - buttonRect.right;
    const leftEdge = buttonRect.right - dropdownWidth;

    if (leftEdge < margin) {
      // Would go off left edge, adjust
      right = window.innerWidth - dropdownWidth - margin;
    }

    // Prefer placing below the button when there's space (e.g. header toolbar).
    // Otherwise place above (e.g. composer toolbar at the bottom).
    const approxDropdownHeight = 360;
    const spaceBelow = window.innerHeight - buttonRect.bottom;
    const spaceAbove = buttonRect.top;
    const placeBelow =
      spaceBelow >= approxDropdownHeight || spaceBelow >= spaceAbove;

    const base: React.CSSProperties = {
      position: "fixed",
      right: Math.max(margin, right),
      width: Math.min(dropdownWidth, window.innerWidth - margin * 2),
    };

    setDropdownStyle(
      placeBelow
        ? { ...base, top: buttonRect.bottom + margin }
        : { ...base, bottom: window.innerHeight - buttonRect.top + margin }
    );
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      // Check both the button ref and dropdown ref
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(target) &&
        buttonRef.current &&
        !buttonRef.current.contains(target)
      ) {
        setSettingsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      calculatePosition();
      window.addEventListener("resize", calculatePosition);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("resize", calculatePosition);
    };
  }, [isOpen, calculatePosition]);

  const hasModes = modes.length > 0;
  const hasModels = models.length > 0;
  const hasAgents = agents.length > 0;
  const agentValue = selectedAgentId || "";
  const groupedAgents = useMemo(() => {
    const builtIn = agents.filter((a) => a.source === "builtin");
    const custom = agents.filter((a) => a.source === "custom");
    return { builtIn, custom };
  }, [agents]);

  const modeLabel = useCallback(
    (mode: { id: string; name?: string | null }) => {
      const rawId = (mode.id || "").trim();
      const rawName = (mode.name || "").trim();
      // If the mode name is just a casing variant of the id (common for ACP mode ids),
      // prefer the canonical agent display name instead (e.g. "StratoProject").
      if (rawName && rawId && rawName.toLowerCase() !== rawId.toLowerCase()) {
        return rawName;
      }
      const id = rawId;
      if (!id) return "";
      const agentMatch = agents.find(
        (a) => a.name.toLowerCase() === id.toLowerCase() || a.id.toLowerCase() === id.toLowerCase()
      );
      return agentMatch?.name || id;
    },
    [agents]
  );

  // Dropdown content to be rendered via portal
  const dropdownContent = isOpen ? (
    <div
      ref={dropdownRef}
      style={dropdownStyle}
      className="max-h-[70vh] bg-dropdown rounded-lg shadow-lg border border-border overflow-y-auto z-[9999]"
    >
      {/* Connection status */}
      <div className="p-3 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "w-2 h-2 rounded-full",
                connectionState === "connected" && "bg-success",
                connectionState === "connecting" && "bg-warning animate-pulse",
                connectionState === "disconnected" && "bg-muted-foreground",
                connectionState === "error" && "bg-destructive"
              )}
            />
            <span className="text-sm">{statusLabels[connectionState]}</span>
          </div>
        </div>
      </div>

      {/* Agent / Mode / Model selection */}
      <div className="p-3 border-b border-border space-y-3">
        <div>
          <label className="text-xs text-muted-foreground block mb-1.5">
            Agent
          </label>
          <Select
            id="agent-selector"
            value={agentValue}
            onChange={(e) => selectAgent(e.target.value)}
            label="Select Agent"
            className="w-full"
            disabled={!hasAgents}
          >
            {hasAgents ? (
              <>
                {(groupedAgents.builtIn.length > 0
                  ? groupedAgents.builtIn
                  : agents
                ).map((agent) => (
                  <option
                    key={agent.id}
                    value={agent.id}
                    style={{
                      color: agent.available
                        ? undefined
                        : "var(--vscode-disabledForeground)",
                    }}
                  >
                    {agent.available ? agent.name : `${agent.name} (not installed)`}
                  </option>
                ))}
                {groupedAgents.builtIn.length > 0 &&
                  groupedAgents.custom.length > 0 && (
                    <option disabled value="__separator__">
                      ────────────
                    </option>
                  )}
                {groupedAgents.custom.map((agent) => (
                  <option
                    key={agent.id}
                    value={agent.id}
                    style={{
                      color: agent.available
                        ? undefined
                        : "var(--vscode-disabledForeground)",
                    }}
                  >
                    {agent.available ? agent.name : `${agent.name} (not installed)`}
                  </option>
                ))}
              </>
            ) : agentValue ? (
              <option value={agentValue}>{agentValue}</option>
            ) : (
              <option value="">No agents available</option>
            )}
          </Select>
        </div>

        {hasModes && (
          <div>
            <label className="text-xs text-muted-foreground block mb-1.5">
              Subagent/Mode
            </label>
            <Select
              value={currentModeId || ""}
              onChange={(e) => selectMode(e.target.value)}
              label="Select Subagent/Mode"
              className="w-full"
            >
              {modes.map((mode) => (
                <option key={mode.id} value={mode.id}>
                  {modeLabel(mode)}
                </option>
              ))}
            </Select>
          </div>
        )}

        {hasModels && (
          <div>
            <label className="text-xs text-muted-foreground block mb-1.5">
              Model
            </label>
            <Select
              value={currentModelId || ""}
              onChange={(e) => selectModel(e.target.value)}
              label="Select Model"
              className="w-full"
            >
              {models.map((model) => (
                <option key={model.modelId} value={model.modelId}>
                  {model.name || model.modelId}
                </option>
              ))}
            </Select>
          </div>
        )}
      </div>

      {showHierarchyControl && (
        <div className="p-3">
          <label className="text-xs text-muted-foreground block mb-1.5">
            Hierarchy
          </label>
          <Select
            value={hierarchyStyle}
            onChange={(e) =>
              setHierarchyStyle(e.target.value === "frame" ? "frame" : "line")
            }
            label="Select Hierarchy"
            className="w-full"
          >
            <option value="line">Line</option>
            <option value="frame">Frame</option>
          </Select>
        </div>
      )}
    </div>
  ) : null;

  return (
    <div className="relative">
      {/* Settings button with status indicator */}
      <Button
        ref={buttonRef}
        variant="ghost"
        size="icon"
        onClick={() => setSettingsOpen(!isOpen)}
        className="relative w-9 h-9 rounded-full"
        aria-label="Settings"
        aria-expanded={isOpen}
        title="Settings"
      >
        {/* Settings icon */}
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
          <circle cx="12" cy="12" r="3" />
        </svg>

        {/* Status dot overlay */}
        <span
          className={cn(
            "absolute top-1 right-1 w-2 h-2 rounded-full border border-background",
            connectionState === "connected" && "bg-success",
            connectionState === "connecting" && "bg-warning animate-pulse",
            connectionState === "disconnected" && "bg-muted-foreground",
            connectionState === "error" && "bg-destructive"
          )}
        />
      </Button>

      {/* Render dropdown via portal to escape stacking context */}
      {dropdownContent && createPortal(dropdownContent, document.body)}
    </div>
  );
}
