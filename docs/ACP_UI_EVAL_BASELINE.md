# ACP UI Canonical Eval Baseline

This document defines the base guarantees for the shared ACP UI kernel and how they are verified across the three ACP hosts:

- VS Code extension
- browser `acp-chat`
- `copilot /agents`

## Scope

The goal is not to prove every host-specific feature in one suite. The goal is to keep one checked-in baseline for:

- shared-kernel guarantees
- host-specific guarantees
- cross-host conformance

## Shared-Kernel Guarantees

These checks validate package-level ACP UI behavior that must stay stable regardless of host:

- tool visibility window shows the latest five regular tools by default
- `Show more` / `Show less` state is explicit and testable
- tool display-name normalization stays deterministic
- ACP host bridge accepts the aggregate host-port contract
- legacy VS Code bridge shape is normalized into the aggregate host-port contract

Command:

```bash
npm run test:webview:unit
```

Current source tests:

- `packages/acp-ui/src/hostBridge.test.ts`
- `packages/acp-ui/src/components/tools/toolListVisibility.test.ts`
- `packages/acp-ui/src/lib/toolTitle.test.ts`

## Shared Runtime / Settings Guarantees

These checks validate shared ACP runtime utilities reused by the extension host and the Copilot ACP backend:

- `agent_servers` / `acp.agents` merge order
- workspace settings override global settings for scalar values
- built-in and custom agents are unioned with deterministic override semantics
- attachment/content block transforms remain stable
- ACP session-update mapping to UI events remains stable

Command:

```bash
npm run test:runtime:unit
```

Current source test:

- `packages/acp-runtime-shared/index.test.js`

## VS Code Host Guarantees

These checks validate the extension-host integration path:

- extension host compiles against the shared package
- webview bundle builds from package consumption
- extension host tests still pass

Commands:

```bash
npm run build:webview
npm test
```

Relevant sources:

- `src/views/webview/src/main.tsx`
- `src/test/*.test.ts`

## Browser Host Guarantees (`acp-chat`)

These checks validate the standalone browser ACP host:

- browser entrypoint consumes `@strato-space/acp-ui`
- websocket bridge remains host-local
- browser UI bundle builds from package consumption
- browser host can also run in deterministic harness mode via `?harness=1`

Command:

```bash
npm --prefix acp-chat run build:web
```

Relevant sources:

- `acp-chat/web/src/main.tsx`
- `acp-chat/server/*`
- harness trigger: `acp-chat` root URL with `?harness=1`

## Copilot Host Guarantees

These checks validate the third ACP consumer:

- `/agents` and `/agents/session/:id` mount the shared ACP UI package
- the Copilot host bridge supplies ACP transport/persistence/route ports
- the `/agents` surface stays ACP-only and does not fall back to MCP transport
- the app and backend both build against the shared package/runtime contracts
- browser acceptance uses the deterministic ACP harness route instead of the live runtime route
- mobile acceptance must prove no horizontal overflow at iPhone XR width
- harness browser checks must fail on page errors and relevant failed requests/responses

Commands from the `copilot` repo:

```bash
cd app && npm run build
cd backend && npm run build
cd app && npm run e2e:install
cd app && npm run preview -- --host 127.0.0.1 --port 4173
cd app && PLAYWRIGHT_BASE_URL=http://127.0.0.1:4173 npm run test:e2e:agents-harness
```

If port `4173` is already occupied, use the actual preview URL emitted by Vite and pass it via `PLAYWRIGHT_BASE_URL`.

Relevant sources:

- `app/src/pages/AgentsOpsPage.tsx`
- `app/src/pages/AgentsHarnessPage.tsx`
- `app/src/services/acpHostBridge.ts`
- `app/src/services/acpSocket.ts`
- `backend/src/api/socket/acp.ts`
- `backend/src/services/acp/*`
- `app/e2e/agents-harness.spec.ts`

## Cross-Host Conformance Matrix

The baseline is considered healthy only when all three host rows are green:

| Surface | Shared kernel | Host/runtime | Build/entry |
| --- | --- | --- | --- |
| VS Code extension | `npm run test:webview:unit` | `npm run test:runtime:unit` + `npm test` | `npm run build:webview` |
| browser `acp-chat` | `npm run test:webview:unit` | `npm run test:runtime:unit` | `npm --prefix acp-chat run build:web` |
| `copilot /agents` | package contract from `@strato-space/acp-ui` | package/runtime contract from `@strato-space/acp-runtime-shared` | `cd app && npm run build` + `cd backend && npm run build` + `PLAYWRIGHT_BASE_URL=... npm run test:e2e:agents-harness` |

## Canonical Quick Commands

From `acp-plugin` repo root:

```bash
npm run test:acp-ui:baseline
npm run verify:acp-ui:hosts
npm run smoke:acp-ui:consumer
```

From `copilot` repo:

```bash
cd app && npm run build
cd backend && npm run build
cd app && npm run e2e:install
cd app && npm run preview -- --host 127.0.0.1 --port 4173
cd app && PLAYWRIGHT_BASE_URL=http://127.0.0.1:4173 npm run test:e2e:agents-harness
```

## Release Gate

For ACP UI extraction/package work, the minimal release gate is:

1. `npm run test:acp-ui:baseline`
2. `npm run verify:acp-ui:hosts`
3. `npm run smoke:acp-ui:consumer`
4. `cd ../copilot/app && npm run build`
5. `cd ../copilot/backend && npm run build`
6. `cd ../copilot/app && npm run e2e:install`
7. `cd ../copilot/app && npm run preview -- --host 127.0.0.1 --port 4173`
8. `cd ../copilot/app && PLAYWRIGHT_BASE_URL=http://127.0.0.1:4173 npm run test:e2e:agents-harness`

If one row is red, the ACP UI package is not considered verified across consumers.
