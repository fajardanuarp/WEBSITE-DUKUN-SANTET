import { chromium } from "playwright";
const S = "/private/tmp/claude-501/-Users-aaksanurirwan-Ngonten-Website-Dukun/693fe8fb-424f-40b3-92b6-1cefdfd4d462/scratchpad/shots/";
const b = await chromium.launch({ headless: true, channel: "chrome" });
const p = await b.newPage({ viewport: { width: 1440, height: 860 } });
const errs = [];
p.on("pageerror", (e) => errs.push("PAGEERR " + e.message));
p.on("console", (m) => { if (m.type() === "error") errs.push("ERR " + m.text().slice(0,160)); });
await p.goto("http://localhost:5173");
await p.waitForTimeout(7000);
// scrollVh=220 → pin end ≈ 2.2 * innerHeight
const end = 860 * 2.2;
const stops = [0, 0.25, 0.5, 0.72, 1.0];
for (const f of stops) {
  await p.evaluate((y) => window.scrollTo(0, y), Math.round(end * f));
  await p.waitForTimeout(2600);
  await p.screenshot({ path: S + "z" + Math.round(f * 100) + ".png" });
}
console.log(errs.length ? errs.slice(0,8).join("\n") : "clean");
await b.close();
