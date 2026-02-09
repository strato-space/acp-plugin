import { spawnSync } from "node:child_process";

function hasDisplay() {
  const d = process.env.DISPLAY;
  return typeof d === "string" && d.trim().length > 0;
}

function which(cmd) {
  const r = spawnSync("bash", ["-lc", `command -v ${cmd}`], {
    stdio: "ignore",
  });
  return r.status === 0;
}

const extraArgs = process.argv.slice(2);

// In headless Linux environments, Electron-based vscode-test needs X11.
// Use xvfb-run when available so `npm test` works out of the box.
const useXvfb =
  process.platform === "linux" && !hasDisplay() && which("xvfb-run");

const command = useXvfb ? "xvfb-run" : "vscode-test";
const args = useXvfb ? ["-a", "vscode-test", ...extraArgs] : extraArgs;

const r = spawnSync(command, args, { stdio: "inherit" });
process.exit(r.status ?? 1);
