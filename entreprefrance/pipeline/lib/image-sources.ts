import { findPexelsImage } from "./pexels";
import { findUnsplashImage } from "./unsplash";
import { findPixabayImage } from "./pixabay";
import { findOpenverseImage } from "./openverse";
import { evaluateImageRelevance } from "./image-eval";
import { log } from "./logger";
import { SourceName, ImageSourceConfig, ImageStrategy } from "./config";
import { WrittenArticle } from "../types";

type SearchFn = (keywords: string[], usedUrls: Set<string>) => Promise<{ featured_image_url: string | null; image_credit: string | null }>;

const registry: Record<SourceName, SearchFn> = {
  pexels: findPexelsImage,
  unsplash: findUnsplashImage,
  pixabay: findPixabayImage,
  openverse: findOpenverseImage,
};

export interface PickResult {
  featured_image_url: string | null;
  image_credit: string | null;
  image_source: SourceName | null;
  image_relevance_score?: number;
  needsAIGeneration: boolean;
}

export interface PickOpts {
  strategy: ImageStrategy;
  sources: ImageSourceConfig[];
  imagesEnabled: boolean;
  relevanceThreshold: number;
}

interface Hit {
  url: string;
  credit: string;
}

async function searchSource(name: SourceName, keywords: string[], usedUrls: Set<string>): Promise<Hit | null> {
  try {
    const { featured_image_url, image_credit } = await registry[name](keywords, usedUrls);
    if (!featured_image_url || !image_credit) return null;
    return { url: featured_image_url, credit: image_credit };
  } catch (err) {
    log("image-sources", `  ${name}: exception — ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

function hitToResult(hit: Hit, name: SourceName, score?: number): PickResult {
  return {
    featured_image_url: hit.url,
    image_credit: hit.credit,
    image_source: name,
    image_relevance_score: score,
    needsAIGeneration: false,
  };
}

function aiResult(score?: number): PickResult {
  return { featured_image_url: null, image_credit: null, image_source: null, image_relevance_score: score, needsAIGeneration: true };
}

function noImageResult(): PickResult {
  return { featured_image_url: null, image_credit: null, image_source: null, needsAIGeneration: false };
}

function weightedPick(sources: ImageSourceConfig[]): ImageSourceConfig {
  const total = sources.reduce((sum, s) => sum + (s.weight || 0), 0);
  if (total === 0) return sources[0];
  let r = Math.random() * total;
  for (const s of sources) {
    r -= s.weight || 0;
    if (r <= 0) return s;
  }
  return sources[sources.length - 1];
}

async function runPriority(
  enabled: ImageSourceConfig[],
  keywords: string[],
  usedUrls: Set<string>,
  article: WrittenArticle,
  opts: PickOpts
): Promise<PickResult> {
  for (const src of enabled) {
    const hit = await searchSource(src.name, keywords, usedUrls);
    if (!hit) { log("image-sources", `  ${src.name}: no result`); continue; }
    if (!opts.imagesEnabled) {
      log("image-sources", `  ${src.name}: found (scoring off)`);
      return hitToResult(hit, src.name);
    }
    const { score } = await evaluateImageRelevance(hit.url, article.title, article.chapo, article.image_keywords);
    const passes = score >= opts.relevanceThreshold;
    log("image-sources", `  ${src.name}: score ${score}/10 ${passes ? "✓" : "✗ — trying next source"}`);
    if (passes) return hitToResult(hit, src.name, score);
  }
  log("image-sources", `  All sources exhausted — requesting AI generation as last resort`);
  return aiResult();
}

async function runWeighted(
  enabled: ImageSourceConfig[],
  keywords: string[],
  usedUrls: Set<string>,
  article: WrittenArticle,
  opts: PickOpts
): Promise<PickResult> {
  const picked = weightedPick(enabled);
  log("image-sources", `  Weighted pick: ${picked.name}`);

  const hit = await searchSource(picked.name, keywords, usedUrls);
  if (hit) {
    if (!opts.imagesEnabled) return hitToResult(hit, picked.name);
    const { score } = await evaluateImageRelevance(hit.url, article.title, article.chapo, article.image_keywords);
    const passes = score >= opts.relevanceThreshold;
    log("image-sources", `  ${picked.name}: score ${score}/10 ${passes ? "✓" : "✗ → AI"}`);
    return passes ? hitToResult(hit, picked.name, score) : aiResult(score);
  }

  // Picked source empty — fall through remaining in array order
  log("image-sources", `  ${picked.name}: no result — falling through remaining`);
  for (const src of enabled.filter((s) => s.name !== picked.name)) {
    const fallback = await searchSource(src.name, keywords, usedUrls);
    if (!fallback) { log("image-sources", `  ${src.name}: no result`); continue; }
    if (!opts.imagesEnabled) return hitToResult(fallback, src.name);
    const { score } = await evaluateImageRelevance(fallback.url, article.title, article.chapo, article.image_keywords);
    const passes = score >= opts.relevanceThreshold;
    log("image-sources", `  ${src.name}: score ${score}/10 ${passes ? "✓" : "✗ → AI"}`);
    return passes ? hitToResult(fallback, src.name, score) : aiResult(score);
  }

  log("image-sources", `  All sources empty — requesting AI generation as last resort`);
  return aiResult();
}

async function runBestOfAll(
  enabled: ImageSourceConfig[],
  keywords: string[],
  usedUrls: Set<string>,
  article: WrittenArticle,
  opts: PickOpts
): Promise<PickResult> {
  const searchResults = await Promise.all(
    enabled.map(async (src) => ({ name: src.name, hit: await searchSource(src.name, keywords, usedUrls) }))
  );
  const candidates = searchResults.filter((r): r is { name: SourceName; hit: Hit } => r.hit !== null);
  log("image-sources", `  Best-of-all: ${candidates.length}/${enabled.length} sources returned results`);

  if (candidates.length === 0) {
    log("image-sources", `  No candidates — requesting AI generation as last resort`);
    return aiResult();
  }

  if (!opts.imagesEnabled) return hitToResult(candidates[0].hit, candidates[0].name);

  const scored = await Promise.all(
    candidates.map(async ({ name, hit }) => {
      const { score } = await evaluateImageRelevance(hit.url, article.title, article.chapo, article.image_keywords);
      log("image-sources", `    ${name}: score ${score}/10`);
      return { name, hit, score };
    })
  );

  const best = scored.reduce((a, b) => (a.score > b.score ? a : b));
  log("image-sources", `  Best: ${best.name} (${best.score}/10)`);

  if (best.score >= opts.relevanceThreshold) return hitToResult(best.hit, best.name, best.score);

  log("image-sources", `  Best score (${best.score}) below threshold — requesting AI`);
  return aiResult(best.score);
}

export const DEFAULT_SOURCES: ImageSourceConfig[] = [
  { name: "pexels",    enabled: true,  weight: 25 },
  { name: "unsplash",  enabled: false, weight: 25 },
  { name: "pixabay",   enabled: false, weight: 25 },
  { name: "openverse", enabled: false, weight: 25 },
];

export async function pickImage(
  article: WrittenArticle,
  usedUrls: Set<string>,
  opts: PickOpts
): Promise<PickResult> {
  const enabled = opts.sources.filter((s) => s.enabled);
  if (enabled.length === 0) {
    log("image-sources", `  No enabled sources — requesting AI generation as last resort`);
    return aiResult();
  }

  log("image-sources", `  Strategy: ${opts.strategy}, sources: [${enabled.map((s) => s.name).join(", ")}]`);

  switch (opts.strategy) {
    case "priority":    return runPriority(enabled, article.image_keywords, usedUrls, article, opts);
    case "weighted":    return runWeighted(enabled, article.image_keywords, usedUrls, article, opts);
    case "best-of-all": return runBestOfAll(enabled, article.image_keywords, usedUrls, article, opts);
    default:            return runPriority(enabled, article.image_keywords, usedUrls, article, opts);
  }
}
