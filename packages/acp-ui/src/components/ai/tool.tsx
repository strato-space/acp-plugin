"use client";

import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import {
  CheckCircleIcon,
  ChevronDownIcon,
  CircleIcon,
  ClockIcon,
  WrenchIcon,
  XCircleIcon,
  Loader2Icon,
} from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

// Tool state type (compatible with multiple AI agents)
export type ToolState =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "streaming"
  | "approval-requested";

export type ToolProps = ComponentProps<typeof Collapsible>;

export type ToolVariant = "frame" | "line";

export type ToolFrameProps = ToolProps & {
  variant?: ToolVariant;
};

export const Tool = ({
  className,
  variant = "frame",
  ...props
}: ToolFrameProps) => (
  <Collapsible
    data-variant={variant}
    className={cn(
      "not-prose mb-2 w-full",
      variant === "frame"
        ? "rounded-md border border-border bg-card"
        : "rounded-none border-l border-border bg-transparent pl-3",
      className
    )}
    {...props}
  />
);

export type ToolHeaderProps = {
  title?: string;
  name?: string;
  icon?: ReactNode;
  state: ToolState;
  showStatusBadge?: boolean;
  afterTitle?: ReactNode;
  className?: string;
};

const getStatusBadge = (status: ToolState) => {
  const config: Record<
    ToolState,
    { label: string; icon: ReactNode; className?: string }
  > = {
    pending: {
      label: "Pending",
      icon: <CircleIcon className="size-3" />,
      className: "text-muted-foreground",
    },
    streaming: {
      label: "Streaming",
      icon: <Loader2Icon className="size-3 animate-spin" />,
      className: "text-warning",
    },
    running: {
      label: "Running",
      icon: <Loader2Icon className="size-3 animate-spin" />,
      className: "text-warning",
    },
    "approval-requested": {
      label: "Awaiting",
      icon: <ClockIcon className="size-3" />,
      className: "text-warning",
    },
    completed: {
      label: "Done",
      icon: <CheckCircleIcon className="size-3" />,
      className: "text-success",
    },
    failed: {
      label: "Failed",
      icon: <XCircleIcon className="size-3" />,
      className: "text-destructive",
    },
  };

  const { label, icon, className } = config[status] || config.pending;

  return (
    <Badge
      className={cn(
        // Fix: keep the status pill vertically stable when the row expands/collapses.
        "h-5 gap-1 rounded-full px-1.5 py-0 text-[10px] font-normal leading-none",
        className
      )}
      variant="secondary"
    >
      {icon}
      {label}
    </Badge>
  );
};

export const ToolHeader = ({
  className,
  title,
  name,
  icon,
  state,
  showStatusBadge = true,
  afterTitle,
  ...props
}: ToolHeaderProps) => (
  <CollapsibleTrigger
    className={cn(
      // Keep header geometry stable between collapsed/expanded states.
      "group flex w-full min-h-10 items-start sm:items-center justify-between gap-2 p-2.5 cursor-pointer",
      className
    )}
    {...props}
  >
    <div className="flex items-center gap-2 min-w-0 overflow-hidden">
      <span className="shrink-0">
        {icon ?? (
          <WrenchIcon className="size-4 shrink-0 text-muted-foreground" />
        )}
      </span>
      <span
        className="font-medium text-sm truncate"
        title={title ?? name ?? "Tool"}
      >
        {title ?? name ?? "Tool"}
      </span>
    </div>
    <div className="flex items-center justify-end gap-2 min-w-0 self-center flex-wrap">
      {afterTitle ? <span className="min-w-0">{afterTitle}</span> : null}
      {showStatusBadge ? getStatusBadge(state) : null}
      <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
    </div>
  </CollapsibleTrigger>
);

export type ToolContentProps = ComponentProps<typeof CollapsibleContent>;

export const ToolContent = ({ className, ...props }: ToolContentProps) => (
  <CollapsibleContent
    className={cn(
      "data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:slide-in-from-top-2 text-foreground outline-none data-[state=closed]:animate-out data-[state=open]:animate-in",
      className
    )}
    {...props}
  />
);

export type ToolInputProps = ComponentProps<"div"> & {
  input: string | Record<string, unknown> | null;
};

export const ToolInput = ({ className, input, ...props }: ToolInputProps) => {
  if (!input) return null;

  const displayInput =
    typeof input === "string" ? input : JSON.stringify(input, null, 2);

  return (
    <div
      className={cn("space-y-1.5 overflow-hidden px-3 pb-2", className)}
      {...props}
    >
      <h4 className="font-medium text-muted-foreground text-[10px] uppercase tracking-wider">
        Input
      </h4>
      <pre className="rounded-md bg-muted p-2 text-xs font-mono overflow-x-auto max-h-[200px] md:max-h-[260px] lg:max-h-[320px] overflow-y-auto whitespace-pre-wrap break-words">
        {displayInput}
      </pre>
    </div>
  );
};

export type ToolOutputProps = ComponentProps<"div"> & {
  output: string | Record<string, unknown> | null;
  error?: string | null;
};

export const ToolOutput = ({
  className,
  output,
  error,
  ...props
}: ToolOutputProps) => {
  if (!(output || error)) {
    return null;
  }

  const displayOutput =
    typeof output === "string" ? output : JSON.stringify(output, null, 2);

  return (
    <div className={cn("space-y-1.5 px-3 pb-3", className)} {...props}>
      <h4 className="font-medium text-muted-foreground text-[10px] uppercase tracking-wider">
        {error ? "Error" : "Output"}
      </h4>
      <pre
        className={cn(
          "overflow-x-auto rounded-md p-2 text-xs font-mono max-h-[200px] md:max-h-[260px] lg:max-h-[320px] overflow-y-auto whitespace-pre-wrap break-words",
          error
            ? "border border-destructive bg-muted text-destructive"
            : "bg-muted text-foreground"
        )}
      >
        {error || displayOutput}
      </pre>
    </div>
  );
};
