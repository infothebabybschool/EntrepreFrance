import * as dotenv from "dotenv";
dotenv.config();
import * as fs from "fs";
import * as path from "path";
import * as cron from "node-cron";
import { logScheduler, logSchedulerError } from "./lib/schedulerLogger";
import { checkAndPost, checkAndPostBySlug } from "./post";
import { getConfig, refreshConfigFromApi } from "./lib/config";
import { run as runPipelineFunc } from "./run";
import { scrapeArticles } from "./scrape";
import { selectArticles } from "./select";
import { writeArticles } from "./write";
import { enrichWithImages } from "./images";
import { syncScrapeCache, syncSelectionCache, syncReadyCache, syncLog, syncAlert } from "./lib/sync";
import { SelectedArticle, PostedArticle, ArticlesReadyFileOutput } from "./types";
import axios from "axios";

const ARTICLES_FILE = path.join(__dirname, "data", "articles_ready.json");
const LOCK_FILE = path.join(__dirname, "data", "pipeline.lock");
const LOCK_MAX_AGE_MS = 45 * 60 * 1000; // 45 min — if lock is older, treat as stale

// Track last scheduled run key to prevent double-firing within the same minute
let _lastRanKey: string | null = null;

// ── Lock helpers ──────────────────────────────────────────────────────────────

function acquireLock(): boolean {
  fs.mkdirSync(path.dirname(LOCK_FILE), { recursive: true });
  if (fs.existsSync(LOCK_FILE)) {
    const age = Date.now() - fs.statSync(LOCK_FILE).mtimeMs;
    if (age < LOCK_MAX_AGE_MS) {
      logScheduler("scheduler", `Pipeline already running (lock age: ${Math.round(age / 60000)}m) — skipping`);
      return false;
    }
    logScheduler("scheduler", `Stale lock file found (${Math.round(age / 60000)}m old) — removing and proceeding`);
  }
  fs.writeFileSync(LOCK_FILE, new Date().toISOString(), "utf-8");
  return true;
}

function releaseLock(): void {
  try { if (fs.existsSync(LOCK_FILE)) fs.unlinkSync(LOCK_FILE); } catch {}
}

// ── Pipeline runner ───────────────────────────────────────────────────────────

// Run the pipeline inline (no child process) so it can't be orphaned when
// Docker stops the container. Uses a lock file to prevent duplicate runs.
async function runPipeline(): Promise<void> {
  if (!acquireLock()) return;

  logScheduler("pipeline", "Starting daily pipeline run…");
  try {
    await runPipelineFunc();
    logScheduler("pipeline", "✅ Pipeline completed successfully");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logSchedulerError("pipeline", `Pipeline failed: ${msg}`);
    syncAlert("Pipeline failed", msg).catch(() => {});
  } finally {
    releaseLock();
  }
}

// ── Command poller ────────────────────────────────────────────────────────────

async function markCommandDone(id: string, status: "done" | "failed"): Promise<void> {
  const websiteUrl = process.env.WEBSITE_URL;
  const apiSecret = process.env.ARTICLES_API_SECRET;
  if (!websiteUrl || !apiSecret) return;
  try {
    await axios.patch(
      `${websiteUrl}/api/pipeline/commands/${id}`,
      { status },
      { headers: { Authorization: `Bearer ${apiSecret}` }, timeout: 5000 }
    );
  } catch {}
}

async function checkCommands(): Promise<void> {
  const websiteUrl = process.env.WEBSITE_URL;
  const apiSecret = process.env.ARTICLES_API_SECRET;
  if (!websiteUrl || !apiSecret) return;

  let commands: { id: string; command: string }[] = [];
  try {
    const res = await axios.get<{ commands: { id: string; command: string }[] }>(
      `${websiteUrl}/api/pipeline/commands`,
      { headers: { Authorization: `Bearer ${apiSecret}` }, timeout: 5000 }
    );
    commands = res.data.commands ?? [];
  } catch {
    return;
  }

  for (const cmd of commands) {
    const { id, command } = cmd as { id: string; command: string; payload?: Record<string, unknown> };
    const payload = (cmd as { payload?: Record<string, unknown> }).payload ?? {};
    logScheduler("commands", `Executing command: ${command}`);
    try {
      if (command === "run_pipeline") {
        await runPipeline();
        // After generating articles, post any that are now due
        await checkAndPost();
      } else if (command === "clear_scrape") {
        const scrapeFile = path.join(__dirname, "data", "scraped_articles.json");
        if (fs.existsSync(scrapeFile)) fs.unlinkSync(scrapeFile);
        await syncScrapeCache(new Date().toISOString(), 0, [], []);
        await syncLog("commands", "clear_scrape: scraped_articles.json deleted");
      } else if (command === "scrape_now") {
        await scrapeArticles("manual");
      } else if (command === "post_now") {
        await checkAndPost();
      } else if (command === "refresh_selection") {
        const selected = await selectArticles();
        const selectedFile = path.join(__dirname, "data", "selected_articles.json");
        fs.mkdirSync(path.dirname(selectedFile), { recursive: true });
        fs.writeFileSync(selectedFile, JSON.stringify({ selected_at: new Date().toISOString(), total: selected.length, articles: selected }, null, 2));
      } else if (command === "add_to_selection") {
        const selectedFile = path.join(__dirname, "data", "selected_articles.json");
        let existing: { selected_at: string; total: number; articles: SelectedArticle[] } = { selected_at: new Date().toISOString(), total: 0, articles: [] };
        if (fs.existsSync(selectedFile)) {
          try { existing = JSON.parse(fs.readFileSync(selectedFile, "utf-8")); } catch {}
        }
        const alreadyAdded = existing.articles.some((a) => a.source_urls.includes(payload.source_url as string));
        if (!alreadyAdded && payload.source_url) {
          existing.articles.push({
            source_urls: [payload.source_url as string],
            headlines: [(payload.headline as string) || ""],
            angle: "À couvrir selon la ligne éditoriale de BEpaper.",
            category: "politique" as const,
            image_keywords: ["news", "belgium", "press"] as [string, string, string],
          });
          existing.total = existing.articles.length;
          existing.selected_at = new Date().toISOString();
          fs.mkdirSync(path.dirname(selectedFile), { recursive: true });
          fs.writeFileSync(selectedFile, JSON.stringify(existing, null, 2));
          await syncSelectionCache(existing.selected_at, existing.total, existing.articles);
        }
      } else if (command === "clear_selection") {
        const selectedFile = path.join(__dirname, "data", "selected_articles.json");
        if (fs.existsSync(selectedFile)) fs.unlinkSync(selectedFile);
        await syncSelectionCache(new Date().toISOString(), 0, []);
      } else if (command === "generate_article") {
        // Generate a single article by source_url and merge into articles_ready.json
        const sourceUrl = payload.source_url as string;
        if (!sourceUrl) throw new Error("Missing source_url in payload");
        const selectedFile = path.join(__dirname, "data", "selected_articles.json");
        let article: SelectedArticle | undefined;
        if (fs.existsSync(selectedFile)) {
          try {
            const sel = JSON.parse(fs.readFileSync(selectedFile, "utf-8"));
            article = (sel.articles as SelectedArticle[]).find((a) => a.source_urls.includes(sourceUrl));
          } catch {}
        }
        // Fall back to article data carried in the command payload
        if (!article) {
          if (!payload.headline) throw new Error(`Article not found in selection and no fallback data in payload: ${sourceUrl}`);
          article = {
            source_urls: [sourceUrl],
            headlines: [payload.headline as string],
            angle: (payload.angle as string) || "À couvrir selon la ligne éditoriale de BEpaper.",
            category: ((payload.category as string) || "politique") as SelectedArticle["category"],
            image_keywords: (payload.image_keywords as [string, string, string]) || ["news", "belgium", "press"],
          };
          await syncLog("commands", `generate_article: article not in local file — using payload data for "${article.headlines[0].slice(0, 60)}"`);
        }
        await syncLog("commands", `generate_article: writing "${article.headlines[0].slice(0, 60)}"`);
        const written = await writeArticles([article]);
        const readyArticles = await enrichWithImages(written);
        // Manually generated articles: ensure scheduled_for is at least 30min in the future
        // so the auto-poster doesn't pick them up before the user has a chance to review.
        const reviewDeadline = Date.now() + 30 * 60 * 1000;
        for (const a of readyArticles) {
          if (new Date(a.scheduled_for).getTime() < reviewDeadline) {
            a.scheduled_for = new Date(reviewDeadline).toISOString();
          }
        }
        const readyFile = path.join(__dirname, "data", "articles_ready.json");
        fs.mkdirSync(path.dirname(readyFile), { recursive: true });
        // Merge with existing ready articles (replace if already exists, otherwise append)
        let existing: ArticlesReadyFileOutput = { generated_at: new Date().toISOString(), total: 0, articles: [] };
        if (fs.existsSync(readyFile)) {
          try { existing = JSON.parse(fs.readFileSync(readyFile, "utf-8")); } catch {}
        }
        for (const newArticle of readyArticles) {
          const idx = existing.articles.findIndex((a) => a.source_urls?.includes(sourceUrl));
          if (idx >= 0) { existing.articles[idx] = newArticle as PostedArticle; }
          else { existing.articles.push(newArticle as PostedArticle); }
        }
        existing.total = existing.articles.length;
        existing.generated_at = new Date().toISOString();
        fs.writeFileSync(readyFile, JSON.stringify(existing, null, 2));
        await syncReadyCache(existing.generated_at, existing.total, existing.articles);
        await syncLog("commands", `generate_article done — "${article.headlines[0].slice(0, 60)}"`);
      } else if (command === "generate_all") {
        const selectedFile = path.join(__dirname, "data", "selected_articles.json");
        if (!fs.existsSync(selectedFile)) throw new Error("No selected articles");
        const sel = JSON.parse(fs.readFileSync(selectedFile, "utf-8"));
        const written = await writeArticles(sel.articles);
        const ready = await enrichWithImages(written);
        const generatedAt = new Date().toISOString();
        const output = { generated_at: generatedAt, total: ready.length, articles: ready };
        const readyFile = path.join(__dirname, "data", "articles_ready.json");
        fs.mkdirSync(path.dirname(readyFile), { recursive: true });
        fs.writeFileSync(readyFile, JSON.stringify(output, null, 2));
        await syncReadyCache(generatedAt, ready.length, ready);
        await syncLog("commands", `generate_all done — ${ready.length} articles ready`);
      } else if (command === "clear_ready") {
        const readyFile = path.join(__dirname, "data", "articles_ready.json");
        if (fs.existsSync(readyFile)) fs.unlinkSync(readyFile);
        await syncReadyCache(new Date().toISOString(), 0, []);
      } else if (command === "post_article") {
        const slug = payload.slug as string;
        if (!slug) throw new Error("Missing slug in payload");
        await checkAndPostBySlug(slug);
        // Re-sync ready cache after posting
        const readyFile = path.join(__dirname, "data", "articles_ready.json");
        if (fs.existsSync(readyFile)) {
          const data: ArticlesReadyFileOutput = JSON.parse(fs.readFileSync(readyFile, "utf-8"));
          await syncReadyCache(data.generated_at, data.total, data.articles as PostedArticle[]);
        }
      } else if (command === "mark_posted") {
        const slug = payload.slug as string;
        if (!slug) throw new Error("Missing slug in payload");
        const readyFile = path.join(__dirname, "data", "articles_ready.json");
        if (fs.existsSync(readyFile)) {
          const data: ArticlesReadyFileOutput = JSON.parse(fs.readFileSync(readyFile, "utf-8"));
          const article = data.articles.find((a) => a.slug === slug);
          if (article) {
            article.posted = true;
            article.posted_at = new Date().toISOString();
            fs.writeFileSync(readyFile, JSON.stringify(data, null, 2));
            await syncReadyCache(data.generated_at, data.total, data.articles as PostedArticle[]);
          }
        }
      } else if (command === "update_schedule") {
        const { slug, scheduled_for } = payload as { slug: string; scheduled_for: string };
        if (!slug || !scheduled_for) throw new Error("Missing slug or scheduled_for");
        const readyFile = path.join(__dirname, "data", "articles_ready.json");
        if (fs.existsSync(readyFile)) {
          const data: ArticlesReadyFileOutput = JSON.parse(fs.readFileSync(readyFile, "utf-8"));
          const article = data.articles.find((a) => a.slug === slug);
          if (article) {
            article.scheduled_for = scheduled_for;
            if (article.failed) { article.failed = false; delete article.posted_at; }
            fs.writeFileSync(readyFile, JSON.stringify(data, null, 2));
            await syncReadyCache(data.generated_at, data.total, data.articles as PostedArticle[]);
          }
        }
      } else if (command === "update_article") {
        const { slug, title, chapo, body, tags, featured_image_url, image_credit } = payload as {
          slug: string; title?: string; chapo?: string; body?: string;
          tags?: string[]; featured_image_url?: string; image_credit?: string;
        };
        if (!slug) throw new Error("Missing slug");
        const readyFile = path.join(__dirname, "data", "articles_ready.json");
        if (fs.existsSync(readyFile)) {
          const data: ArticlesReadyFileOutput = JSON.parse(fs.readFileSync(readyFile, "utf-8"));
          const article = data.articles.find((a) => a.slug === slug);
          if (article) {
            if (title !== undefined) article.title = title;
            if (chapo !== undefined) article.chapo = chapo;
            if (body !== undefined) article.body = body;
            if (tags !== undefined) article.tags = tags;
            if (featured_image_url !== undefined) article.featured_image_url = featured_image_url;
            if (image_credit !== undefined) article.image_credit = image_credit;
            fs.writeFileSync(readyFile, JSON.stringify(data, null, 2));
            await syncReadyCache(data.generated_at, data.total, data.articles as PostedArticle[]);
          }
        }
      } else if (command === "reschedule_articles") {
        // Re-space all unposted articles starting from now, using configured interval
        const readyFile = path.join(__dirname, "data", "articles_ready.json");
        if (!fs.existsSync(readyFile)) throw new Error("No articles_ready.json found");
        const cfg = getConfig();
        const interval = cfg.posting.intervalMinutes ?? 130;
        const data: ArticlesReadyFileOutput = JSON.parse(fs.readFileSync(readyFile, "utf-8"));
        const unposted = data.articles.filter((a) => !a.posted && !a.failed);
        let t = new Date();
        for (const article of unposted) {
          article.scheduled_for = t.toISOString();
          t = new Date(t.getTime() + interval * 60 * 1000);
        }
        fs.writeFileSync(readyFile, JSON.stringify(data, null, 2));
        await syncReadyCache(data.generated_at, data.total, data.articles as PostedArticle[]);
        await syncLog("commands", `reschedule_articles: ${unposted.length} articles rescheduled (${interval}min intervals)`);
      }
      await markCommandDone(id, "done");
      logScheduler("commands", `✅ Command done: ${command}`);
    } catch (err) {
      logSchedulerError("commands", `Command failed (${command}): ${err instanceof Error ? err.message : String(err)}`);
      await syncLog("commands", `Command failed: ${command} — ${err instanceof Error ? err.message : String(err)}`, true);
      await markCommandDone(id, "failed");
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getTzParts(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(date);
  const get = (t: string) => parseInt(parts.find((p) => p.type === t)!.value, 10);
  return { h: get("hour"), m: get("minute"), y: get("year"), mo: get("month"), d: get("day") };
}

function pipelineRanToday(timezone: string): boolean {
  if (!fs.existsSync(ARTICLES_FILE)) return false;
  try {
    const data = JSON.parse(fs.readFileSync(ARTICLES_FILE, "utf-8"));
    if (!data.generated_at) return false;
    const now = getTzParts(new Date(), timezone);
    const gen = getTzParts(new Date(data.generated_at), timezone);
    return now.y === gen.y && now.mo === gen.mo && now.d === gen.d;
  } catch { return false; }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // Fetch latest config from Supabase before doing anything else
  await refreshConfigFromApi();

  const config = getConfig();
  logScheduler("scheduler", "═══════════════════════════════════════");
  logScheduler("scheduler", `Scheduler started — timezone: ${config.schedule.timezone}`);
  logScheduler("scheduler", `Pipeline trigger: ${config.schedule.time} ${config.schedule.timezone}`);
  logScheduler("scheduler", "═══════════════════════════════════════");

  // Poll commands every 10 seconds so admin actions execute quickly
  setInterval(() => {
    checkCommands().catch((err) => logSchedulerError("commands", `Poll error: ${err instanceof Error ? err.message : String(err)}`));
  }, 10000);
  logScheduler("scheduler", "Command poller registered: every 10 seconds");

  // Cron job 1: every minute — refresh config from Supabase, check trigger time.
  cron.schedule("* * * * *", () => {
    // Fire-and-forget async work inside the cron tick
    (async () => {
      await refreshConfigFromApi();
    })().catch((err) => logSchedulerError("scheduler", `Cron async error: ${err instanceof Error ? err.message : String(err)}`));

    try {
      const cfg = getConfig();
      const [targetH, targetM] = cfg.schedule.time.split(":").map(Number);
      const { h, m, y, mo, d } = getTzParts(new Date(), cfg.schedule.timezone);
      const runKey = `${y}-${mo}-${d}T${String(targetH).padStart(2, "0")}:${String(targetM).padStart(2, "0")}`;

      if (h === targetH && m === targetM && _lastRanKey !== runKey) {
        _lastRanKey = runKey;
        logScheduler("scheduler", `⏰ Trigger time reached (${cfg.schedule.time} ${cfg.schedule.timezone})`);
        runPipeline().catch((err) => logSchedulerError("pipeline", String(err)));
      }
    } catch (err) {
      logSchedulerError("scheduler", `Config check error: ${err instanceof Error ? err.message : String(err)}`);
    }
  });

  logScheduler("scheduler", "Cron job 1 registered: config refresh + trigger check every minute");

  // Cron job 2: check and post due articles every 5 minutes
  cron.schedule("*/5 * * * *", async () => {
    try {
      await checkAndPost();
    } catch (err) {
      logSchedulerError("poster", `Unhandled error: ${err instanceof Error ? err.message : String(err)}`);
    }
  });

  logScheduler("scheduler", "Cron job 2 registered: article poster every 5 minutes");

  // Initial poster check on startup
  logScheduler("scheduler", "Running initial article check…");
  try {
    await checkAndPost();
  } catch (err) {
    logSchedulerError("poster", `Initial check error: ${err instanceof Error ? err.message : String(err)}`);
  }
}

main().catch((err) => {
  logSchedulerError("scheduler", `Fatal startup error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
