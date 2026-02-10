import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  // Repo convention: keep Playwright tests in `e2e/*.spec.ts`.
  testDir: "e2e",
  timeout: 60_000,
  expect: {
    timeout: 15_000,
  },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL:
      process.env.ACP_AGENTS_DEV_BASE_URL || "https://agents-dev.stratospace.fun",
    headless: true,
    ignoreHTTPSErrors: true,
    viewport: { width: 1400, height: 900 },
    trace: "retain-on-failure",
  },
  // Keep projects explicit so we can run `--project=mode-a|mode-b`.
  // Note: Mode B (VS Code smoke) lives in an Electron test and can be gated by env.
  projects: [
    {
      name: "mode-a",
      testMatch: /.*mode-a.*\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        // Use system Chrome only when explicitly requested. Default to Playwright's
        // bundled Chromium to keep local/CI runs working without extra installs.
        ...(process.env.PW_CHROME_CHANNEL
          ? { channel: process.env.PW_CHROME_CHANNEL as any }
          : {}),
      },
    },
    {
      name: "mode-b",
      testMatch: /.*mode-b.*\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        ...(process.env.PW_CHROME_CHANNEL
          ? { channel: process.env.PW_CHROME_CHANNEL as any }
          : {}),
      },
    },
  ],
});
