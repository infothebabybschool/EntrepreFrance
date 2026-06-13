import * as dotenv from "dotenv";
dotenv.config();
import * as fs from "fs";
import * as path from "path";
import { selectArticles } from "./select";
import { getConfig } from "./lib/config";
import { log, logError } from "./lib/logger";

const OUTPUT_FILE = path.join(process.cwd(), "data", "selected_articles.json");

async function run(): Promise<void> {
  const mode = (process.env.SELECTION_MODE as "refresh" | "add-more") || "refresh";
  const { articlesPerDay } = getConfig().pipeline;

  if (mode === "refresh") {
    log("select-standalone", `Mode: refresh â€” selecting ${articlesPerDay} articles from scratch`);
    const selected = await selectArticles({ count: articlesPerDay });
    const output = {
      selected_at: new Date().toISOString(),
      total: selected.length,
      articles: selected.map(a => ({ ...a, added_by: "claude" as const })),
    };
    fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), "utf-8");
    log("select-standalone", `âœ… ${selected.length} articles selected`);

  } else {
    // add-more: read existing selection, add Claude picks for the remaining slots
    let existing: any = { articles: [] };
    if (fs.existsSync(OUTPUT_FILE)) {
      existing = JSON.parse(fs.readFileSync(OUTPUT_FILE, "utf-8"));
    }

    const alreadySelected = existing.articles as any[];
    const remaining = articlesPerDay - alreadySelected.length;

    if (remaining <= 0) {
      log("select-standalone", `Selection already full (${alreadySelected.length}/${articlesPerDay}) â€” nothing to add`);
      return;
    }

    const excludeUrls = alreadySelected.flatMap((a: any) => Array.isArray(a.source_urls) ? a.source_urls : [a.source_url].filter(Boolean));
    log("select-standalone", `Mode: add-more â€” selecting ${remaining} more (${alreadySelected.length} already selected)`);

    const added = await selectArticles({ count: remaining, excludeUrls });
    const merged = [
      ...alreadySelected,
      ...added.map(a => ({ ...a, added_by: "claude" as const })),
    ];

    const output = {
      selected_at: new Date().toISOString(),
      total: merged.length,
      articles: merged,
    };
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), "utf-8");
    log("select-standalone", `âœ… ${added.length} articles added â€” total ${merged.length}/${articlesPerDay}`);
  }
}

run().catch((err) => {
  logError("select-standalone", err instanceof Error ? err.message : String(err));
  process.exit(1);
});

