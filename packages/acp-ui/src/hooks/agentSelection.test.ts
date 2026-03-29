import test from "node:test";
import assert from "node:assert/strict";
import { shouldApplyAgentChanged } from "./agentSelection";
import type { Agent } from "../types";

const BUILTIN_AGENT: Agent = {
  id: "codex",
  name: "Codex CLI",
  available: true,
  source: "builtin",
};

const UNAVAILABLE_AGENT: Agent = {
  id: "missing",
  name: "Missing Agent",
  available: false,
  source: "custom",
};

test("shouldApplyAgentChanged accepts available agents", () => {
  assert.equal(
    shouldApplyAgentChanged(BUILTIN_AGENT.id, [BUILTIN_AGENT, UNAVAILABLE_AGENT]),
    true
  );
});

test("shouldApplyAgentChanged rejects known unavailable agents", () => {
  assert.equal(
    shouldApplyAgentChanged(UNAVAILABLE_AGENT.id, [BUILTIN_AGENT, UNAVAILABLE_AGENT]),
    false
  );
});

test("shouldApplyAgentChanged tolerates unknown agents for host compatibility", () => {
  assert.equal(
    shouldApplyAgentChanged("dynamic-agent", [BUILTIN_AGENT, UNAVAILABLE_AGENT]),
    true
  );
});
