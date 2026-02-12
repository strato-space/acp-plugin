import { useChatStore } from "@/store";
import {
  REASONING_OPTIONS,
  shouldShowReasoningControl,
  useVsCodeApi,
} from "@/hooks/useVsCodeApi";
import { Select } from "@/components/ui/select";

export function OptionsBar() {
  const {
    modes,
    currentModeId,
    models,
    currentModelId,
    agents,
    selectedAgentId,
    currentReasoningId,
  } = useChatStore();
  const { selectMode, selectModel, selectReasoning } = useVsCodeApi();

  const hasModes = modes.length > 0;
  const hasModels = models.length > 0;
  const hasReasoning = shouldShowReasoningControl(
    selectedAgentId,
    agents,
    currentModelId
  );

  if (!hasModes && !hasModels && !hasReasoning) {
    return null;
  }

  return (
    <div className="flex items-center gap-2 px-2.5 py-1.5 border-t border-border text-xs flex-wrap flex-shrink-0">
      {hasModes && (
        <Select
          value={currentModeId || ""}
          onChange={(e) => selectMode(e.target.value)}
          label="Select Mode"
        >
          {modes.map((mode) => (
            <option key={mode.id} value={mode.id}>
              Mode: {(() => {
                if (mode.name && mode.name.trim()) return mode.name;
                const id = (mode.id || "").trim();
                const agentMatch = agents.find(
                  (a) => a.name.toLowerCase() === id.toLowerCase() || a.id.toLowerCase() === id.toLowerCase()
                );
                return agentMatch?.name || id;
              })()}
            </option>
          ))}
        </Select>
      )}

      {hasModels && (
        <Select
          value={currentModelId || ""}
          onChange={(e) => selectModel(e.target.value)}
          label="Select Model"
        >
          {models.map((model) => (
            <option key={model.modelId} value={model.modelId}>
              Model: {model.name || model.modelId}
            </option>
          ))}
        </Select>
      )}

      {hasReasoning && (
        <Select
          value={currentReasoningId || "system"}
          onChange={(e) => selectReasoning(e.target.value)}
          label="Select Reasoning"
        >
          {REASONING_OPTIONS.map((option) => (
            <option key={option.id} value={option.id}>
              Reasoning: {option.name}
            </option>
          ))}
        </Select>
      )}

      <div className="flex-1" />

      <span className="text-muted-foreground">
        <kbd className="px-1 py-0.5 text-[10px] bg-muted border border-border rounded">
          Enter
        </kbd>{" "}
        to send
      </span>
    </div>
  );
}
