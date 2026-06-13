import * as dotenv from "dotenv";
dotenv.config();
import * as fs from "fs";
import * as path from "path";
import * as http from "http";
import * as childProcess from "child_process";
import axios from "axios";

const CONFIG_FILE = path.join(__dirname, "config.json");
const ARTICLES_FILE = path.join(__dirname, "data", "articles_ready.json");
const SCRAPED_FILE = path.join(__dirname, "data", "scraped_articles.json");
const SELECTED_FILE = path.join(__dirname, "data", "selected_articles.json");
const LOGS_DIR = path.join(__dirname, "logs");
const HTML_FILE = path.join(__dirname, "admin.html");
const PORT = 3099;

function readConfig() {
  return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
}

function getStatus() {
  if (!fs.existsSync(ARTICLES_FILE)) return { exists: false };
  const data = JSON.parse(fs.readFileSync(ARTICLES_FILE, "utf-8"));
  return {
    exists: true,
    generated_at: data.generated_at,
    total: data.total,
    articles: data.articles.map((a: any) => ({
      title: a.title,
      slug: a.slug,
      category: a.category,
      scheduled_for: a.scheduled_for,
      posted: a.posted || false,
      failed: a.failed || false,
      posted_at: a.posted_at || null,
    })),
  };
}

function getScraped() {
  if (!fs.existsSync(SCRAPED_FILE)) return { exists: false };
  const data = JSON.parse(fs.readFileSync(SCRAPED_FILE, "utf-8"));
  return {
    exists: true,
    scraped_at: data.scraped_at,
    total: data.total,
    articles: data.articles.map((a: any) => ({
      source: a.source,
      headline: a.headline,
      url: a.url,
      thumbnail_url: a.thumbnail_url || null,
      published_at: a.published_at || null,
    })),
  };
}

function getSelected() {
  if (!fs.existsSync(SELECTED_FILE)) return { exists: false };
  const data = JSON.parse(fs.readFileSync(SELECTED_FILE, "utf-8"));
  return { exists: true, selected_at: data.selected_at, total: data.total, articles: data.articles };
}

function getNextRunTime(timeStr: string, timezone: string): string {
  const [hour, minute] = timeStr.split(":").map(Number);
  const now = new Date();
  const todayInTz = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const [year, month, day] = todayInTz.split("-").map(Number);

  const testDate = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  const tzNoon = parseInt(
    new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "numeric", hour12: false }).format(testDate),
    10
  );
  const offset = tzNoon - 12;

  let runDate = new Date(Date.UTC(year, month - 1, day, hour - offset, minute, 0, 0));
  if (runDate <= now) {
    runDate = new Date(runDate.getTime() + 24 * 60 * 60 * 1000);
  }
  return runDate.toISOString();
}

function getRecentLogs(lines = 60): string {
  const today = new Date().toISOString().slice(0, 10);
  const schedulerLog = path.join(LOGS_DIR, `scheduler_${today}.log`);
  if (!fs.existsSync(schedulerLog)) return "No logs for today.";
  const content = fs.readFileSync(schedulerLog, "utf-8");
  const allLines = content.trim().split("\n");
  return allLines.slice(-lines).join("\n");
}

function spawnDetached(script: string, extraEnv: Record<string, string> = {}) {
  const isWindows = process.platform === "win32";
  const tsNodeBin = isWindows ? "ts-node.cmd" : "ts-node";
  const tsNode = path.join(__dirname, "node_modules", ".bin", tsNodeBin);

  const child = childProcess.spawn(tsNode, [script], {
    cwd: __dirname,
    env: { ...process.env, ...extraEnv },
    detached: false,
    stdio: "ignore",
    shell: isWindows,
  });

  child.on("error", (err) => console.error(`[spawn] Failed to start ${script}:`, err.message));
  child.unref();
}

function parseBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => resolve(body));
  });
}

// Convert "YYYY-MM-DDTHH:MM" (Brussels local) to UTC ISO string
function brusselsLocalToUtc(localStr: string): string {
  const [datePart, timePart] = localStr.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute] = timePart.split(":").map(Number);
  const testDate = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  const brusselsNoon = parseInt(
    new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Brussels", hour: "numeric", hour12: false }).format(testDate),
    10
  );
  const offset = brusselsNoon - 12;
  return new Date(Date.UTC(year, month - 1, day, hour - offset, minute, 0, 0)).toISOString();
}

async function postSingleArticle(slug: string): Promise<void> {
  const websiteUrl = process.env.WEBSITE_URL;
  const apiSecret = process.env.ARTICLES_API_SECRET;
  if (!websiteUrl) throw new Error("WEBSITE_URL is not set");
  if (!apiSecret) throw new Error("ARTICLES_API_SECRET is not set");

  const fileData = JSON.parse(fs.readFileSync(ARTICLES_FILE, "utf-8"));
  const article = fileData.articles.find((a: any) => a.slug === slug);
  if (!article) throw new Error(`Article not found: ${slug}`);
  if (article.posted) throw new Error("Article already posted");

  await axios.post(
    `${websiteUrl}/api/articles`,
    {
      title: article.title,
      slug: article.slug,
      chapo: article.chapo,
      body: article.body,
      category: article.category,
      tags: article.tags,
      source_urls: article.source_urls,
      featured_image_url: article.featured_image_url,
      image_credit: article.image_credit,
      status: "published",
      published_at: new Date().toISOString(),
    },
    { headers: { Authorization: `Bearer ${apiSecret}` }, timeout: 15000 }
  );

  article.posted = true;
  article.posted_at = new Date().toISOString();
  const tmp = ARTICLES_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(fileData, null, 2), "utf-8");
  fs.renameSync(tmp, ARTICLES_FILE);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url!, `http://localhost:${PORT}`);

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  const json = (data: unknown, status = 200) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(data));
  };

  if (req.method === "GET" && url.pathname === "/") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(fs.readFileSync(HTML_FILE, "utf-8"));
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/config") return json(readConfig());

  if (req.method === "POST" && url.pathname === "/api/config") {
    try {
      const config = JSON.parse(await parseBody(req));
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), "utf-8");
      return json({ ok: true });
    } catch (e) { return json({ error: String(e) }, 400); }
  }

  if (req.method === "GET" && url.pathname === "/api/status") return json(getStatus());

  if (req.method === "GET" && url.pathname === "/api/scraped") return json(getScraped());

  if (req.method === "GET" && url.pathname === "/api/selected") return json(getSelected());

  if (req.method === "POST" && url.pathname === "/api/run-selection") {
    try {
      const { mode } = JSON.parse(await parseBody(req));
      spawnDetached("select-standalone.ts", { SELECTION_MODE: mode || "refresh" });
      return json({ ok: true });
    } catch { return json({ error: "Invalid body" }, 400); }
  }

  if (req.method === "POST" && url.pathname === "/api/add-to-selection") {
    try {
      const article = JSON.parse(await parseBody(req));
      let data: any = { selected_at: new Date().toISOString(), total: 0, articles: [] };
      if (fs.existsSync(SELECTED_FILE)) {
        data = JSON.parse(fs.readFileSync(SELECTED_FILE, "utf-8"));
      }
      // Avoid duplicates
      const exists = data.articles.some((a: any) => Array.isArray(a.source_urls) ? a.source_urls.includes(article.url) : a.source_url === article.url);
      if (!exists) {
        data.articles.push({
          source_urls: [article.url],
          headlines: [article.headline],
          angle: "À couvrir selon la ligne éditoriale de BEpaper.",
          category: "politique",
          image_keywords: ["news", "belgium", "press"],
          added_by: "manual",
        });
        data.total = data.articles.length;
        data.selected_at = new Date().toISOString();
        fs.mkdirSync(path.dirname(SELECTED_FILE), { recursive: true });
        const tmp = SELECTED_FILE + ".tmp";
        fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf-8");
        fs.renameSync(tmp, SELECTED_FILE);
      }
      return json({ ok: true, total: data.total });
    } catch (e) { return json({ error: String(e) }, 400); }
  }

  if (req.method === "POST" && url.pathname === "/api/clear-selection") {
    if (fs.existsSync(SELECTED_FILE)) fs.unlinkSync(SELECTED_FILE);
    return json({ ok: true });
  }

  if (req.method === "GET" && url.pathname === "/api/scrape-history") {
    const HISTORY_FILE = path.join(__dirname, "data", "scrape_history.json");
    if (!fs.existsSync(HISTORY_FILE)) return json([]);
    try { return json(JSON.parse(fs.readFileSync(HISTORY_FILE, "utf-8"))); }
    catch { return json([]); }
  }

  if (req.method === "GET" && url.pathname === "/api/next-run") {
    const cfg = readConfig();
    return json({ next_run: getNextRunTime(cfg.schedule.time, cfg.schedule.timezone) });
  }

  if (req.method === "GET" && url.pathname === "/api/logs") return json({ logs: getRecentLogs() });

  if (req.method === "POST" && url.pathname === "/api/run-pipeline") {
    spawnDetached("run.ts");
    return json({ ok: true });
  }

  if (req.method === "POST" && url.pathname === "/api/scrape-now") {
    spawnDetached("scrape.ts", { SCRAPE_SOURCE: "manual" });
    return json({ ok: true });
  }

  if (req.method === "POST" && url.pathname === "/api/post-now") {
    spawnDetached("post.ts");
    return json({ ok: true });
  }

  if (req.method === "POST" && url.pathname === "/api/post-article") {
    try {
      const { slug } = JSON.parse(await parseBody(req));
      await postSingleArticle(slug);
      return json({ ok: true });
    } catch (e) { return json({ error: String(e) }, 500); }
  }

  if (req.method === "POST" && url.pathname === "/api/generate-article") {
    try {
      const { source_url } = JSON.parse(await parseBody(req));
      if (!source_url) return json({ error: "source_url is required" }, 400);
      spawnDetached("write-single.ts", { SOURCE_URL: source_url });
      return json({ ok: true });
    } catch { return json({ error: "Invalid body" }, 400); }
  }

  if (req.method === "POST" && url.pathname === "/api/generate-all-articles") {
    spawnDetached("write-all-selected.ts");
    return json({ ok: true });
  }

  if (req.method === "POST" && url.pathname === "/api/post-all-now") {
    try {
      if (!fs.existsSync(ARTICLES_FILE)) return json({ error: "No articles file" }, 400);
      const fileData = JSON.parse(fs.readFileSync(ARTICLES_FILE, "utf-8"));
      const unposted = fileData.articles.filter((a: any) => !a.posted && !a.failed);
      let posted = 0;
      for (const article of unposted) {
        try {
          await postSingleArticle(article.slug);
          posted++;
        } catch (e) {
          console.error(`[post-all-now] Failed to post ${article.slug}:`, e);
        }
      }
      return json({ ok: true, posted });
    } catch (e) { return json({ error: String(e) }, 500); }
  }

  if (req.method === "POST" && url.pathname === "/api/post-all-scheduled") {
    try {
      if (!fs.existsSync(ARTICLES_FILE)) return json({ error: "No articles file" }, 400);
      const fileData = JSON.parse(fs.readFileSync(ARTICLES_FILE, "utf-8"));
      const cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
      const posting = cfg.posting;
      const unposted = fileData.articles.filter((a: any) => !a.posted && !a.failed);

      // Compute delay between each article based on posting mode
      function getDelayMs(index: number): number {
        if (posting.mode === "interval") return posting.intervalMinutes * 60_000;
        if (posting.mode === "random") {
          const min = posting.randomMin || 60;
          const max = posting.randomMax || 180;
          return (min + Math.random() * (max - min)) * 60_000;
        }
        return 0; // same-time or specific: post all immediately in sequence
      }

      // Fire and forget — post articles with delay in background
      (async () => {
        for (let i = 0; i < unposted.length; i++) {
          if (i > 0) await new Promise(r => setTimeout(r, getDelayMs(i)));
          try {
            await postSingleArticle(unposted[i].slug);
            console.log(`[post-scheduled] Posted ${unposted[i].slug}`);
          } catch (e) {
            console.error(`[post-scheduled] Failed to post ${unposted[i].slug}:`, e);
          }
        }
      })();

      return json({ ok: true, total: unposted.length, mode: posting.mode, intervalMinutes: posting.intervalMinutes });
    } catch (e) { return json({ error: String(e) }, 500); }
  }

  if (req.method === "GET" && url.pathname === "/api/ready") {
    if (!fs.existsSync(ARTICLES_FILE)) return json({ exists: false });
    const data = JSON.parse(fs.readFileSync(ARTICLES_FILE, "utf-8"));
    return json({
      exists: true,
      generated_at: data.generated_at,
      total: data.total,
      articles: data.articles.map((a: any) => ({
        title: a.title,
        slug: a.slug,
        chapo: a.chapo || null,
        body: a.body || null,
        category: a.category,
        tags: a.tags || [],
        source_urls: a.source_urls || [],
        featured_image_url: a.featured_image_url || null,
        image_credit: a.image_credit || null,
        scheduled_for: a.scheduled_for,
        posted: a.posted || false,
        failed: a.failed || false,
        posted_at: a.posted_at || null,
      })),
    });
  }

  if (req.method === "POST" && url.pathname === "/api/clear-ready") {
    if (fs.existsSync(ARTICLES_FILE)) fs.unlinkSync(ARTICLES_FILE);
    return json({ ok: true });
  }

  if (req.method === "POST" && url.pathname === "/api/schedule") {
    try {
      const updates: { slug: string; scheduled_for: string }[] = JSON.parse(await parseBody(req));
      if (!fs.existsSync(ARTICLES_FILE)) return json({ error: "No articles file" }, 400);
      const fileData = JSON.parse(fs.readFileSync(ARTICLES_FILE, "utf-8"));
      for (const { slug, scheduled_for } of updates) {
        const article = fileData.articles.find((a: any) => a.slug === slug);
        if (!article) continue;
        article.scheduled_for = brusselsLocalToUtc(scheduled_for);
        if (article.failed) { article.failed = false; delete article.posted_at; }
      }
      const tmp = ARTICLES_FILE + ".tmp";
      fs.writeFileSync(tmp, JSON.stringify(fileData, null, 2), "utf-8");
      fs.renameSync(tmp, ARTICLES_FILE);
      return json({ ok: true });
    } catch (e) { return json({ error: String(e) }, 400); }
  }

  res.writeHead(404);
  res.end("Not found");
});

server.listen(PORT, () => {
  console.log(`\n🛠  BEpaper Admin — http://localhost:3099\n`);
});
