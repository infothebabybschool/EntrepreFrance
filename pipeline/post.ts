import * as dotenv from "dotenv";
dotenv.config();
import * as fs from "fs";
import * as path from "path";
import axios from "axios";
import { logScheduler, logSchedulerError } from "./lib/schedulerLogger";
import { syncReadyCache, syncLog } from "./lib/sync";
import { PostedArticle, ArticlesReadyFileOutput } from "./types";

const ARTICLES_FILE = path.join(__dirname, "data", "articles_ready.json");
const TMP_FILE = ARTICLES_FILE + ".tmp";

let isPosting = false;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function postArticle(article: PostedArticle): Promise<boolean> {
  const websiteUrl = process.env.WEBSITE_URL;
  const apiSecret = process.env.ARTICLES_API_SECRET;

  if (!websiteUrl) throw new Error("WEBSITE_URL is not set");
  if (!apiSecret) throw new Error("ARTICLES_API_SECRET is not set");

  const body = {
    title: article.title,
    slug: article.slug,
    chapo: article.chapo,
    body: article.body,
    category: article.category,
    tags: article.tags,
    source_urls: article.source_urls,
    featured_image_url: article.featured_image_url,
    image_credit: article.image_credit,
    journalist_id: article.journalist_id ?? null,
    status: "published",
    published_at: new Date().toISOString(),
  };

  const response = await axios.post(`${websiteUrl}/api/articles`, body, {
    headers: { Authorization: `Bearer ${apiSecret}` },
    timeout: 15000,
  });

  return response.status >= 200 && response.status < 300;
}

export async function checkAndPost(): Promise<void> {
  if (isPosting) {
    logScheduler("poster", "Previous run still in progress — skipping this tick");
    return;
  }

  isPosting = true;
  try {
    await _checkAndPost();
  } finally {
    isPosting = false;
  }
}

async function _checkAndPost(): Promise<void> {
  logScheduler("poster", "Checking for articles to post…");

  if (!fs.existsSync(ARTICLES_FILE)) {
    logScheduler("poster", "No articles_ready.json found — skipping");
    return;
  }

  const fileData: ArticlesReadyFileOutput = JSON.parse(
    fs.readFileSync(ARTICLES_FILE, "utf-8")
  );

  const now = new Date();
  const due = fileData.articles.filter(
    (a) => new Date(a.scheduled_for) <= now && !a.posted && !a.failed
  );

  if (due.length === 0) {
    logScheduler("poster", "No articles due");

    const next = fileData.articles
      .filter((a) => !a.posted && !a.failed)
      .sort((a, b) => new Date(a.scheduled_for).getTime() - new Date(b.scheduled_for).getTime())[0];

    if (next) {
      const nextTime = new Date(next.scheduled_for).toISOString().slice(11, 19);
      logScheduler("poster", `Next article scheduled for ${nextTime} UTC`);
    }
    return;
  }

  logScheduler("poster", `Found ${due.length} article(s) due`);
  await syncLog("poster", `${due.length} article(s) due — starting posting…`);

  for (const article of due) {
    const scheduledTime = new Date(article.scheduled_for).toISOString().slice(11, 19);
    logScheduler("poster", `Posting: "${article.title.slice(0, 70)}" (scheduled ${scheduledTime} UTC)`);
    await syncLog("poster", `Posting: "${article.title.slice(0, 70)}" (scheduled_for: ${article.scheduled_for})`);

    // Find the article in the full array to mutate it
    const target = fileData.articles.find((a) => a.slug === article.slug)!;

    let succeeded = false;

    // First attempt
    try {
      await postArticle(article);
      succeeded = true;
    } catch (err) {
      const msg = axios.isAxiosError(err)
        ? `HTTP ${err.response?.status ?? "network error"}: ${err.message}`
        : String(err);
      logSchedulerError("poster", `First attempt failed: ${msg} — retrying in 30s`);
      await syncLog("poster", `⚠️ First attempt failed: ${msg} — retrying in 30s`, true);
      await sleep(30000);

      // One retry
      try {
        await postArticle(article);
        succeeded = true;
      } catch (retryErr) {
        const retryMsg = axios.isAxiosError(retryErr)
          ? `HTTP ${retryErr.response?.status ?? "network error"}: ${retryErr.message}`
          : String(retryErr);
        logSchedulerError("poster", `Retry failed: ${retryMsg} — marking as failed`);
        await syncLog("poster", `❌ Retry failed: ${retryMsg} — marked as failed`, true);
        target.failed = true;
      }
    }

    if (succeeded) {
      target.posted = true;
      target.posted_at = new Date().toISOString();
      const actualTime = target.posted_at.slice(11, 19);
      logScheduler("poster", `✅ Posted successfully at ${actualTime} UTC`);
      await syncLog("poster", `✅ Posted: "${article.title.slice(0, 70)}" — published_at: ${article.scheduled_for}`);
    }

    // Write back after each article to preserve progress
    fs.writeFileSync(TMP_FILE, JSON.stringify(fileData, null, 2), "utf-8");
    fs.renameSync(TMP_FILE, ARTICLES_FILE);
  }

  // Log next upcoming article
  const next = fileData.articles
    .filter((a) => !a.posted && !a.failed)
    .sort((a, b) => new Date(a.scheduled_for).getTime() - new Date(b.scheduled_for).getTime())[0];

  if (next) {
    const nextTime = new Date(next.scheduled_for).toISOString().slice(11, 19);
    logScheduler("poster", `Next article scheduled for ${nextTime} UTC`);
  } else {
    logScheduler("poster", "All articles for today have been posted");
  }

  // Sync ready cache so the admin panel reflects posted/failed status
  await syncReadyCache(fileData.generated_at, fileData.total, fileData.articles);
}

/** Post a single specific article by slug immediately (used by web admin command). */
export async function checkAndPostBySlug(slug: string): Promise<void> {
  if (!fs.existsSync(ARTICLES_FILE)) throw new Error("No articles_ready.json found");

  const fileData: ArticlesReadyFileOutput = JSON.parse(fs.readFileSync(ARTICLES_FILE, "utf-8"));
  const target = fileData.articles.find((a) => a.slug === slug);
  if (!target) throw new Error(`Article not found: ${slug}`);
  if (target.posted) {
    // Article was already auto-posted — sync cache so admin panel reflects the correct state
    logScheduler("poster", `Article already posted: ${slug} — syncing cache`);
    await syncReadyCache(fileData.generated_at, fileData.total, fileData.articles);
    return;
  }

  // Override published_at to NOW so the article is immediately visible on the site
  const now = new Date().toISOString();
  const articleToPost = { ...target, scheduled_for: now };

  logScheduler("poster", `Posting by command: "${target.title.slice(0, 70)}"`);
  await syncLog("poster", `Posting article: "${target.title.slice(0, 70)}"`);
  await postArticle(articleToPost);
  target.posted = true;
  target.posted_at = now;
  target.scheduled_for = now;

  fs.writeFileSync(ARTICLES_FILE + ".tmp", JSON.stringify(fileData, null, 2), "utf-8");
  fs.renameSync(ARTICLES_FILE + ".tmp", ARTICLES_FILE);
  await syncReadyCache(fileData.generated_at, fileData.total, fileData.articles);
  logScheduler("poster", `✅ Posted: ${slug}`);
  await syncLog("poster", `✅ Posted: "${target.title.slice(0, 70)}" (${slug})`);
}

// Run standalone: npm run post-now
if (require.main === module) {
  checkAndPost().catch((err) => {
    logSchedulerError("poster", err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
