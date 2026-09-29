import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const browser = await chromium.launch({
  headless: true,
  channel: process.env.PLAYWRIGHT_CHANNEL || "chrome",
});
const base = process.env.TEST_URL || "http://localhost:5173";
await mkdir("artifacts", { recursive: true });
const PIN_END = 2.2; // JOURNEY.scrollVh / 100
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(base);
  await page.waitForTimeout(6000);
  assert.equal(await page.locator("canvas").count(), 1, "hero canvas renders");
  await page.screenshot({ path: "artifacts/hero.png" });

  // Scroll through the pinned zoom; the product overlay resolves around the hand.
  await page.evaluate((f) => window.scrollTo(0, innerHeight * f), PIN_END);
  await page.waitForTimeout(2600);
  assert(await page.locator(".zoom-panel.is-live").count(), "overlay live at zoom end");
  assert.equal(await page.locator(".zoom-card").count(), 4, "four collection cards");
  await page.screenshot({ path: "artifacts/zoom.png" });

  // A card opens the detail panel: scroll locks, focus traps, Escape restores it.
  const card = page.getByRole("button", { name: "Keris Pusaka" });
  await card.click();
  await page.getByRole("dialog").waitFor();
  assert(await page.evaluate(() => document.body.style.overflow === "hidden"));
  await page.keyboard.press("Shift+Tab");
  assert(
    await page.getByRole("dialog").evaluate((el) => el.contains(document.activeElement)),
    "focus trapped in dialog",
  );
  await page.keyboard.press("Escape");
  await page.waitForTimeout(650);
  assert.equal(await page.getByRole("dialog").count(), 0, "dialog closed");
  assert(
    await card.evaluate((el) => el === document.activeElement),
    "focus restored to the card",
  );

  // Booking flow from the featured CTA.
  await page.getByRole("button", { name: /Lihat detailnya/ }).click();
  await page.getByRole("button", { name: "Booking", exact: true }).click();
  assert(await page.getByText("Permintaan demo diterima").isVisible());
  await page.keyboard.press("Escape");
  await page.waitForTimeout(650);

  // WebGL context loss swaps in the static hero; the brand still renders.
  await page.evaluate(() =>
    document.querySelector("canvas")?.dispatchEvent(new Event("webglcontextlost")),
  );
  await page.waitForTimeout(400);
  assert(await page.locator(".wordmark").first().isVisible(), "hero survives context loss");
  assert.deepEqual(errors, []);

  // Reduced motion: no pin, no horizontal overflow.
  const mobile = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    reducedMotion: "reduce",
  });
  await mobile.goto(base);
  await mobile.waitForTimeout(2500);
  assert.equal(await mobile.locator(".pin-spacer").count(), 0, "no pin under reduced motion");
  assert(
    await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    "no horizontal overflow on mobile",
  );
  await mobile.screenshot({ path: "artifacts/mobile-reduced.png" });

  // No WebGL: the canvas is never created; the static hero stands in.
  const noGL = await browser.newPage();
  await noGL.addInitScript(() => {
    const get = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      return String(type).startsWith("webgl") ? null : get.call(this, type, ...args);
    };
  });
  await noGL.goto(base);
  await noGL.waitForTimeout(1200);
  assert.equal(await noGL.locator("canvas").count(), 0, "no canvas without WebGL");
  assert(await noGL.locator(".wordmark").first().isVisible(), "static hero without WebGL");

  console.log(
    "Passed: hero render, zoom overlay, card detail panel, focus trap/restore, booking, context loss, reduced motion, mobile overflow, no-WebGL.",
  );
} finally {
  await browser.close();
}
