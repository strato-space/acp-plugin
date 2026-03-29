#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PKG_DIR="$ROOT_DIR/packages/acp-ui"

cd "$PKG_DIR"

# Build through prepack so the tarball always reflects the current package artifact.
TARBALL="$(npm pack | tail -n 1)"
TMPDIR="$(mktemp -d)"
cleanup() {
  rm -rf "$TMPDIR"
  rm -f "$PKG_DIR/$TARBALL"
}
trap cleanup EXIT

cat >"$TMPDIR/package.json" <<EOF
{
  "name": "acp-ui-vite-smoke",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "vite build"
  },
  "dependencies": {
    "react": "^19.1.1",
    "react-dom": "^19.1.1",
    "@strato-space/acp-ui": "file:$PKG_DIR/$TARBALL"
  },
  "devDependencies": {
    "typescript": "^5.8.3",
    "vite": "^6.4.1"
  }
}
EOF

cat >"$TMPDIR/index.html" <<'EOF'
<!doctype html>
<html>
  <body>
    <div id="root"></div>
    <script type="module" src="/main.tsx"></script>
  </body>
</html>
EOF

cat >"$TMPDIR/main.tsx" <<'EOF'
import React from "react";
import ReactDOM from "react-dom/client";
import {
  AcpUiApp,
  createAcpUiHarnessBridge,
  setAcpHostBridge,
} from "@strato-space/acp-ui";
import "@strato-space/acp-ui/styles.css";

setAcpHostBridge(createAcpUiHarnessBridge());
ReactDOM.createRoot(document.getElementById("root")!).render(
  React.createElement(AcpUiApp)
);
EOF

cd "$TMPDIR"
npm install --no-audit --no-fund
npm run build

echo "ACP UI clean consumer smoke passed in $TMPDIR"
