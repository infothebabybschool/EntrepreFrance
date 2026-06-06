import * as https from "https";
import * as http from "http";
import { ScrapedArticle, ScrapeResult } from "../types";

function fetchRss(url: string, redirectCount = 0): Promise<string> {
  if (redirectCount > 3) return Promise.reject(new Error("Too many redirects"));

  const lib = url.startsWith("https") ? https : http;

  return new Promise((resolve, reject) => {
    const req = lib.get(url, { headers: { "User-Agent": "Mozilla/5.0 BEpaper-Bot" } }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchRss(res.headers.location, redirectCount + 1).then(resolve).catch(reject);
      }
      if (res.statusCode && res.statusCode >= 400) {
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => resolve(body));
    });

    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error("Timeout after 10s"));
    });

    req.on("error", reject);
  });
}

function parseXmlField(xml: string, tag: string): string | null {
  const cdataMatch = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`).exec(xml);
  if (cdataMatch) return cdataMatch[1].trim() || null;
  const plainMatch = new RegExp(`<${tag}[^>]*>([^<]*)<\\/${tag}>`).exec(xml);
  return plainMatch ? plainMatch[1].trim() || null : null;
}

function parseAttrField(xml: string, tag: string, attr: string): string | null {
  const match = new RegExp(`<${tag}[^>]*${attr}="([^"]*)"[^>]*/?>`).exec(xml);
  return match ? match[1].trim() || null : null;
}

function categoryFromUrl(url: string): string | null {
  try {
    const parts = new URL(url).pathname.split("/").filter(Boolean);
    return parts[0] ?? null;
  } catch {
    return null;
  }
}

export async function scrapeRssFeed(feedUrl: string, sourceName: string): Promise<ScrapeResult> {
  try {
    const xml = await fetchRss(feedUrl);

    const itemBlocks = xml.match(/<item[\s>][\s\S]*?<\/item>/g) ?? [];

    const articles: ScrapedArticle[] = [];
    const seen = new Set<string>();

    for (const item of itemBlocks.slice(0, 15)) {
      try {
        const headline = parseXmlField(item, "title");
        if (!headline || headline.length < 5) continue;

        const url =
          parseXmlField(item, "link") ??
          parseXmlField(item, "guid") ??
          "";
        if (!url || !url.startsWith("http")) continue;
        if (seen.has(url)) continue;
        seen.add(url);

        const summary = parseXmlField(item, "description");

        const pubDateRaw = parseXmlField(item, "pubDate");
        const published_at = pubDateRaw ? new Date(pubDateRaw).toISOString() : null;

        const thumbnail_url =
          parseAttrField(item, "media:content", "url") ??
          parseAttrField(item, "enclosure", "url") ??
          null;

        const categoryRaw = parseXmlField(item, "category");
        const category = categoryRaw || categoryFromUrl(url);

        articles.push({
          source: sourceName,
          headline,
          summary: summary && summary !== headline ? summary : null,
          url,
          category,
          published_at,
          thumbnail_url,
        });
      } catch {
        // Skip malformed item
      }
    }

    return { articles };
  } catch (err) {
    return {
      articles: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
