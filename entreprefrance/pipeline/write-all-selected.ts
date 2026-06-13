import * as dotenv from "dotenv";
dotenv.config();
import * as fs from "fs";
import * as path from "path";
import { generateSingleArticle } from "./write-single";
import { log, logError } from "./lib/logger";

const SELECTED_FILE = path.join(process.cwd(), "data", "selected_articles.json");

async function run(): Promise<void> {
  if (!fs.existsSync(SELECTED_FILE)) throw new Error("selected_articles.json not found");

  const selectedData = JSON.parse(fs.readFileSync(SELECTED_FILE, "utf-8"));
  const articles = selectedData.articles as Array<{ source_urls?: string[]; source_url?: string; headlines?: string[]; headline?: string }>;

  log("write-all", `Generating ${articles.length} articles from selectionâ€¦`);

  let success = 0;
  let failed = 0;

  for (let i = 0; i < articles.length; i++) {
    const a = articles[i];
    const primaryUrl = (a.source_urls ?? [a.source_url!])[0];
    const primaryHeadline = (a.headlines ?? [a.headline ?? ""])[0];
    log("write-all", `Article ${i + 1}/${articles.length}: "${primaryHeadline.slice(0, 60)}"`);
    try {
      await generateSingleArticle(primaryUrl);
      success++;
    } catch (err) {
      logError("write-all", `Failed: ${err instanceof Error ? err.message : String(err)}`);
      failed++;
    }
  }

  log("write-all", `âœ… Done â€” ${success} generated, ${failed} failed out of ${articles.length}`);
}

run().catch((err) => {
  logError("write-all", err instanceof Error ? err.message : String(err));
  process.exit(1);
});

