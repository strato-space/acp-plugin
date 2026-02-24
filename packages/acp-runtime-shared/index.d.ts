export type ReasoningLevel = "system" | "minimal" | "low" | "medium" | "high";

export type AgentIdentity = {
  id: string;
  name: string;
};

export type AgentConfig = {
  id: string;
  name: string;
  command: string;
  args: string[];
  cwd?: string;
  env?: Record<string, string>;
};

export type AgentServerSetting = {
  type?: string;
  name?: string;
  command?: string;
  args?: unknown;
  cwd?: string;
  env?: Record<string, string>;
};

export type ScopedExternalSettingsEntry = {
  scope: "global" | "workspace";
  servers: Record<string, AgentServerSetting>;
  includeBuiltins?: boolean;
  sourcePath?: string;
};

export declare const BUILTIN_AGENTS: AgentConfig[];

export declare function normalizeReasoningLevel(
  value: string | undefined | null
): ReasoningLevel;

export declare function isCodexAgent(agent: AgentIdentity): boolean;
export declare function isFastAgent(agent: AgentIdentity): boolean;

export declare function withModelReasoning(
  modelId: string,
  reasoning: ReasoningLevel
): string;

export declare function upsertArg(
  args: string[],
  key: string,
  value: string
): string[];

export declare function removeCodexReasoningOverride(args: string[]): string[];

export declare function isRecord(value: unknown): value is Record<string, unknown>;
export declare function stripJsonComments(input: string): string;
export declare function removeTrailingCommas(input: string): string;
export declare function parseJsonc(raw: string): unknown;

export declare function getAgentServers(
  parsed: Record<string, unknown>
): Record<string, AgentServerSetting>;

export declare function getIncludeBuiltins(
  parsed: Record<string, unknown>
): boolean | undefined;

export declare function hasTransportAcpArg(args: string[]): boolean;
export declare function ensureWatchForAcpTransport(args: string[]): string[];

export declare function toAgentConfigsFromServers(
  servers: Record<string, AgentServerSetting>,
  options: {
    expandVars: (value: string) => string;
    ensureWatchForTransportAcp?: boolean;
  }
): AgentConfig[];

export declare function mergeScopedExternalSettings(entries: ScopedExternalSettingsEntry[]): {
  servers: Record<string, AgentServerSetting>;
  includeBuiltins?: boolean;
  sourcePath?: string;
};

export declare function resolveEffectiveAgents(options: {
  includeBuiltins?: boolean;
  builtins: AgentConfig[];
  customAgents: AgentConfig[];
  ensureWatchForTransportAcpCustom?: boolean;
}): Array<AgentConfig & { source: "builtin" | "custom" }>;

export declare function mapToolStatus(
  status: unknown
): "running" | "completed" | "failed";

export type AttachmentLike = {
  type: "file" | "image" | "code";
  name: string;
  content: string;
  path?: string;
  language?: string;
  lineRange?: [number, number];
  mimeType?: string;
};

export declare function toDisplayText(
  text: string,
  attachments?: AttachmentLike[]
): string;

export declare function toContentBlocks(
  text: string,
  attachments?: AttachmentLike[]
): Array<
  | {
      type: "text";
      text: string;
    }
  | {
      type: "image";
      data: string;
      mimeType: string;
    }
>;

export declare function mapSessionUpdateToUiEvents(
  update: unknown
): Array<Record<string, unknown>>;
