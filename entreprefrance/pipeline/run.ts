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

const OUTPUT_FILE = path.join(process.cwd(), "data", "articles_ready.json");

/** Yield to the event loop so Node can GC between heavy steps. */
function gc(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

async function run(scrapeSource: "manual" | "auto" = "auto"): Promise<void> {
  const startedAt = new Date().toISOString();
  log("pipeline", "â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•");
  log("pipeline", `Pipeline started at ${startedAt}`);
  log("pipeline", "â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•");
  await syncLog("pipeline", "â–¶ Pipeline started â€” step 1/4: scraping RSS feedsâ€¦");

  // Step 0: Scrape fresh articles
  log("pipeline", "STEP 0 â€” Scraping fresh articles");
  try {
    await scrapeArticles(scrapeSource);
    const scrapeFile = path.join(process.cwd(), "data", "scraped_articles.json");
    const scrapeCount = fs.existsSync(scrapeFile)
      ? (JSON.parse(fs.readFileSync(scrapeFile, "utf-8")).total ?? 0) : 0;
    await syncLog("pipeline", `âœ… Step 1/4 done â€” ${scrapeCount} articles scraped`);
  } catch (err) {
    await syncLog("pipeline", `âŒ Step 1/4 FAILED â€” scraping: ${err instanceof Error ? err.message : String(err)}`, true);
    throw err;
  }
  await gc();

  // Step 1: Editorial selection
  log("pipeline", "STEP 1 â€” Editorial selection");
  await syncLog("pipeline", "â–¶ Step 2/4: Claude selecting articlesâ€¦");
  let selected: Awaited<ReturnType<typeof selectArticles>>;
  try {
    selected = await selectArticles();
    await syncLog("pipeline", `âœ… Step 2/4 done â€” ${selected.length} articles selected`);
  } catch (err) {
    await syncLog("pipeline", `âŒ Step 2/4 FAILED â€” selection: ${err instanceof Error ? err.message : String(err)}`, true);
    throw err;
  }
  await gc();

  // Step 2: Article writing
  log("pipeline", "STEP 2 â€” Article writing");
  await syncLog("pipeline", `â–¶ Step 3/4: Claude writing ${selected.length} articlesâ€¦`);
  const selectedCount = selected.length;
  let written: Awaited<ReturnType<typeof writeArticles>>;
  try {
    written = await writeArticles(selected);
    // selected is no longer needed â€” free it for GC
    selected.splice(0);
    await syncLog("pipeline", `âœ… Step 3/4 done â€” ${written.length}/${selectedCount} articles written`);
  } catch (err) {
    await syncLog("pipeline", `âŒ Step 3/4 FAILED â€” writing: ${err instanceof Error ? err.message : String(err)}`, true);
    throw err;
  }
  await gc();

  // Step 3: Image sourcing
  log("pipeline", "STEP 3 â€” Image sourcing");
  await syncLog("pipeline", `â–¶ Step 4/4: sourcing images for ${written.length} articlesâ€¦`);
  let ready: Awaited<ReturnType<typeof enrichWithImages>>;
  try {
    ready = await enrichWithImages(written);
    await syncLog("pipeline", `âœ… Step 4/4 done â€” ${ready.filter((a) => a.featured_image_url).length}/${ready.length} images found`);
  } catch (err) {
    await syncLog("pipeline", `âŒ Step 4/4 FAILED â€” images: ${err instanceof Error ? err.message : String(err)}`, true);
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
  await syncLog("pipeline", `âœ… Pipeline complete â€” ${written.length} articles ready to post`);

  log("pipeline", "â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•");
  log("pipeline", `Pipeline complete:`);
  log("pipeline", `  â€¢ ${selectedCount} articles selected`);
  log("pipeline", `  â€¢ ${written.length} articles written`);
  log("pipeline", `  â€¢ ${ready.filter((a) => a.featured_image_url).length} images sourced`);
  log("pipeline", `  â€¢ Output: ${OUTPUT_FILE}`);
  log("pipeline", "â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•");
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

