import type { VsCodeApi } from "./vscode";

export interface TransportAdapter {
  send(message: unknown): void;
}

export interface HostPersistenceAdapter {
  getState<T>(): T | undefined;
  setState<T>(state: T): T;
}

export interface RouteAdapter {
  getCurrentSessionId?(): string | null;
  setCurrentSessionId?(sessionId: string | null): void;
}

export interface AcpHostBridge {
  transport: TransportAdapter;
  persistence: HostPersistenceAdapter;
  route?: RouteAdapter;
}

type HostBridgeInput = AcpHostBridge | VsCodeApi;

let hostBridge: AcpHostBridge | null = null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object";
}

function isLegacyVsCodeApi(bridge: HostBridgeInput): bridge is VsCodeApi {
  return (
    isRecord(bridge) &&
    typeof bridge.postMessage === "function" &&
    typeof bridge.getState === "function" &&
    typeof bridge.setState === "function"
  );
}

function normalizeHostBridge(bridge: HostBridgeInput): AcpHostBridge {
  if (isLegacyVsCodeApi(bridge)) {
    return {
      transport: {
        send: (message: unknown) => bridge.postMessage(message),
      },
      persistence: {
        getState: <T,>() => bridge.getState<T>(),
        setState: <T,>(state: T) => bridge.setState<T>(state),
      },
    };
  }
  return bridge;
}

function createMockBridge(): AcpHostBridge {
  return {
    transport: {
      send: (message: unknown) => {
        console.warn("[ACP UI] mock host bridge transport.send", message);
      },
    },
    persistence: {
      getState: <T,>() => undefined as T | undefined,
      setState: <T,>(state: T) => state,
    },
  };
}

export function setAcpHostBridge(bridge: HostBridgeInput): void {
  hostBridge = normalizeHostBridge(bridge);
}

export function resetAcpHostBridge(): void {
  hostBridge = null;
}

export function getAcpHostBridge(): AcpHostBridge {
  if (hostBridge) return hostBridge;

  if (typeof acquireVsCodeApi === "function") {
    hostBridge = normalizeHostBridge(acquireVsCodeApi());
    return hostBridge;
  }

  hostBridge = createMockBridge();
  return hostBridge;
}

export function sendAcpHostMessage(message: unknown): void {
  getAcpHostBridge().transport.send(message);
}

export function getAcpHostState<T>(): T | undefined {
  return getAcpHostBridge().persistence.getState<T>();
}

export function setAcpHostState<T>(state: T): T {
  return getAcpHostBridge().persistence.setState<T>(state);
}

export function getAcpRouteAdapter(): RouteAdapter | undefined {
  return getAcpHostBridge().route;
}

export function dispatchAcpHostMessage(data: unknown): void {
  window.dispatchEvent(new MessageEvent("message", { data }));
}
