import React from "react";
import ReactDOM from "react-dom/client";
import { AcpUiApp } from "@strato-space/acp-ui";
import "@strato-space/acp-ui/styles.css";

document.documentElement.style.height = "100%";
document.body.style.height = "100%";
document.body.style.margin = "0";

const root = document.getElementById("root");
if (root) {
  root.style.height = "100%";
}

ReactDOM.createRoot(root!).render(
  <React.StrictMode>
    <AcpUiApp />
  </React.StrictMode>
);
