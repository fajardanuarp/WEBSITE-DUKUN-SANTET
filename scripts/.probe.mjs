import { chromium } from "playwright";
const S = "/private/tmp/claude-501/-Users-aaksanurirwan-Ngonten-Website-Dukun/693fe8fb-424f-40b3-92b6-1cefdfd4d462/scratchpad/shots/";
const b = await chromium.launch({ headless: true, channel: "chrome" });

// mobile zoom end
const m = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await m.goto("http://localhost:5173");
await m.waitForTimeout(6500);
const mEnd = 844 * 2.2;
await m.evaluate((y) => window.scrollTo(0, y), mEnd);
await m.waitForTimeout(2600);
await m.screenshot({ path: S + "zmobile.png" });
const mOverflow = await m.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
await m.close();

// desktop: click a card at zoom end → panel opens
const p = await b.newPage({ viewport: { width: 1440, height: 860 } });
await p.goto("http://localhost:5173");
await p.waitForTimeout(6500);
await p.evaluate(() => window.scrollTo(0, 860 * 2.2));
await p.waitForTimeout(2600);
await p.getByRole("button", { name: "Keris Pusaka" }).click();
await p.waitForTimeout(700);
const dialogOpen = await p.getByRole("dialog").count();
await p.screenshot({ path: S + "card-panel.png" });
await p.keyboard.press("Escape");
await p.waitForTimeout(700);
const dialogClosed = await p.getByRole("dialog").count();

// no-WebGL fallback
const ng = await b.newContext({ viewport: { width: 1440, height: 860 } });
await ng.addInitScript(() => {
  const o = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (t, ...r) {
    if (String(t).startsWith("webgl")) return null;
    return o.call(this, t, ...r);
  };
});
const pf = await ng.newPage();
await pf.goto("http://localhost:5173");
await pf.waitForTimeout(2500);
await pf.screenshot({ path: S + "fallback.png" });

console.log(JSON.stringify({ mOverflow, dialogOpen, dialogClosed }));
await b.close();
