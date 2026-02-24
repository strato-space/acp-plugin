import type { ChildProcess, SpawnOptions } from "child_process";
import type {
  AvailableCommand,
  ContentBlock,
  InitializeResponse,
  NewSessionResponse,
  PromptResponse,
  RequestPermissionRequest,
  RequestPermissionResponse,
  SessionModelState,
  SessionModeState,
  SessionNotification,
} from "@agentclientprotocol/sdk";

export type AgentConfigLike = {
  id: string;
  name: string;
  command: string;
  args: string[];
  cwd?: string;
  env?: Record<string, string>;
};

export interface SessionMetadata {
  modes: SessionModeState | null;
  models: SessionModelState | null;
  commands: AvailableCommand[] | null;
}

export type ACPConnectionState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error";

export type SpawnFunction = (
  command: string,
  args: string[],
  options: SpawnOptions
) => ChildProcess;

export interface ACPClientCoreOptions<TAgent extends AgentConfigLike> {
  getDefaultAgent: () => TAgent;
  isAgentAvailable: (agentId: string) => boolean;
  agentConfig?: TAgent;
  spawn?: SpawnFunction;
  skipAvailabilityCheck?: boolean;
  defaultWorkingDirectory?: string;
  onTraffic?: (direction: "send" | "recv", message: unknown) => void;
  connectTimeoutMs?: number;
}

export declare class ACPClientCore<TAgent extends AgentConfigLike> {
  constructor(options: ACPClientCoreOptions<TAgent>);

  setDefaultWorkingDirectory(cwd: string | undefined): void;
  setConnectTimeoutMs(timeoutMs: number): void;
  setAgent(config: TAgent): void;
  getAgentId(): string;

  setOnStateChange(callback: (state: ACPConnectionState) => void): () => void;
  setOnSessionUpdate(callback: (update: SessionNotification) => void): () => void;
  setOnStderr(callback: (data: string) => void): () => void;
  setOnPermissionRequest(
    callback: (
      params: RequestPermissionRequest
    ) => Promise<RequestPermissionResponse>
  ): () => void;

  isConnected(): boolean;
  getState(): ACPConnectionState;
  getAgentConfig(): TAgent;

  connect(): Promise<InitializeResponse>;
  newSession(workingDirectory: string): Promise<NewSessionResponse>;
  getSessionMetadata(): SessionMetadata | null;
  setMode(modeId: string): Promise<void>;
  setModel(modelId: string): Promise<void>;
  sendMessage(content: string | ContentBlock[]): Promise<PromptResponse>;
  cancel(): Promise<void>;
  dispose(): void;
}
