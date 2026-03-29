import React from "react";
import ReactDOM from "react-dom/client";
import {
  AcpUiApp,
  createAcpUiHarnessBridge,
  seedAcpUiHarnessState,
  type AcpHostBridge,
  dispatchAcpHostMessage,
  setAcpHostBridge,
} from "@strato-space/acp-ui";
import "@strato-space/acp-ui/styles.css";

function createBridge(): AcpHostBridge {
  const stateKey = "acp-chat.webviewState";
  const pending: string[] = [];
  let unloading = false;
  let reportedWsFailure = false;

  const token = (() => {
    try {
      const u = new URL(window.location.href);
      const t = u.searchParams.get("token");
      return t && t.trim() ? t.trim() : "";
    } catch {
      return "";
    }
  })();

  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  const wsUrl = `${proto}://${window.location.host}/ws${token ? `?token=${encodeURIComponent(token)}` : ""}`;
  const ws = new WebSocket(wsUrl);

  window.addEventListener("beforeunload", () => {
    unloading = true;
  });

  const reportWsFailure = (text: string) => {
    if (reportedWsFailure || unloading) return;
    reportedWsFailure = true;
    dispatchAcpHostMessage({ type: "connectionState", state: "error" });
    dispatchAcpHostMessage({ type: "connectAlert", text });
  };

  const flush = () => {
    while (pending.length > 0 && ws.readyState === WebSocket.OPEN) {
      const item = pending.shift();
      if (item) ws.send(item);
    }
  };

  ws.addEventListener("open", () => {
    flush();
  });

  ws.addEventListener("message", (evt) => {
    try {
      const data = JSON.parse(String(evt.data));
      dispatchAcpHostMessage(data);
    } catch {
      // ignore malformed payloads
    }
  });

  ws.addEventListener("error", () => {
    reportWsFailure("WebSocket error: failed to connect to ACP backend.");
  });

  ws.addEventListener("close", () => {
    reportWsFailure("WebSocket disconnected: ACP backend is unavailable.");
  });

  return {
    transport: {
      send(msg: unknown) {
        const payload = JSON.stringify(msg ?? null);
        if (ws.readyState === WebSocket.OPEN) ws.send(payload);
        else pending.push(payload);
      },
    },
    persistence: {
      getState: <T,>() => {
        try {
          const raw = localStorage.getItem(stateKey);
          return raw ? (JSON.parse(raw) as T) : undefined;
        } catch {
          return undefined;
        }
      },
      setState: <T,>(state: T) => {
        try {
          localStorage.setItem(stateKey, JSON.stringify(state));
        } catch {
          // ignore persistence failures
        }
        return state;
      },
    },
  };
}

document.documentElement.style.height = "100%";
document.body.style.height = "100%";
document.body.style.margin = "0";

const root = document.getElementById("root");
if (root) {
  root.style.height = "100%";
}

const useHarness = (() => {
  try {
    return new URL(window.location.href).searchParams.get("harness") === "1";
  } catch {
    return false;
  }
})();

if (useHarness) {
  setAcpHostBridge(createAcpUiHarnessBridge());
  seedAcpUiHarnessState({ sidebarOpen: false });
} else {
  setAcpHostBridge(createBridge());
}

ReactDOM.createRoot(root!).render(
  <React.StrictMode>
    <AcpUiApp />
  </React.StrictMode>
);
