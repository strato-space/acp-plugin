import test from "node:test";
import assert from "node:assert/strict";
import {
  getAcpHostBridge,
  getAcpHostState,
  getAcpRouteAdapter,
  resetAcpHostBridge,
  sendAcpHostMessage,
  setAcpHostBridge,
  setAcpHostState,
  type AcpHostBridge,
} from "./hostBridge";

test.afterEach(() => {
  resetAcpHostBridge();
});

test("normalizes legacy VS Code API shape into transport and persistence ports", () => {
  let sent: unknown = null;
  let persisted: unknown = { schemaVersion: 8 };

  setAcpHostBridge({
    postMessage(message: unknown) {
      sent = message;
    },
    getState<T>() {
      return persisted as T;
    },
    setState<T>(state: T) {
      persisted = state;
      return state;
    },
  });

  sendAcpHostMessage({ type: "connect" });
  assert.deepEqual(sent, { type: "connect" });

  assert.deepEqual(getAcpHostState<{ schemaVersion: number }>(), {
    schemaVersion: 8,
  });

  const nextState = setAcpHostState({ schemaVersion: 9 });
  assert.deepEqual(nextState, { schemaVersion: 9 });
  assert.deepEqual(persisted, { schemaVersion: 9 });
  assert.equal(getAcpRouteAdapter(), undefined);
});

test("preserves explicit aggregate host ports, including optional route adapter", () => {
  let sent: unknown = null;
  let routeSessionId: string | null = null;

  const bridge: AcpHostBridge = {
    transport: {
      send(message: unknown) {
        sent = message;
      },
    },
    persistence: {
      getState<T>() {
        return { schemaVersion: 10 } as T;
      },
      setState<T>(state: T) {
        return state;
      },
    },
    route: {
      getCurrentSessionId() {
        return routeSessionId;
      },
      setCurrentSessionId(sessionId: string | null) {
        routeSessionId = sessionId;
      },
    },
  };

  setAcpHostBridge(bridge);
  sendAcpHostMessage({ type: "sendMessage", text: "ping" });
  assert.deepEqual(sent, { type: "sendMessage", text: "ping" });

  const route = getAcpRouteAdapter();
  assert.ok(route);
  route?.setCurrentSessionId?.("session-1");
  assert.equal(route?.getCurrentSessionId?.(), "session-1");

  const resolved = getAcpHostBridge();
  assert.equal(resolved.route?.getCurrentSessionId?.(), "session-1");
});
