import { memo, useMemo } from "react";
import type { ReactNode } from "react";
import { Tool as ToolFrame, ToolHeader, ToolContent } from "@/components/ai/tool";
import { useChatStore } from "@/store";

function toSingleLinePreview(text: string, maxLen: number): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  if (oneLine.length <= maxLen) return oneLine;
  return oneLine.slice(0, Math.max(0, maxLen - 1)).trimEnd() + "…";
}

export type IOFrameProps = {
  title: string;
  icon: ReactNode;
  value: unknown;
  children: ReactNode;
  previewText?: string;
  defaultOpen?: boolean;
  className?: string;
  previewMaxLen?: number;
};

export const IOFrame = memo(function IOFrame({
  title,
  icon,
  value,
  children,
  previewText,
  defaultOpen = false,
  className,
  previewMaxLen = 120,
}: IOFrameProps) {
  const hierarchyStyle = useChatStore((s) => s.hierarchyStyle);
  const preview = useMemo(() => {
    if (typeof previewText === "string") {
      return toSingleLinePreview(previewText, previewMaxLen);
    }
    if (value === null || value === undefined) return "";
    if (typeof value === "string") {
      return toSingleLinePreview(value, previewMaxLen);
    }
    try {
      return toSingleLinePreview(JSON.stringify(value), previewMaxLen);
    } catch {
      try {
        return toSingleLinePreview(String(value), previewMaxLen);
      } catch {
        return "";
      }
    }
  }, [value, previewMaxLen, previewText]);

  const header = preview ? `${title} · ${preview}` : title;

  return (
    <ToolFrame
      defaultOpen={defaultOpen}
      variant={hierarchyStyle}
      className={className}
    >
      <ToolHeader
        title={header}
        state="completed"
        icon={icon}
        showStatusBadge={false}
      />
      <ToolContent>{children}</ToolContent>
    </ToolFrame>
  );
});
