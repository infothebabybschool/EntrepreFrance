import * as dotenv from "dotenv";
dotenv.config();
import * as fs from "fs";
import * as path from "path";
import { log, logError } from "./lib/logger";
import { scrapeArticles } from "./scrape";
import { selectArticles } from "./select";
import { writeArticles } from "./write";
import { enrichWithImages } from "./images";
import { syncReadyCache, syncLog } from "./lib/sync";
import { ArticlesReadyOutput } from "./types";

const OUTPUT_FILE = path.join(__dirname, "data", "articles_ready.json");

/** Yield to the event loop so Node can GC between heavy steps. */
function gc(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

async function run(scrapeSource: "manual" | "auto" = "auto"): Promise<void> {
  const startedAt = new Date().toISOString();
  log("pipeline", "═══════════════════════════════════════");
  log("pipeline", `Pipeline started at ${startedAt}`);
  log("pipeline", "═══════════════════════════════════════");
  await syncLog("pipeline", "▶ Pipeline started — step 1/4: scraping RSS feeds…");

  // Step 0: Scrape fresh articles
  log("pipeline", "STEP 0 — Scraping fresh articles");
  try {
    await scrapeArticles(scrapeSource);
    const scrapeFile = path.join(__dirname, "data", "scraped_articles.json");
    const scrapeCount = fs.existsSync(scrapeFile)
      ? (JSON.parse(fs.readFileSync(scrapeFile, "utf-8")).total ?? 0) : 0;
    await syncLog("pipeline", `✅ Step 1/4 done — ${scrapeCount} articles scraped`);
  } catch (err) {
    await syncLog("pipeline", `❌ Step 1/4 FAILED — scraping: ${err instanceof Error ? err.message : String(err)}`, true);
    throw err;
  }
  await gc();

  // Step 1: Editorial selection
  log("pipeline", "STEP 1 — Editorial selection");
  await syncLog("pipeline", "▶ Step 2/4: Claude selecting articles…");
  let selected: Awaited<ReturnType<typeof selectArticles>>;
  try {
    selected = await selectArticles();
    await syncLog("pipeline", `✅ Step 2/4 done — ${selected.length} articles selected`);
  } catch (err) {
    await syncLog("pipeline", `❌ Step 2/4 FAILED — selection: ${err instanceof Error ? err.message : String(err)}`, true);
    throw err;
  }
  await gc();

  // Step 2: Article writing
  log("pipeline", "STEP 2 — Article writing");
  await syncLog("pipeline", `▶ Step 3/4: Claude writing ${selected.length} articles…`);
  const selectedCount = selected.length;
  let written: Awaited<ReturnType<typeof writeArticles>>;
  try {
    written = await writeArticles(selected);
    // selected is no longer needed — free it for GC
    selected.splice(0);
    await syncLog("pipeline", `✅ Step 3/4 done — ${written.length}/${selectedCount} articles written`);
  } catch (err) {
    await syncLog("pipeline", `❌ Step 3/4 FAILED — writing: ${err instanceof Error ? err.message : String(err)}`, true);
    throw err;
  }
  await gc();

  // Step 3: Image sourcing
  log("pipeline", "STEP 3 — Image sourcing");
  await syncLog("pipeline", `▶ Step 4/4: sourcing images for ${written.length} articles…`);
  let ready: Awaited<ReturnType<typeof enrichWithImages>>;
  try {
    ready = await enrichWithImages(written);
    await syncLog("pipeline", `✅ Step 4/4 done — ${ready.filter((a) => a.featured_image_url).length}/${ready.length} images found`);
  } catch (err) {
    await syncLog("pipeline", `❌ Step 4/4 FAILED — images: ${err instanceof Error ? err.message : String(err)}`, true);
    throw err;
  }

  // Write output file
  const output: ArticlesReadyOutput = {
    generated_at: new Date().toISOString(),
    total: ready.length,
    articles: ready,
  };

  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), "utf-8");

  // Sync to Supabase so web admin can read it
  await syncReadyCache(output.generated_at, output.total, output.articles);
  await syncLog("pipeline", `✅ Pipeline complete — ${written.length} articles ready to post`);

  log("pipeline", "═══════════════════════════════════════");
  log("pipeline", `Pipeline complete:`);
  log("pipeline", `  • ${selectedCount} articles selected`);
  log("pipeline", `  • ${written.length} articles written`);
  log("pipeline", `  • ${ready.filter((a) => a.featured_image_url).length} images sourced`);
  log("pipeline", `  • Output: ${OUTPUT_FILE}`);
  log("pipeline", "═══════════════════════════════════════");
}

export { run };

if (require.main === module) {
  run().catch((err) => {
    logError("pipeline", `Fatal error: ${err instanceof Error ? err.message : String(err)}`);
    if (err instanceof Error && err.stack) {
      logError("pipeline", err.stack);
    }
    process.exit(1);
  });
}
