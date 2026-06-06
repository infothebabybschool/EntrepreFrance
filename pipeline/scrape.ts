import * as fs from "fs";
import * as path from "path";
import { ScrapedArticle, ScraperOutput } from "./types";
import { scrapeRssFeed } from "./lib/rss-scraper";
import { getConfig } from "./lib/config";
import { syncScrapeCache } from "./lib/sync";

const OUTPUT_DIR = path.join(__dirname, "data");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "scraped_articles.json");
const HISTORY_FILE = path.join(OUTPUT_DIR, "scrape_history.json");

function recordHistory(scraped_at: string, total: number, source: "manual" | "auto"): void {
  const entry = { scraped_at, total, source };
  let history: typeof entry[] = [];
  if (fs.existsSync(HISTORY_FILE)) {
    try { history = JSON.parse(fs.readFileSync(HISTORY_FILE, "utf-8")); } catch {}
  }
  history.unshift(entry);
  if (history.length > 5) history = history.slice(0, 5);
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2), "utf-8");
}

export async function scrapeArticles(source: "manual" | "auto" = "auto"): Promise<void> {
  return main(source);
}

async function main(source: "manual" | "auto" = "auto"): Promise<void> {
  const startedAt = new Date().toISOString();
  console.log(`\n🗞  BEpaper Scraper — ${startedAt}\n`);

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const allArticles: ScrapedArticle[] = [];

  const config = getConfig();
  const enabledFeeds = (config.rssFeeds ?? []).filter((f) => f.enabled);

  if (enabledFeeds.length === 0) {
    console.log("⚠️  No RSS feeds enabled in config — skipping scrape.");
    return;
  }

  for (const feed of enabledFeeds) {
    console.log(`⏳ Scraping ${feed.name}…`);
    try {
      const result = await scrapeRssFeed(feed.url, feed.name);
      if (result.error) {
        console.error(`  ❌ ${feed.name}: ERROR — ${result.error}`);
      } else {
        console.log(`  ✅ ${feed.name}: ${result.articles.length} articles found`);
        allArticles.push(...result.articles);
      }
    } catch (err) {
      console.error(
        `  ❌ ${feed.name}: UNEXPECTED ERROR — ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  // Deduplicate by URL
  const seen = new Map<string, ScrapedArticle>();
  for (const article of allArticles) {
    if (!seen.has(article.url)) {
      seen.set(article.url, article);
    }
  }
  const deduped = [...seen.values()];
  const duplicatesRemoved = allArticles.length - deduped.length;
  if (duplicatesRemoved > 0) {
    console.log(`\n🔁 Removed ${duplicatesRemoved} duplicate(s)`);
  }

  const output: ScraperOutput = {
    scraped_at: startedAt,
    total: deduped.length,
    articles: deduped,
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), "utf-8");
  recordHistory(startedAt, deduped.length, source);

  // Sync to Supabase so web admin can read it
  let history: object[] = [];
  try { history = JSON.parse(fs.readFileSync(HISTORY_FILE, "utf-8")); } catch {}
  await syncScrapeCache(startedAt, deduped.length, deduped, history);

  console.log(`\n✅ Done. ${deduped.length} articles saved to ${OUTPUT_FILE}\n`);
}

if (require.main === module) {
  const standaloneSource = (process.env.SCRAPE_SOURCE as "manual" | "auto") || "auto";
  main(standaloneSource).catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
}
