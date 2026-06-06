import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import Anthropic from "@anthropic-ai/sdk";
import { createServerClient } from "@/lib/supabase/server";
import { ADMIN_USER_IDS } from "@/lib/admin";

export const maxDuration = 60;

const EDITORIAL = `
Belgian French-language news site, neutral and factual. Audience: Belgians 30-50 years old.
Tone: neutral, factual, never sensationalist. Short sentences (max 20 words).
Topics: Belgian politics, Europe, economy, society, culture.
Title: informative, max 10 words. Chapô: 2-3 sentences (who/what/when/where).
Body: 400-600 words, 3-4 HTML paragraphs (<p> tags only).
`.trim();

function getAnthropicClient() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY not set");
  return new Anthropic({ apiKey: key });
}

type ScrapedArticle = { title: string; url: string; description: string; pubDate?: string; imageUrl?: string };

/**
 * When no scraped articles are available, generate a realistic topic
 * from Claude's training knowledge for the target month/year.
 */
async function generateSyntheticTopic(
  year: number,
  month: number,
  client: Anthropic
): Promise<ScrapedArticle | null> {
  const monthLabel = new Date(year, month - 1, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
  const prompt = `You are an editorial assistant for a Belgian French-language news site.
Based on your knowledge, suggest ONE realistic news event or topic that occurred in Belgium in ${monthLabel}.
Focus on: politics, economy, society, European affairs, culture.
Return ONLY valid JSON (no markdown):
{"title": "...", "description": "2-3 sentence factual summary of what happened"}`;

  try {
    const msg = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 300,
      messages: [{ role: "user", content: prompt }],
    });
    const text = msg.content[0].type === "text" ? msg.content[0].text : "";
    const json = text.match(/\{[\s\S]*\}/)?.[0];
    if (!json) return null;
    const { title, description } = JSON.parse(json) as { title: string; description: string };
    if (!title) return null;
    return {
      title,
      url: `synthetic://${year}-${String(month).padStart(2, "0")}-${Date.now()}`,
      description: description ?? title,
    };
  } catch {
    return null;
  }
}

async function writeArticle(
  article: ScrapedArticle,
  client: Anthropic
): Promise<{
  title: string;
  slug: string;
  chapo: string;
  body: string;
  category: string;
  tags: string[];
  image_keywords: string[];
} | null> {
  const isSynthetic = article.url.startsWith("synthetic://");
  const sourceNote = isSynthetic
    ? `Topic: ${article.title}\nContext: ${article.description}`
    : `Title: ${article.title}\nURL: ${article.url}\nDescription: ${article.description ?? ""}`;

  const prompt = `${EDITORIAL}

Write a Belgian French-language news article based on this source:
${sourceNote}

Always write the full article. Reply ONLY with valid JSON:
{
  "title": "...",
  "slug": "kebab-case-max-8-words",
  "chapo": "2-3 sentences summarising who/what/when/where",
  "body": "<p>HTML body with <p> tags only</p>",
  "category": "politique|société|culture|économie|europe",
  "tags": ["tag1","tag2","tag3"],
  "image_keywords": ["word1","word2","word3"]
}`;

  try {
    const msg = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }],
    });
    const text = msg.content[0].type === "text" ? msg.content[0].text : "";
    const json = text.match(/\{[\s\S]*\}/)?.[0];
    if (!json) return null;
    const data = JSON.parse(json);
    if (!data.title || !data.slug || !data.chapo || !data.body || !data.category) return null;
    return {
      title: data.title,
      slug: data.slug,
      chapo: data.chapo,
      body: data.body,
      category: data.category,
      tags: Array.isArray(data.tags) ? data.tags : [],
      image_keywords: Array.isArray(data.image_keywords) ? data.image_keywords : [],
    };
  } catch {
    return null;
  }
}

async function getPexelsImage(keywords: string[]): Promise<{ url: string; credit: string } | null> {
  const key = process.env.PEXELS_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(keywords.slice(0, 3).join(" "))}&per_page=5&orientation=landscape`,
      { headers: { Authorization: key }, signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const photo = data.photos?.[0];
    if (!photo) return null;
    return {
      url: photo.src?.large2x ?? photo.src?.large ?? photo.src?.original,
      credit: `© ${photo.photographer} / Pexels`,
    };
  } catch {
    return null;
  }
}

async function getDallE3Image(
  title: string,
  keywords: string[],
  safe: boolean
): Promise<{ url: string; credit: string } | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  const safeStr = safe ? "safe for all audiences, no violence, no graphic content, " : "";
  const prompt = `Editorial news photograph illustrating: ${title}. ${safeStr}Realistic photojournalism style, no text, no logos, no watermarks. Keywords: ${keywords.slice(0, 3).join(", ")}.`;
  try {
    const res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: "dall-e-3", prompt, n: 1, size: "1024x1024", quality: "standard" }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const imageUrl: string = data.data?.[0]?.url;
    if (!imageUrl) return null;
    const imgRes = await fetch(imageUrl, { signal: AbortSignal.timeout(20000) });
    if (!imgRes.ok) return null;
    const buffer = await imgRes.arrayBuffer();
    const supabase = createServerClient();
    const filename = `articles/${Date.now()}-retro.png`;
    const { error } = await supabase.storage
      .from("article-images")
      .upload(filename, buffer, { contentType: "image/png", upsert: false });
    if (error) return null;
    const { data: urlData } = supabase.storage.from("article-images").getPublicUrl(filename);
    return { url: urlData.publicUrl, credit: "AI-generated image" };
  } catch {
    return null;
  }
}

function selectJournalist(
  category: string,
  journalists: { id: string; specializations: string[] }[]
): string | null {
  if (journalists.length === 0) return null;
  const matching = journalists.filter((j) => j.specializations.includes(category));
  const pool = matching.length > 0 ? matching : journalists;
  return pool[Math.floor(Math.random() * pool.length)].id;
}

function randomDateInMonth(year: number, month: number): string {
  const now = new Date();
  const isCurrentMonth = now.getFullYear() === year && now.getMonth() + 1 === month;
  // For the current partial month, only use days up to yesterday to avoid future dates
  const maxDay = isCurrentMonth
    ? Math.max(1, now.getDate() - 1)
    : Math.min(new Date(year, month, 0).getDate(), 28);
  const day = Math.floor(Math.random() * maxDay) + 1;
  const hour = Math.floor(Math.random() * 12) + 7;
  const min = Math.floor(Math.random() * 60);
  return new Date(year, month - 1, day, hour, min).toISOString();
}

/**
 * Writes exactly ONE article per call.
 * The client loops targetCount times — this keeps each call well under Vercel's 60s limit.
 */
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId || !ADMIN_USER_IDS.includes(userId)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { articles, excludeUrls, year, month, imageMode, safeSensitivity } =
    (await req.json()) as {
      articles: ScrapedArticle[];
      excludeUrls?: string[];
      year: number;
      month: number;
      imageMode: "pexels" | "dalle3";
      safeSensitivity: boolean;
    };

  if (!year || !month) {
    return NextResponse.json({ error: "Missing params" }, { status: 400 });
  }

  const client = getAnthropicClient();
  const supabase = createServerClient();

  const { data: journalistRows } = await supabase
    .from("journalists")
    .select("id, specializations")
    .eq("active", true);
  const journalists = journalistRows ?? [];

  // Pick one source article, excluding already-used ones
  const excluded = new Set(excludeUrls ?? []);
  const candidates = (articles ?? []).filter((a) => a.url && !excluded.has(a.url));

  let src: ScrapedArticle | null = null;
  if (candidates.length > 0) {
    // Random pick from candidates (GDELT already filtered by editorial relevance)
    src = candidates[Math.floor(Math.random() * candidates.length)];
  } else {
    // No scraped articles available — generate a synthetic topic from training knowledge
    src = await generateSyntheticTopic(year, month, client);
  }

  if (!src) {
    return NextResponse.json({ written: 0, sourceUrl: null, errors: ["No source available"] });
  }

  const errors: string[] = [];

  try {
    const art = await writeArticle(src, client);
    if (!art) {
      return NextResponse.json({ written: 0, sourceUrl: src.url, errors: ["Writing failed"] });
    }

    let featured_image_url: string | null = null;
    let image_credit: string | null = null;
    try {
      // 1. Use the article's own og:image from GDELT (no API key needed)
      if (src.imageUrl && src.imageUrl.startsWith("http")) {
        featured_image_url = src.imageUrl;
        image_credit = null;
      } else if (imageMode === "dalle3") {
        // 2. DALL-E 3 if selected
        const img = await getDallE3Image(art.title, art.image_keywords, safeSensitivity);
        if (img) { featured_image_url = img.url; image_credit = img.credit; }
      } else {
        // 3. Pexels (requires PEXELS_API_KEY on Vercel)
        const img = await getPexelsImage(art.image_keywords);
        if (img) { featured_image_url = img.url; image_credit = img.credit; }
      }
    } catch { /* image failure is non-fatal */ }

    const journalist_id = selectJournalist(art.category, journalists);
    const published_at = randomDateInMonth(year, month);
    const slug = `${art.slug}-${year}-${String(month).padStart(2, "0")}`;

    const insert = {
      title: art.title, slug, chapo: art.chapo, body: art.body,
      category: art.category, tags: art.tags,
      source_urls: [src.url], featured_image_url, image_credit,
      journalist_id, status: "published", published_at,
    };

    const { error: insertError } = await supabase.from("articles").insert(insert);

    if (insertError) {
      if (insertError.code === "23505") {
        // Slug collision — retry with timestamp suffix
        const { error: retryErr } = await supabase.from("articles").insert({
          ...insert,
          slug: `${slug}-${Date.now()}`,
        });
        if (retryErr) {
          return NextResponse.json({ written: 0, sourceUrl: src.url, errors: [`DB: ${retryErr.message}`] });
        }
      } else {
        return NextResponse.json({ written: 0, sourceUrl: src.url, errors: [`DB: ${insertError.message}`] });
      }
    }

    return NextResponse.json({ written: 1, sourceUrl: src.url, errors });
  } catch (e) {
    errors.push(String(e));
    return NextResponse.json({ written: 0, sourceUrl: src?.url ?? null, errors });
  }
}
