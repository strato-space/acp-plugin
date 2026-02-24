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
