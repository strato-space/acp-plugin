# @strato-space/acp-ui

Shared ACP UI kernel for ACP hosts.

Current intended consumers:

- ACP Plugin webview
- browser `acp-chat`
- `copilot /agents`

## Public Contract

The package owns:

- ACP chat/session React UI
- shared ACP UI state contract
- host-port interfaces:
  - `TransportAdapter`
  - `HostPersistenceAdapter`
  - `RouteAdapter`
- shared helper exports for ACP host integration
- shared stylesheet export

The package does not own:

- host runtime discovery
- websocket/Socket.IO policy
- VS Code extension-host policy
- MCP transport
- PM2/runtime deployment topology

## Exports

```ts
import { AcpUiApp, setAcpHostBridge } from "@strato-space/acp-ui";
import "@strato-space/acp-ui/styles.css";
```

## Host Bridge Shape

```ts
type AcpHostBridge = {
  transport: {
    send(message: unknown): void;
  };
  persistence: {
    getState<T>(): T | undefined;
    setState<T>(state: T): T;
  };
  route?: {
    getCurrentSessionId?(): string | null;
    setCurrentSessionId?(sessionId: string | null): void;
  };
};
```

Unsupported host ports should be absent, not supplied as noop placeholders.

## Harness Utilities

The package also exports deterministic harness helpers for browser verification and host-shell integration work:

```ts
import {
  createAcpUiHarnessBridge,
  seedAcpUiHarnessState,
} from "@strato-space/acp-ui";
```

Current checked-in consumers:

- `acp-chat` can switch to harness mode with `?harness=1`
- `copilot` exposes a hidden harness route at `/__harness/agents`

These harness surfaces exist to verify the ACP UI kernel without depending on a live ACP runtime.

## Internal Prerelease Consumption

The current cross-repo prerelease lane uses explicit local package consumption, for example:

```json
{
  "dependencies": {
    "@strato-space/acp-ui": "file:../../../tools/acp/strato-space/acp-plugin/packages/acp-ui"
  }
}
```

This lane is for build/test/integration before registry publish. It does not replace the external publish lane.

## GitHub Packages Publish Lane

External publish is done through GitHub Packages:

- workflow: `.github/workflows/publish-acp-ui-package.yml`
- registry: `https://npm.pkg.github.com`
- package scope: `@strato-space`

Local auth/bootstrap example:

```bash
cp packages/acp-ui/.npmrc.github-packages.example packages/acp-ui/.npmrc
export GITHUB_TOKEN=<token-with-packages-write>
```

Local packaging checks:

```bash
npm --prefix packages/acp-ui run build
npm run pack:acp-ui
npm run publish:acp-ui:dry-run
npm run smoke:acp-ui:consumer
```

Notes:

- `prepack` builds the package artifact automatically before `npm pack` and `npm publish`.
- `npm run smoke:acp-ui:consumer` proves the packed tarball installs and builds in a clean browser consumer environment.
- The real registry publish remains an operator/release action and is not replaced by the dry-run lane.
