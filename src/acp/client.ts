import {
  ACPClientCore,
  type ACPClientCoreOptions,
  type ACPConnectionState,
  type SessionMetadata,
  type SpawnFunction,
} from "@strato-space/acp-runtime-shared/acp_client";
import { type AgentConfig, getDefaultAgent, isAgentAvailable } from "./agents";

export type { SessionMetadata, ACPConnectionState, SpawnFunction };

export interface ACPClientOptions {
  agentConfig?: AgentConfig;
  spawn?: SpawnFunction;
  skipAvailabilityCheck?: boolean;
  /**
   * Default working directory used when the selected agent does not provide `cwd`.
   * The extension host computes/expands this from VS Code settings.
   */
  defaultWorkingDirectory?: string;
  /**
   * Optional hook for logging raw ACP JSON-RPC messages.
   */
  onTraffic?: (direction: "send" | "recv", message: unknown) => void;
  /**
   * Max time to wait for ACP initialize() to complete.
   * If exceeded, the agent process is killed and connect() rejects.
   */
  connectTimeoutMs?: number;
}

export class ACPClient extends ACPClientCore<AgentConfig> {
  constructor(options?: ACPClientOptions | AgentConfig) {
    if (options && "id" in options) {
      const coreOptions: ACPClientCoreOptions<AgentConfig> = {
        agentConfig: options,
        getDefaultAgent,
        isAgentAvailable,
      };
      super(coreOptions);
      return;
    }

    const coreOptions: ACPClientCoreOptions<AgentConfig> = {
      ...(options ?? {}),
      getDefaultAgent,
      isAgentAvailable,
    };
    super(coreOptions);
  }
}
