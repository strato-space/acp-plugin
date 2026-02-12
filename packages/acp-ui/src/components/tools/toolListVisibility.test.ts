import test from "node:test";
import assert from "node:assert/strict";
import type { Tool } from "../../types";
import { bucketToolIds, getVisibleToolIds } from "./toolListVisibility";

function makeRegularTool(name: string): Tool {
  return {
    name,
    input: null,
    output: null,
    status: "completed",
  };
}

function makeTaskTool(name = "Task"): Tool {
  return {
    name,
    input: null,
    output: null,
    status: "running",
    kind: "task",
  };
}

test("bucketToolIds separates task tools from regular tools", () => {
  const tools: Record<string, Tool> = {
    "task-1": makeTaskTool(),
    "tool-1": makeRegularTool("Search"),
    "tool-2": makeRegularTool("Read"),
  };

  const result = bucketToolIds(Object.keys(tools), tools);

  assert.deepEqual(result.agentToolIds, ["task-1"]);
  assert.deepEqual(result.regularToolIds, ["tool-1", "tool-2"]);
  assert.equal(result.isAgentToolId["task-1"], true);
  assert.equal(result.isAgentToolId["tool-1"], false);
});

test("getVisibleToolIds shows latest 5 regular tools by default", () => {
  const toolIds = [
    "task-1",
    "tool-1",
    "tool-2",
    "tool-3",
    "tool-4",
    "tool-5",
    "tool-6",
    "tool-7",
  ];
  const regularToolIds = [
    "tool-1",
    "tool-2",
    "tool-3",
    "tool-4",
    "tool-5",
    "tool-6",
    "tool-7",
  ];
  const isAgentToolId = {
    "task-1": true,
    "tool-1": false,
    "tool-2": false,
    "tool-3": false,
    "tool-4": false,
    "tool-5": false,
    "tool-6": false,
    "tool-7": false,
  };

  const result = getVisibleToolIds({
    toolIds,
    regularToolIds,
    isAgentToolId,
    showAllRegularTools: false,
  });

  // Keep task rows visible and only keep the newest regular tool window.
  assert.deepEqual(result.visibleToolIds, [
    "task-1",
    "tool-3",
    "tool-4",
    "tool-5",
    "tool-6",
    "tool-7",
  ]);
  assert.equal(result.hiddenCount, 2);
});

test("getVisibleToolIds returns all tools when showAllRegularTools=true", () => {
  const toolIds = [
    "task-1",
    "tool-1",
    "tool-2",
    "tool-3",
    "tool-4",
    "tool-5",
    "tool-6",
  ];
  const regularToolIds = [
    "tool-1",
    "tool-2",
    "tool-3",
    "tool-4",
    "tool-5",
    "tool-6",
  ];
  const isAgentToolId = {
    "task-1": true,
    "tool-1": false,
    "tool-2": false,
    "tool-3": false,
    "tool-4": false,
    "tool-5": false,
    "tool-6": false,
  };

  const result = getVisibleToolIds({
    toolIds,
    regularToolIds,
    isAgentToolId,
    showAllRegularTools: true,
  });

  assert.deepEqual(result.visibleToolIds, toolIds);
  assert.equal(result.hiddenCount, 1);
});
