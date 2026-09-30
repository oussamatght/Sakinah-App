// Runtime driver: real Chrome against the real Expo web build, logging every
// network request to the upstream APIs so we can measure duplicates/background work.
const puppeteer = require("puppeteer-core");
const fs = require("fs");

const BASE = "http://localhost:19006";
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const OUT = "C:\\Users\\LENOVO\\AppData\\Local\\Temp\\opencode\\runtime";
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

const API_RE = /api\.turath\.io|api3\.islamhouse\.com|api\.hadeethenc|hadis-api|alquran|quran\.com|prayertimes|fawaz|cdn|json/i;

const log = [];
let counter = 0;

function record(entry) {
  const line = JSON.stringify(entry);
  log.push(line);
  fs.appendFileSync(`${OUT}/requests.jsonl`, line + "\n");
  return entry;
}

async function main() {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: "new",
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--window-size=430,900"],
    defaultViewport: { width: 430, height: 900, isMobile: false },
  });

  const page = await browser.newPage();
  const consoleErrors = [];

  page.on("console", (msg) => {
    if (msg.type() === "error" || msg.type() === "warning") {
      const t = msg.text();
      if (t.includes("Download the React DevTools")) return;
      consoleErrors.push(`[${msg.type()}] ${t.slice(0, 400)}`);
    }
  });
  page.on("pageerror", (err) => consoleErrors.push(`[pageerror] ${String(err).slice(0, 600)}`));

  page.on("request", (req) => {
    const url = req.url();
    if (!API_RE.test(url)) return;
    const e = record({
      t: "request",
      seq: ++counter,
      phase: global.__PHASE__ || "boot",
      method: req.method(),
      url: url.slice(0, 300),
    });
  });

  page.on("response", async (res) => {
    const url = res.url();
    if (!API_RE.test(url)) return;
    let size = null;
    try {
      const buf = await res.buffer().catch(() => null);
      size = buf ? buf.length : null;
    } catch {}
    record({
      t: "response",
      phase: global.__PHASE__ || "boot",
      status: res.status(),
      url: url.slice(0, 300),
      bytes: size,
    });
  });

  // ---- boot ----
  console.log("navigating…");
  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 180000 });

  // Metro's first bundle is slow; wait for real app content.
  await page.waitForFunction(
    () => document.body && document.body.innerText && document.body.innerText.length > 40,
    { timeout: 240000, polling: 1000 },
  );
  await new Promise((r) => setTimeout(r, 8000));

  const text = await page.evaluate(() => document.body.innerText);
  fs.writeFileSync(`${OUT}/01-boot.txt`, text);
  await page.screenshot({ path: `${OUT}/01-boot.png`, fullPage: true });
  console.log("---- BOOT TEXT ----");
  console.log(text.slice(0, 1200));

  fs.writeFileSync(`${OUT}/console.txt`, consoleErrors.join("\n"));
  console.log("\n---- CONSOLE (" + consoleErrors.length + ") ----");
  console.log(consoleErrors.slice(0, 25).join("\n"));

  await browser.close();
  console.log("\nrequests logged: " + counter);
}

main().catch(async (e) => {
  console.error("DRIVER FAILED:", e);
  process.exit(1);
});
