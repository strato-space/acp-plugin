# Mode B Smoke (MCP Chrome) — agents-dev

This is a text-only smoke runbook intended to be executed by an LLM using the Chrome DevTools MCP tools.

Target URL (token is required):

```text
https://agents-dev.stratospace.fun/?token=<ACP_CHAT_AUTH_TOKEN>
```

## Preconditions

1. `acp-chat` is running and reachable behind nginx at `https://agents-dev.stratospace.fun`.
2. You have a valid `ACP_CHAT_AUTH_TOKEN`.
3. Chrome is available via CDP (remote debugging) and connected to the MCP server.

## Steps

1. Open the target URL with the token query parameter.
2. Take a full-page screenshot of the initial state.
3. Collect Console logs and verify there are no uncaught exceptions.
4. Confirm the header renders `ACP v<version>` (example: `ACP v0.1.21`).
5. Confirm the composer exists and the `Message input` textbox is present.
6. Open `Settings` and verify the status reaches `Connected`.
7. Send `ping` and verify the assistant responds with `pong`.
8. Take a full-page screenshot after `pong`.
9. Export artifacts from this run: screenshots (before + after) and Console logs (Console messages list).

Tip: MCP tool calls commonly used for this runbook include:

- `mcp__chrome-devtools__new_page` / `mcp__chrome-devtools__navigate_page`
- `mcp__chrome-devtools__take_screenshot` (use `fullPage: true`)
- `mcp__chrome-devtools__list_console_messages`
- `mcp__chrome-devtools__take_snapshot` (to discover element `uid`s for input/setting clicks)

## Expected Results

1. No `pageerror` / uncaught exceptions in the Console.
2. The UI renders the ACP header and composer.
3. Connection state reaches `Connected`.
4. `ping` produces `pong` and ends with a `Done` status on the run frame.

## Notes

- If the token is missing/invalid, the WebSocket `/ws` connection will close and the UI will show a connection error banner.
- The UI emits debug logs (e.g. `[DEBUG] Message #...`) which are useful for regression triage; include them in the report.
