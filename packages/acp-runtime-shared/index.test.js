const test = require("node:test");
const assert = require("node:assert/strict");

const {
  getAgentServers,
  mapSessionUpdateToUiEvents,
  mergeScopedExternalSettings,
  parseJsonc,
  resolveEffectiveAgents,
  toContentBlocks,
  toDisplayText,
  toAgentConfigsFromServers,
} = require("./index.js");

test("parseJsonc supports comments and trailing commas", () => {
  const parsed = parseJsonc(`{\n  // comment\n  "agent_servers": {\n    "x": { "command": "npx", },\n  },\n}`);
  assert.equal(typeof parsed, "object");
  assert.equal(parsed.agent_servers.x.command, "npx");
});

test("getAgentServers merges acp.agents then agent_servers with root key precedence", () => {
  const parsed = {
    "acp.agents": {
      one: { command: "cmd-one", args: ["a"] },
      override: { command: "old" },
    },
    agent_servers: {
      two: { command: "cmd-two", args: ["b"] },
      override: { command: "new" },
    },
  };

  const servers = getAgentServers(parsed);
  assert.deepEqual(Object.keys(servers).sort(), ["one", "override", "two"]);
  assert.equal(servers.override.command, "new");
});

test("mergeScopedExternalSettings gives workspace precedence over global", () => {
  const merged = mergeScopedExternalSettings([
    {
      scope: "global",
      servers: { a: { command: "ga" }, same: { command: "global" } },
      includeBuiltins: false,
      sourcePath: "/g/settings.json",
    },
    {
      scope: "workspace",
      servers: { b: { command: "wb" }, same: { command: "workspace" } },
      includeBuiltins: true,
      sourcePath: "/w/settings.json",
    },
  ]);

  assert.equal(merged.servers.same.command, "workspace");
  assert.equal(merged.servers.a.command, "ga");
  assert.equal(merged.servers.b.command, "wb");
  assert.equal(merged.includeBuiltins, true);
  assert.equal(merged.sourcePath, "/g/settings.json, /w/settings.json");
});

test("toAgentConfigsFromServers can append --watch for ACP transport", () => {
  const agents = toAgentConfigsFromServers(
    {
      x: { command: "uvx", args: ["fast-agent-acp", "--transport", "acp"] },
      y: { command: "uvx", args: ["fast-agent-acp", "--transport=mcp"] },
    },
    {
      expandVars: (v) => v,
      ensureWatchForTransportAcp: true,
    }
  );

  const x = agents.find((a) => a.id === "x");
  const y = agents.find((a) => a.id === "y");
  assert.ok(x.args.includes("--watch"));
  assert.ok(!y.args.includes("--watch"));
});

test("resolveEffectiveAgents merges builtins and custom with ID override", () => {
  const effective = resolveEffectiveAgents({
    includeBuiltins: true,
    builtins: [
      { id: "a", name: "A", command: "npx", args: ["a"] },
      { id: "b", name: "B", command: "npx", args: ["b"] },
    ],
    customAgents: [{ id: "b", name: "B2", command: "uvx", args: ["b2"] }],
  });

  assert.equal(effective.length, 2);
  const b = effective.find((a) => a.id === "b");
  assert.equal(b.name, "B2");
  assert.equal(b.source, "custom");
});

test("toDisplayText and toContentBlocks preserve attachment semantics", () => {
  const attachments = [
    { type: "image", name: "i.png", content: "data:image/png;base64,AAAA" },
    {
      type: "code",
      name: "code.ts",
      path: "src/code.ts",
      content: "console.log('x')",
      language: "ts",
      lineRange: [1, 1],
    },
  ];
  const display = toDisplayText("hello", attachments);
  assert.ok(display.includes("[Image: i.png]"));
  assert.ok(display.includes("// File: src/code.ts"));
  assert.ok(display.includes("hello"));

  const blocks = toContentBlocks("hello", attachments);
  assert.equal(blocks.length, 3);
  assert.equal(blocks[0].type, "image");
  assert.equal(blocks[0].data, "AAAA");
  assert.equal(blocks[1].type, "text");
  assert.equal(blocks[2].type, "text");
});

test("mapSessionUpdateToUiEvents maps ACP updates to UI events", () => {
  const toolCall = mapSessionUpdateToUiEvents({
    sessionUpdate: "tool_call",
    title: "Search",
    toolCallId: "t1",
    kind: "search",
    _meta: { x: 1 },
  });
  assert.equal(toolCall.length, 1);
  assert.equal(toolCall[0].type, "toolCallStart");

  const toolUpdate = mapSessionUpdateToUiEvents({
    sessionUpdate: "tool_call_update",
    toolCallId: "t1",
    status: "done",
  });
  assert.equal(toolUpdate[0].type, "toolCallComplete");
  assert.equal(toolUpdate[0].status, "completed");

  const chunk = mapSessionUpdateToUiEvents({
    sessionUpdate: "agent_message_chunk",
    content: { type: "text", text: "abc" },
  });
  assert.deepEqual(chunk, [{ type: "streamChunk", text: "abc" }]);
});
