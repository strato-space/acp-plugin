import { test, expect, _electron as electron } from "@playwright/test";
import path from "path";
import { mkdir, writeFile } from "fs/promises";
import { cmdOrCtrl, findVSCodeExecutable, PROJECT_ROOT } from "./utils";

const RUN_VSCODE_SMOKE = (process.env.ACP_E2E_RUN_VSCODE || "").trim() === "1";

test.describe("Mode B: VS Code extension smoke", () => {
  test("opens ACP chat panel and renders composer", async () => {
    test.skip(
      !RUN_VSCODE_SMOKE,
      "Set ACP_E2E_RUN_VSCODE=1 to run the VS Code smoke test."
    );

    let vscodePath: string;
    try {
      vscodePath = await findVSCodeExecutable();
    } catch (e) {
      test.skip(true, e instanceof Error ? e.message : String(e));
      return;
    }

    test.setTimeout(180_000);

    const userDataDir = path.join(PROJECT_ROOT, ".vscode-test", "user-data-playwright");
    const settingsDir = path.join(userDataDir, "User");
    await mkdir(settingsDir, { recursive: true });
    await writeFile(
      path.join(settingsDir, "settings.json"),
      JSON.stringify({
        "window.titleBarStyle": "custom",
        // Keep output noise down.
        "telemetry.telemetryLevel": "off",
      })
    );

    const app = await electron.launch({
      executablePath: vscodePath,
      args: [
        `--extensionDevelopmentPath=${PROJECT_ROOT}`,
        `--user-data-dir=${userDataDir}`,
        "--disable-extensions",
        "--disable-gpu-sandbox",
        "--no-sandbox",
        "--disable-workspace-trust",
        "--skip-release-notes",
        "--skip-welcome",
        "--disable-telemetry",
        PROJECT_ROOT,
      ],
      timeout: 60_000,
      env: {
        ...process.env,
        VSCODE_SKIP_PRELAUNCH: "1",
      },
    });

    try {
      const window = await app.firstWindow();
      await window.waitForLoadState("domcontentloaded");
      await window.setViewportSize({ width: 1280, height: 800 });

      // Open ACP chat panel via command palette.
      const modifier = cmdOrCtrl();
      await window.keyboard.press(`${modifier}+Shift+P`);
      await window.waitForTimeout(500);
      await window.keyboard.type("ACP: Start Chat");
      await window.waitForTimeout(300);
      await window.keyboard.press("Enter");

      // Webview loads in an iframe.
      await window.waitForSelector("iframe.webview", { timeout: 60_000 });
      const frame = window.frameLocator("iframe.webview");

      await expect(
        frame.getByRole("textbox", { name: "Message input" })
      ).toBeVisible({ timeout: 60_000 });
    } finally {
      await app.close();
    }
  });
});

