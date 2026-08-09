/**
 * Renders every .card in social-cards.html to a PNG in brand/cards/.
 *   node brand/render-cards.mjs
 * Add a card by adding a <section class="card" id="…"> — no change needed here.
 */
import { chromium } from "@playwright/test";

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
  args: ["--no-sandbox"],
});
const page = await browser.newPage({ deviceScaleFactor: 2 });
await page.goto(new URL("./social-cards.html", import.meta.url).href, {
  waitUntil: "networkidle",
});
await page.evaluate(() => document.fonts.ready);

const ids = await page.$$eval(".card", (els) => els.map((e) => e.id));
for (const id of ids) {
  const out = new URL(`./cards/kambio-${id}.png`, import.meta.url).pathname;
  await page.locator(`#${id}`).screenshot({ path: out });
  console.log("wrote", out);
}
await browser.close();
