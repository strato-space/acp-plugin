import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const repoRoot = path.resolve(__dirname, "..");
const svgPath = path.join(repoRoot, "assets", "icon.svg");
const outPath = path.join(repoRoot, "assets", "icon.png");

const svg = fs.readFileSync(svgPath, "utf8");

const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=128, height=128" />
    <style>
      html, body { margin: 0; padding: 0; width: 128px; height: 128px; overflow: hidden; background: transparent; }
      #wrap { width: 128px; height: 128px; }
      svg { width: 128px; height: 128px; display: block; }
    </style>
  </head>
  <body>
    <div id="wrap">${svg}</div>
  </body>
</html>`;

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 128, height: 128 },
  deviceScaleFactor: 1,
});

await page.setContent(html, { waitUntil: "load" });
await page.waitForTimeout(50);

const buf = await page.screenshot({ type: "png" });
fs.writeFileSync(outPath, buf);

await browser.close();

console.log(`[render-icon] wrote ${outPath}`);

