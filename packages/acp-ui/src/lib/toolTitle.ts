import type { ToolKind } from "./ansi";

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function compactWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function truncate(value: string, max = 140): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = compactWhitespace(value);
  return trimmed ? trimmed : null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => (typeof v === "string" ? compactWhitespace(v) : ""))
    .filter((v) => v.length > 0);
}

function findNestedHint(value: unknown, depth: number): string | null {
  if (depth <= 0) return null;

  if (typeof value === "string") {
    return asString(value);
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const nested = findNestedHint(item, depth - 1);
      if (nested) return nested;
    }
    return null;
  }

  if (!isRecord(value)) return null;

  const command = asString(
    value.command ?? value.cmd ?? value.program ?? value.executable
  );
  if (command) {
    const args = asStringArray(value.args ?? value.argv ?? value.parameters);
    if (args.length > 0) return `${command} ${args.slice(0, 8).join(" ")}`;
    return command;
  }

  const preferredKeys = [
    "query",
    "q",
    "pattern",
    "path",
    "filePath",
    "file",
    "filename",
    "url",
    "uri",
    "name",
    "text",
  ];

  for (const key of preferredKeys) {
    const s = asString(value[key]);
    if (s) return s;
  }

  for (const nested of Object.values(value)) {
    const hint = findNestedHint(nested, depth - 1);
    if (hint) return hint;
  }

  return null;
}

function extractToolHint(rawInput: unknown): string | null {
  const direct = findNestedHint(rawInput, 3);
  if (!direct) return null;
  return truncate(compactWhitespace(direct));
}

export function normalizeBaseToolName(name: string): string {
  const raw = compactWhitespace(name || "").toLowerCase();
  if (!raw) return raw;
  const withoutDot = raw.split("·")[0].trim();
  const withoutParen = withoutDot.split("(")[0].trim();
  const withoutColon = withoutParen.split(":")[0].trim();
  return withoutColon;
}

export function buildToolDisplayName(
  name: string | undefined,
  rawInput: unknown,
  _existingKind?: ToolKind
): string {
  const base = compactWhitespace(name || "Tool");
  const hint = extractToolHint(rawInput);
  if (!hint) return base;

  if (base.toLowerCase().includes(hint.toLowerCase())) return base;
  return `${base} · ${hint}`;
}
