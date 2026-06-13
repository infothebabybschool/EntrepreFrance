import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { ADMIN_USER_IDS } from "@/lib/admin";

export const maxDuration = 30;

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

type ScrapedArticle = { title: string; url: string; description: string; pubDate: string; imageUrl?: string };

/**
 * GDELT v2 DOC API — free, no key needed, covers global news from 2015+.
 * Queries for French-language Belgian news for a given month.
 */
async function scrapeGDELT(year: number, month: number): Promise<ScrapedArticle[]> {
  const daysInMonth = new Date(year, month, 0).getDate();
  const start = `${year}${pad2(month)}01000000`;
  const end   = `${year}${pad2(month)}${pad2(daysInMonth)}235959`;

  // Belgian/French news: query for common Belgian topics + French language filter
  const query = encodeURIComponent(
    "(belgique OR bruxelles OR wallonie OR flandre) sourcelang:French"
  );
  const url =
    `https://api.gdeltproject.org/api/v2/doc/doc` +
    `?query=${query}` +
    `&mode=artlist` +
    `&format=json` +
    `&startdatetime=${start}` +
    `&enddatetime=${end}` +
    `&maxrecords=100` +
    `&sort=DateDesc`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) return [];
    const data = await res.json();

    const articles: ScrapedArticle[] = (data.articles ?? [])
      .filter((a: { title?: string; url?: string }) => a.title && a.url)
      .map((a: { title: string; url: string; seendate?: string; socialimage?: string }) => ({
        title: a.title,
        url: a.url,
        description: a.title,
        pubDate: a.seendate ?? "",
        imageUrl: a.socialimage ?? "",   // og:image from the original article
      }));

    return articles;
  } catch {
    return [];
  }
}

/**
 * Wayback Machine CDX fallback — tries to find an archived RSS snapshot.
 * Less reliable for Belgian feeds but useful as a supplementary source.
 */
function parseRSS(xml: string): ScrapedArticle[] {
  const items: ScrapedArticle[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const item = match[1];
    const title =
      item.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/)?.[1]?.trim() ?? "";
    const link =
      item.match(/<link>([^<]+)<\/link>/)?.[1]?.trim() ??
      item.match(/<guid[^>]*isPermaLink="true"[^>]*>([^<]+)<\/guid>/)?.[1]?.trim() ??
      item.match(/<guid[^>]*>([^<]+)<\/guid>/)?.[1]?.trim() ??
      "";
    const description =
      item.match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/)?.[1]?.trim() ?? "";
    const pubDate = item.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1]?.trim() ?? "";
    if (title && link) items.push({ title, url: link, description, pubDate });
  }
  return items;
}

async function scrapeWaybackFeed(feedUrl: string, year: number, month: number): Promise<ScrapedArticle[]> {
  const from = `${year}${pad2(month)}01`;
  const to   = `${year}${pad2(month)}28`;
  const cdxUrl =
    `https://web.archive.org/cdx/search/cdx` +
    `?url=${encodeURIComponent(feedUrl)}` +
    `&output=json&from=${from}&to=${to}&limit=5&filter=statuscode:200&fl=timestamp&collapse=digest`;

  let timestamp: string | null = null;
  try {
    const cdxRes = await fetch(cdxUrl, { signal: AbortSignal.timeout(8000) });
    if (cdxRes.ok) {
      const rows: string[][] = await cdxRes.json();
      if (rows.length > 1) timestamp = rows[rows.length - 1][0];
    }
  } catch { return []; }

  if (!timestamp) return [];

  try {
    const rssRes = await fetch(
      `https://web.archive.org/web/${timestamp}if_/${feedUrl}`,
      { signal: AbortSignal.timeout(12000) }
    );
    if (!rssRes.ok) return [];
    return parseRSS(await rssRes.text());
  } catch { return []; }
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId || !ADMIN_USER_IDS.includes(userId)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { year, month } = (await req.json()) as { year: number; month: number };
  if (!year || !month || month < 1 || month > 12) {
    return NextResponse.json({ error: "Invalid year/month" }, { status: 400 });
  }

  // Run GDELT (primary) and Wayback Machine (secondary) in parallel
  // GDELT is the main source for historical Belgian news
  const { createServerClient } = await import("@/lib/supabase/server");
  const supabase = createServerClient();
  const { data: configRow } = await supabase
    .from("pipeline_config")
    .select("config")
    .eq("id", 1)
    .maybeSingle();

  type RssFeed = { name: string; url: string; enabled: boolean };
  const feeds: RssFeed[] = (configRow?.config?.rssFeeds ?? []).filter((f: RssFeed) => f.enabled);

  const [gdeltArticles, ...waybackResults] = await Promise.allSettled([
    scrapeGDELT(year, month),
    ...feeds.map((f) => scrapeWaybackFeed(f.url, year, month)),
  ]);

  const seen = new Set<string>();
  const articles: ScrapedArticle[] = [];

  function addArticles(list: ScrapedArticle[]) {
    for (const a of list) {
      if (a.url && !seen.has(a.url)) {
        seen.add(a.url);
        articles.push(a);
      }
    }
  }

  // GDELT first (primary source)
  if (gdeltArticles.status === "fulfilled") addArticles(gdeltArticles.value);

  // Wayback Machine supplements
  for (const r of waybackResults) {
    if (r.status === "fulfilled") addArticles(r.value);
  }

  return NextResponse.json({ articles, month, year, total: articles.length });
}
