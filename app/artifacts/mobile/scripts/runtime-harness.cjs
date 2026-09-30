// Shared runtime driver helpers (puppeteer-core + real Chrome).
const puppeteer = require("puppeteer-core");
const fs = require("fs");

const BASE = "http://localhost:19006";
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const OUT = "C:\\Users\\LENOVO\\AppData\\Local\\Temp\\opencode\\runtime";
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

const API_RE =
  /api\.turath\.io|api3\.islamhouse\.com|api\.islamic\.app|api\.hadeethenc|hadis-api-id|api\.quran|alquran\.cloud|quran\.com|api\.adhan|times\.api|fawaz/i;

const state = { phase: "boot", log: [], seq: 0, console: [] };

function record(entry) {
  const e = { ...entry, phase: state.phase };
  state.log.push(e);
  return e;
}

async function launch() {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: "new",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
    defaultViewport: { width: 430, height: 900 },
  });
  const page = await browser.newPage();

  page.on("console", (msg) => {
    const t = msg.text();
    if (t.includes("Download the React DevTools")) return;
    if (msg.type() === "error" || msg.type() === "warning") {
      state.console.push(`[${msg.type()}] ${t.slice(0, 300)}`);
    }
  });
  page.on("pageerror", (err) =>
    state.console.push(`[pageerror] ${String(err).slice(0, 500)}`),
  );

  page.on("request", (req) => {
    const url = req.url();
    if (!API_RE.test(url)) return;
    record({ t: "req", seq: ++state.seq, method: req.method(), url });
  });

  page.on("response", async (res) => {
    const url = res.url();
    if (!API_RE.test(url)) return;
    let bytes = null;
    try {
      const buf = await res.buffer().catch(() => null);
      bytes = buf ? buf.length : null;
    } catch {}
    record({ t: "res", status: res.status(), url, bytes });
  });

  return { browser, page };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function boot(page) {
  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.waitForFunction(
    () => document.body && document.body.innerText.length > 40,
    { timeout: 240000, polling: 1000 },
  );
  await sleep(6000);
}

/** Click by accessibility label (Expo web maps it to aria-label). */
async function clickLabel(page, label, { exact = false, timeout = 15000 } = {}) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const ok = await page.evaluate(
      (lbl, ex) => {
        const nodes = Array.from(document.querySelectorAll('[aria-label]'));
        const target = nodes.find((n) =>
          ex ? n.getAttribute("aria-label") === lbl : (n.getAttribute("aria-label") || "").includes(lbl),
        );
        if (!target) return false;
        target.scrollIntoView({ block: "center" });
        target.click();
        return true;
      },
      label,
      exact,
    );
    if (ok) return true;
    await sleep(300);
  }
  return false;
}

/** Click a node whose visible text matches. */
async function clickText(page, text, { timeout = 15000 } = {}) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const ok = await page.evaluate((t) => {
      const nodes = Array.from(
        document.querySelectorAll('div,span,button,a,[role="button"]'),
      );
      const target = nodes.find((n) => {
        const own = n.innerText ? n.innerText.trim() : "";
        return own === t;
      });
      if (!target) return false;
      const clickable = target.closest('[role="button"],button,a') || target;
      clickable.scrollIntoView({ block: "center" });
      clickable.click();
      return true;
    }, text);
    if (ok) return true;
    await sleep(300);
  }
  return false;
}

/** Type into an input by its aria-label. */
async function typeInto(page, label, value) {
  return page.evaluate(
    (lbl, val) => {
      const nodes = Array.from(document.querySelectorAll("input,textarea"));
      const target = nodes.find(
        (n) => (n.getAttribute("aria-label") || "").includes(lbl) || (n.placeholder || "").includes(lbl),
      );
      if (!target) return false;
      const proto =
        target.tagName === "TEXTAREA"
          ? window.HTMLTextAreaElement.prototype
          : window.HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
      setter.call(target, val);
      target.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    },
    label,
    value,
  );
}

const bodyText = (page) => page.evaluate(() => document.body.innerText);

function dump(name, text) {
  fs.writeFileSync(`${OUT}/${name}`, text ?? "");
  return text;
}

function requestsSince(mark) {
  return state.log
    .slice(mark)
    .filter((e) => e.t === "req")
    .map((e) => e.url);
}

function mark() {
  return state.log.length;
}

function summarizeRequests(urls) {
  const counts = new Map();
  for (const u of urls) counts.set(u, (counts.get(u) || 0) + 1);
  return { total: urls.length, unique: counts.size, dupes: [...counts].filter(([, c]) => c > 1) };
}

module.exports = {
  launch, boot, sleep, clickLabel, clickText, typeInto, bodyText,
  dump, state, record, requestsSince, mark, summarizeRequests, OUT, BASE,
};
