import fs from "fs";
import path from "path";
import { execSync } from "child_process";

export const PROJECT_ROOT = path.resolve(__dirname, "..");

export function cmdOrCtrl(): "Control" | "Meta" {
  return process.platform === "darwin" ? "Meta" : "Control";
}

function tryResolveExisting(...candidates: string[]): string | null {
  for (const p of candidates) {
    if (p && fs.existsSync(p)) return p;
  }
  return null;
}

export async function findVSCodeExecutable(): Promise<string> {
  const fromEnv = tryResolveExisting(
    process.env.VSCODE_EXEC_PATH || "",
    process.env.VSCODE_EXECUTABLE_PATH || ""
  );
  if (fromEnv) return fromEnv;

  const vscodeTestDir = path.join(PROJECT_ROOT, ".vscode-test");
  if (fs.existsSync(vscodeTestDir)) {
    const entries = fs.readdirSync(vscodeTestDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const maybe = path.join(vscodeTestDir, entry.name, "code");
      if (fs.existsSync(maybe)) return maybe;
    }
  }

  try {
    const whichCmd = process.platform === "win32" ? "where" : "which";
    const resolved = execSync(`${whichCmd} code`, { stdio: ["ignore", "pipe", "ignore"] })
      .toString("utf8")
      .trim()
      .split(/\r?\n/)[0];
    if (resolved && fs.existsSync(resolved)) return resolved;
  } catch {
    // ignore
  }

  throw new Error(
    "Could not find VS Code executable. Set VSCODE_EXEC_PATH or run `npm test` once to populate .vscode-test/."
  );
}

