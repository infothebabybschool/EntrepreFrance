import * as https from "https";
import { pickImage, DEFAULT_SOURCES } from "./lib/image-sources";
import { generateImage } from "./lib/image-gen";
import { uploadImageFromUrl } from "./lib/image-storage";
import { log, logError } from "./lib/logger";
import { getConfig } from "./lib/config";
import { recordImageCost } from "./lib/sync";
import { WrittenArticle, ReadyArticle } from "./types";

/** Fetch featured_image_url values used in articles published in the last 30 days. */
async function fetchRecentImageUrls(): Promise<Set<string>> {
  const base = process.env.WEBSITE_URL;
  if (!base) return new Set();

  try {
    const url = `${base}/api/articles?limit=100`;
    const body = await new Promise<string>((resolve, reject) => {
      https.get(url, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => resolve(data));
      }).on("error", reject);
    });
    const { articles } = JSON.parse(body) as { articles: { featured_image_url: string | null; published_at: string | null }[] };
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const urls = new Set<string>();
    for (const a of articles ?? []) {
      if (a.featured_image_url && a.published_at && new Date(a.published_at).getTime() >= cutoff) {
        urls.add(a.featured_image_url);
      }
    }
    log("images", `Loaded ${urls.size} recently used image URL(s) for dedup`);
    return urls;
  } catch (err) {
    log("images", `Could not fetch recent image URLs for dedup: ${err instanceof Error ? err.message : String(err)}`);
    return new Set();
  }
}

/** Convert "HH:MM" (in the given timezone) to a UTC Date for the given calendar day. */
function timeStrToUtc(timeStr: string, timezone: string, today: Date): Date {
  const [hour, minute] = timeStr.split(":").map(Number);
  const dateStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(today);
  const [year, month, day] = dateStr.split("-").map(Number);
  const testDate = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  const tzNoon = parseInt(
    new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "numeric",
      hour12: false,
    }).format(testDate),
    10
  );
  const offset = tzNoon - 12;
  return new Date(Date.UTC(year, month - 1, day, hour - offset, minute, 0, 0));
}

/** Compute one scheduled_for ISO string per article based on the configured posting mode. */
function computeScheduledTimes(count: number, today: Date): string[] {
  const cfg = getConfig();
  const { mode, firstPostTime, intervalMinutes, randomMin, randomMax, specificTimes } = cfg.posting;
  const timezone = cfg.schedule.timezone;
  const baseMs = timeStrToUtc(firstPostTime, timezone, today).getTime();
  const results: string[] = [];

  switch (mode) {
    case "same-time":
      for (let i = 0; i < count; i++) results.push(new Date(baseMs).toISOString());
      break;

    case "interval":
      for (let i = 0; i < count; i++)
        results.push(new Date(baseMs + i * intervalMinutes * 60_000).toISOString());
      break;

    case "random": {
      let ms = baseMs;
      for (let i = 0; i < count; i++) {
        results.push(new Date(ms).toISOString());
        if (i < count - 1)
          ms += (randomMin + Math.random() * (randomMax - randomMin)) * 60_000;
      }
      break;
    }

    case "specific":
      for (let i = 0; i < count; i++) {
        const t = specificTimes?.[i] ?? firstPostTime;
        results.push(timeStrToUtc(t, timezone, today).toISOString());
      }
      break;

    default:
      for (let i = 0; i < count; i++)
        results.push(new Date(baseMs + i * intervalMinutes * 60_000).toISOString());
  }

  return results;
}

const IMAGE_CONFIG_DEFAULTS = {
  enabled: false,
  relevanceThreshold: 5,
  generationStyle: "photorealistic editorial news photo, professional lighting, no text overlay, no logo",
  strategy: "priority" as const,
  sources: DEFAULT_SOURCES,
};

export async function enrichWithImages(articles: WrittenArticle[]): Promise<ReadyArticle[]> {
  log("images", `Sourcing images for ${articles.length} articles…`);
  const today = new Date();
  const scheduledTimes = computeScheduledTimes(articles.length, today);
  const cfg = getConfig();
  const imgCfg = { ...IMAGE_CONFIG_DEFAULTS, ...(cfg.images ?? {}) };
  const ready: ReadyArticle[] = [];

  const usedUrls = await fetchRecentImageUrls();

  for (let i = 0; i < articles.length; i++) {
    const article = articles[i];
    log("images", `Image ${i + 1}/${articles.length}: keywords=[${article.image_keywords.join(", ")}]`);

    let pick = await pickImage(article, usedUrls, {
      strategy: imgCfg.strategy,
      sources: imgCfg.sources,
      imagesEnabled: imgCfg.enabled,
      relevanceThreshold: imgCfg.relevanceThreshold,
    });

    let featured_image_url = pick.featured_image_url;
    let image_credit = pick.image_credit;
    let image_source = pick.image_source as ReadyArticle["image_source"];
    const image_relevance_score = pick.image_relevance_score;

    if (pick.needsAIGeneration) {
      log("images", `  Attempting DALL-E 3 generation…`);
      try {
        const generated = await generateImage(article.title, article.image_keywords, imgCfg.generationStyle);
        if (generated) {
          const filename = `${article.slug}-${Date.now()}.png`;
          const uploadedUrl = await uploadImageFromUrl(generated.imageUrl, filename);
          if (uploadedUrl) {
            featured_image_url = uploadedUrl;
            image_credit = "Illustration IA";
            image_source = "ai-generated";
            log("images", `  ✅ AI image stored: ${uploadedUrl.slice(0, 80)}`);
            await recordImageCost();
          } else {
            log("images", `  ⚠️  Upload failed — publishing without image`);
          }
        } else {
          log("images", `  ⚠️  Generation failed — publishing without image`);
        }
      } catch (err) {
        logError("images", `AI image generation error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (!featured_image_url) {
      log("images", `  ⚠️  No image — publishing without featured image`);
    } else if (pick.image_source) {
      log("images", `  ✅ Image from ${image_source}: ${featured_image_url.slice(0, 80)}`);
    }

    if (featured_image_url) usedUrls.add(featured_image_url);

    ready.push({
      ...article,
      featured_image_url,
      image_credit,
      image_source,
      image_relevance_score,
      scheduled_for: scheduledTimes[i],
    });
  }

  const withImages = ready.filter((a) => a.featured_image_url !== null).length;
  const aiGenerated = ready.filter((a) => a.image_source === "ai-generated").length;
  log("images", `✅ Done — ${withImages}/${ready.length} articles have images (${aiGenerated} AI-generated)`);
  return ready;
}
