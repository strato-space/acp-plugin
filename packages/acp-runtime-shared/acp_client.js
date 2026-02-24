const { spawn: nodeSpawn } = require("child_process");
const { Readable, Writable } = require("stream");
const {
  ClientSideConnection,
  ndJsonStream,
} = require("@agentclientprotocol/sdk");

class ACPClientCore {
  constructor(options) {
    this.process = null;
    this.processId = 0;
    this.connection = null;
    this.state = "disconnected";
    this.currentSessionId = null;
    this.sessionMetadata = null;
    this.pendingCommands = null;
    this.stateChangeListeners = new Set();
    this.sessionUpdateListeners = new Set();
    this.stderrListeners = new Set();
    this.permissionRequestHandler = null;

    this.getDefaultAgent = options.getDefaultAgent;
    this.isAgentAvailable = options.isAgentAvailable;
    this.agentConfig = options.agentConfig ?? this.getDefaultAgent();
    this.spawnFn = options.spawn ?? nodeSpawn;
    this.skipAvailabilityCheck = options.skipAvailabilityCheck ?? false;
    this.defaultWorkingDirectory = options.defaultWorkingDirectory;
    this.onTraffic = options.onTraffic;
    this.connectTimeoutMs = options.connectTimeoutMs ?? 600_000;
  }

  setDefaultWorkingDirectory(cwd) {
    this.defaultWorkingDirectory = cwd;
  }

  setConnectTimeoutMs(timeoutMs) {
    this.connectTimeoutMs = timeoutMs;
  }

  setAgent(config) {
    if (this.state !== "disconnected") {
      this.dispose();
    }
    this.agentConfig = config;
  }

  getAgentId() {
    return this.agentConfig.id;
  }

  setOnStateChange(callback) {
    this.stateChangeListeners.add(callback);
    return () => this.stateChangeListeners.delete(callback);
  }

  setOnSessionUpdate(callback) {
    this.sessionUpdateListeners.add(callback);
    return () => this.sessionUpdateListeners.delete(callback);
  }

  setOnStderr(callback) {
    this.stderrListeners.add(callback);
    return () => this.stderrListeners.delete(callback);
  }

  setOnPermissionRequest(callback) {
    this.permissionRequestHandler = callback;
    return () => {
      this.permissionRequestHandler = null;
    };
  }

  isConnected() {
    return this.state === "connected" && this.connection !== null;
  }

  getState() {
    return this.state;
  }

  getAgentConfig() {
    return this.agentConfig;
  }

  async connect() {
    if (this.state === "connected") {
      throw new Error("Already connected");
    }
    if (this.state === "connecting") {
      throw new Error("Already connecting");
    }

    if (!this.skipAvailabilityCheck && !this.isAgentAvailable(this.agentConfig.id)) {
      throw new Error(
        `Agent "${this.agentConfig.name}" is not installed. ` +
          `Please install "${this.agentConfig.command}" and try again.`
      );
    }

    this.setState("connecting");

    let processExited = false;
    let exitCode = null;
    let stderrOutput = "";
    let exitError = null;

    const currentProcessId = ++this.processId;

    try {
      this.process = this.spawnFn(this.agentConfig.command, this.agentConfig.args, {
        stdio: ["pipe", "pipe", "pipe"],
        cwd: this.agentConfig.cwd ?? this.defaultWorkingDirectory,
        env: { ...process.env, ...(this.agentConfig.env ?? {}) },
      });

      const exitOrErrorPromise = new Promise((_resolve, reject) => {
        const makeErr = (prefix) => {
          const stderrInfo = stderrOutput.trim()
            ? `\n\nstderr:\n${stderrOutput.trim().slice(-8000)}`
            : "";
          return new Error(`${prefix} (code: ${exitCode ?? "unknown"}).` + stderrInfo);
        };

        this.process?.once("error", (error) => {
          if (currentProcessId !== this.processId) return;
          exitError = error instanceof Error ? error : new Error(String(error));
          processExited = true;
          reject(
            makeErr(
              `Agent process failed to start: ${exitError.message || exitError}`
            )
          );
        });

        this.process?.once("exit", (code) => {
          if (currentProcessId !== this.processId) return;
          exitCode = code;
          processExited = true;
          reject(makeErr("Agent process exited before ACP initialized"));
        });
      });

      this.process.stderr?.on("data", (data) => {
        const text = data.toString();
        stderrOutput += text;
        console.error("[ACP stderr]", text);
        this.stderrListeners.forEach((cb) => cb(text));
      });

      this.process.on("error", (error) => {
        if (currentProcessId !== this.processId) {
          console.log("[ACP] Ignoring error from old process");
          return;
        }
        console.error("[ACP] Process error:", error);
        processExited = true;
        this.setState("error");
      });

      this.process.on("exit", (code) => {
        if (currentProcessId !== this.processId) {
          console.log("[ACP] Ignoring exit from old process");
          return;
        }
        console.log("[ACP] Process exited with code:", code);
        processExited = true;
        exitCode = code;
        this.setState("disconnected");
        this.connection = null;
        this.process = null;
      });

      await new Promise((resolve) => setTimeout(resolve, 50));
      if (processExited || !this.process) {
        const stderrInfo = stderrOutput.trim()
          ? `\n\nError output:\n${stderrOutput.trim()}`
          : "";
        throw new Error(
          `Agent process exited immediately (code: ${exitCode}). ` +
            `Make sure "${this.agentConfig.command}" is properly installed.${stderrInfo}`
        );
      }

      if (!this.process.stdin || !this.process.stdout) {
        throw new Error(
          "Agent process started but stdin/stdout not available. " +
            "There may be an issue with the agent configuration."
        );
      }

      const baseStream = ndJsonStream(
        Writable.toWeb(this.process.stdin),
        Readable.toWeb(this.process.stdout)
      );

      const onTraffic = this.onTraffic;
      const stream = onTraffic
        ? {
            readable: new ReadableStream({
              async start(controller) {
                const reader = baseStream.readable.getReader();
                try {
                  while (true) {
                    const { value, done } = await reader.read();
                    if (done) break;
                    if (value === undefined) continue;
                    try {
                      onTraffic("recv", value);
                    } catch {
                      // Logging must never break the connection.
                    }
                    controller.enqueue(value);
                  }
                } finally {
                  reader.releaseLock();
                  controller.close();
                }
              },
            }),
            writable: new WritableStream({
              async write(message) {
                try {
                  onTraffic("send", message);
                } catch {
                  // Logging must never break the connection.
                }
                const writer = baseStream.writable.getWriter();
                try {
                  await writer.write(message);
                } finally {
                  writer.releaseLock();
                }
              },
            }),
          }
        : baseStream;

      const client = {
        requestPermission: async (params) => {
          console.log("[ACP] Permission request:", JSON.stringify(params, null, 2));

          if (this.permissionRequestHandler) {
            return this.permissionRequestHandler(params);
          }

          const allowOption = params.options.find(
            (opt) => opt.kind === "allow_once" || opt.kind === "allow_always"
          );
          if (allowOption) {
            console.log("[ACP] Auto-approving with option:", allowOption.optionId);
            return {
              outcome: { outcome: "selected", optionId: allowOption.optionId },
            };
          }
          console.log("[ACP] No allow option found, cancelling");
          return { outcome: { outcome: "cancelled" } };
        },
        sessionUpdate: async (params) => {
          const updateType = params.update?.sessionUpdate ?? "unknown";
          console.log(`[ACP] Session update: ${updateType}`);
          if (updateType === "agent_message_chunk") {
            console.log("[ACP] CHUNK:", JSON.stringify(params.update));
          }
          if (updateType === "available_commands_update") {
            const update = params.update;
            if (this.sessionMetadata) {
              this.sessionMetadata.commands = update.availableCommands;
              this.sessionMetadata.commands = update.availableCommands;
            } else {
              this.pendingCommands = update.availableCommands;
            }
            console.log("[ACP] Commands updated:", update.availableCommands.length);
          }
          try {
            this.sessionUpdateListeners.forEach((cb) => cb(params));
          } catch (error) {
            console.error("[ACP] Error in session update listener:", error);
          }
        },
      };

      this.connection = new ClientSideConnection(() => client, stream);

      const initPromise = this.connection.initialize({
        protocolVersion: 1,
        clientCapabilities: {},
        clientInfo: {
          name: "acp",
          version: "0.0.1",
        },
      });

      const timeoutPromise = new Promise((_resolve, reject) => {
        const t = setTimeout(() => {
          const stderrInfo = stderrOutput.trim()
            ? `\n\nstderr:\n${stderrOutput.trim().slice(-8000)}`
            : "";
          reject(
            new Error(
              `ACP initialize() timed out after ${this.connectTimeoutMs}ms.` + stderrInfo
            )
          );
        }, this.connectTimeoutMs);
        t.unref?.();
      });

      const initResponse = await Promise.race([
        initPromise,
        exitOrErrorPromise,
        timeoutPromise,
      ]);

      if (processExited) {
        throw new Error(
          `Agent process exited during initialization (code: ${exitCode}). ` +
            "The agent may have encountered an error."
        );
      }

      this.setState("connected");
      return initResponse;
    } catch (error) {
      this.setState("error");
      if (this.process && !processExited) {
        this.process.kill();
        this.process = null;
      }
      this.connection = null;
      throw error;
    }
  }

  async newSession(workingDirectory) {
    if (!this.connection) {
      throw new Error("Not connected");
    }

    const response = await this.connection.newSession({
      cwd: workingDirectory,
      mcpServers: [],
    });

    this.currentSessionId = response.sessionId;
    this.sessionMetadata = {
      modes: response.modes ?? null,
      models: response.models ?? null,
      commands: this.pendingCommands,
    };
    this.pendingCommands = null;

    return response;
  }

  getSessionMetadata() {
    return this.sessionMetadata;
  }

  async setMode(modeId) {
    if (!this.connection || !this.currentSessionId) {
      throw new Error("No active session");
    }

    await this.connection.setSessionMode({
      sessionId: this.currentSessionId,
      modeId,
    });

    if (this.sessionMetadata?.modes) {
      this.sessionMetadata.modes.currentModeId = modeId;
    }
  }

  async setModel(modelId) {
    if (!this.connection || !this.currentSessionId) {
      throw new Error("No active session");
    }

    await this.connection.unstable_setSessionModel({
      sessionId: this.currentSessionId,
      modelId,
    });

    if (this.sessionMetadata?.models) {
      this.sessionMetadata.models.currentModelId = modelId;
    }
  }

  async sendMessage(content) {
    if (!this.connection || !this.currentSessionId) {
      throw new Error("No active session");
    }

    const prompt = typeof content === "string" ? [{ type: "text", text: content }] : content;

    try {
      const response = await this.connection.prompt({
        sessionId: this.currentSessionId,
        prompt,
      });
      console.log("[ACP] Prompt completed:", JSON.stringify(response, null, 2));
      return response;
    } catch (error) {
      console.error("[ACP] Prompt error:", error);
      if (error instanceof Error) {
        console.error("[ACP] Error details:", error.message, error.stack);
      }
      console.error("[ACP] Raw error:", JSON.stringify(error, null, 2));
      throw error;
    }
  }

  async cancel() {
    if (!this.connection || !this.currentSessionId) {
      return;
    }

    await this.connection.cancel({
      sessionId: this.currentSessionId,
    });
  }

  dispose() {
    this.processId++;
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
    this.connection = null;
    this.currentSessionId = null;
    this.sessionMetadata = null;
    this.pendingCommands = null;
    this.setState("disconnected");
  }

  setState(state) {
    if (this.state !== state) {
      this.state = state;
      this.stateChangeListeners.forEach((cb) => cb(state));
    }
  }
}

module.exports = {
  ACPClientCore,
};
