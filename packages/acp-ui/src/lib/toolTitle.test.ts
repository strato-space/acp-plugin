import test from "node:test";
import assert from "node:assert/strict";
import { buildToolDisplayName, normalizeBaseToolName } from "./toolTitle";

test("normalizeBaseToolName strips dynamic suffixes", () => {
  assert.equal(normalizeBaseToolName("execute: ls -la"), "execute");
  assert.equal(normalizeBaseToolName("search(query)"), "search");
});

test("buildToolDisplayName enriches generic execute with command details", () => {
  const title = buildToolDisplayName("execute", {
    command: "bash",
    args: ["-lc", "cat README.md"],
  });
  assert.equal(title, "execute · bash -lc cat README.md");
});

test("buildToolDisplayName can extract hint from wrapped payload", () => {
  const title = buildToolDisplayName("execute", {
    rawInput: { command: "ls", args: ["-la"] },
    meta: { source: "fallback" },
  });
  assert.equal(title, "execute · ls -la");
});

test("buildToolDisplayName enriches search with query details", () => {
  const title = buildToolDisplayName(
    "execute",
    {
      query: "how to parse jsonc",
    },
    "search"
  );
  assert.equal(title, "execute · how to parse jsonc");
});

test("buildToolDisplayName keeps explicit descriptive names", () => {
  const title = buildToolDisplayName("Searching docs", { query: "foo" });
  assert.equal(title, "Searching docs · foo");
});
