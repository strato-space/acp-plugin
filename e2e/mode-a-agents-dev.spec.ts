import { test, expect } from "@playwright/test";

const TOKEN = (process.env.ACP_AGENTS_DEV_TOKEN || "").trim();

test.describe("Mode A: agents-dev web smoke", () => {
  test("loads and connects without uncaught errors", async ({ page }) => {
    test.skip(!TOKEN, "Set ACP_AGENTS_DEV_TOKEN to run agents-dev smoke tests.");

    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];

    page.on("pageerror", (err) => pageErrors.push(err.message || String(err)));
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    await page.goto(`/?token=${encodeURIComponent(TOKEN)}`);

    await expect(page.getByText("ACP", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("textbox", { name: "Message input" })
    ).toBeVisible();

    // Connection state is rendered inside Settings.
    await page.getByRole("button", { name: "Settings" }).click();
    await expect(page.getByText("Connected", { exact: true })).toBeVisible({
      timeout: 30_000,
    });
    await page.keyboard.press("Escape");

    expect(pageErrors, `page errors:\n${pageErrors.join("\n")}`).toEqual([]);
    expect(
      consoleErrors,
      `console errors:\n${consoleErrors.join("\n")}`
    ).toEqual([]);
  });

  test("ping -> pong", async ({ page }) => {
    test.skip(!TOKEN, "Set ACP_AGENTS_DEV_TOKEN to run agents-dev smoke tests.");

    await page.goto(`/?token=${encodeURIComponent(TOKEN)}`);

    // Wait for the UI to be ready.
    const input = page.getByRole("textbox", { name: "Message input" });
    await expect(input).toBeVisible();

    // Make sure we are connected before prompting (reduces flake).
    await page.getByRole("button", { name: "Settings" }).click();
    await expect(page.getByText("Connected", { exact: true })).toBeVisible({
      timeout: 30_000,
    });
    await page.keyboard.press("Escape");

    // Make the assertion deterministic: some agents may interpret "ping" as a
    // request to run the system ping command instead of replying "pong".
    await input.fill('Reply with exactly the single word "pong". Do not use tools.');
    await input.press("Enter");

    await expect(page.getByText("pong", { exact: true })).toBeVisible({
      timeout: 60_000,
    });
  });
});
