#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PKG_DIR="$ROOT_DIR/packages/acp-ui"
TMPDIR="$(mktemp -d)"
PKG_COPY_DIR="$TMPDIR/acp-ui-source"
CONSUMER_DIR="$TMPDIR/consumer"

cleanup() {
  rm -rf "$TMPDIR"
}
trap cleanup EXIT

mkdir -p "$PKG_COPY_DIR" "$CONSUMER_DIR"
rsync -a \
  --exclude dist \
  --exclude node_modules \
  --exclude package-lock.json \
  "$PKG_DIR/" "$PKG_COPY_DIR/"
ln -s "$ROOT_DIR/node_modules" "$PKG_COPY_DIR/node_modules"

cat >"$CONSUMER_DIR/package.json" <<EOF
{
  "name": "acp-ui-file-consumer-smoke",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "vite build",
    "check-types": "tsc --noEmit"
  },
  "dependencies": {
    "react": "^19.1.1",
    "react-dom": "^19.1.1",
    "@strato-space/acp-ui": "file:$PKG_COPY_DIR"
  },
  "devDependencies": {
    "@types/react": "^19.1.8",
    "@types/react-dom": "^19.1.6",
    "typescript": "^5.8.3",
    "vite": "^6.4.1"
  }
}
EOF

cat >"$CONSUMER_DIR/tsconfig.json" <<'EOF'
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "skipLibCheck": false,
    "esModuleInterop": true,
    "resolveJsonModule": true
  },
  "include": ["main.tsx"]
}
EOF

cat >"$CONSUMER_DIR/index.html" <<'EOF'
<!doctype html>
<html>
  <body>
    <div id="root"></div>
    <script type="module" src="/main.tsx"></script>
  </body>
</html>
EOF

cat >"$CONSUMER_DIR/main.tsx" <<'EOF'
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

cd "$CONSUMER_DIR"
npm install --no-audit --no-fund
npm run check-types
npm run build

if [[ ! -d "$PKG_COPY_DIR/dist" ]]; then
  echo "ACP UI file-consumer smoke failed: dist was not materialized by local file install" >&2
  exit 1
fi

echo "ACP UI file consumer smoke passed in $CONSUMER_DIR"
