import * as fs from "fs";
import * as path from "path";
import axios from "axios";
import { StructureId } from "./article-structures";

export type PostingMode = "interval" | "same-time" | "random" | "specific";

export type SourceName = "pexels" | "unsplash" | "pixabay" | "openverse";
export type ImageStrategy = "priority" | "weighted" | "best-of-all";

export interface ImageSourceConfig {
  name: SourceName;
  enabled: boolean;
  weight: number;
}

export interface RssFeed {
  name: string;
  url: string;
  enabled: boolean;
}

export interface PipelineConfig {
  schedule: {
    time: string;      // "HH:MM" in schedule.timezone
    timezone: string;  // single timezone applied to all times
  };
  pipeline: {
    articlesPerDay: number;
    minArticlesRequired: number;
    topicRepetitionWeight: number;
  };
  posting: {
    mode: PostingMode;
    firstPostTime: string;    // "HH:MM" — used by interval, random, same-time
    intervalMinutes: number;  // used by interval
    randomMin: number;        // used by random (minutes)
    randomMax: number;        // used by random (minutes)
    specificTimes: string[];  // used by specific — one "HH:MM" per article
  };
  rssFeeds: RssFeed[];
  images: {
    enabled: boolean;               // master ON/OFF for relevance scoring + AI generation
    relevanceThreshold: number;     // 1-10; images scoring below this get replaced
    generationStyle: string;
    costLog?: Record<string, number>; // YYYY-MM-DD → number of AI images generated that day
    strategy?: ImageStrategy;       // how to combine sources
    sources?: ImageSourceConfig[];  // ordered list of image sources (order = priority)
  };
  articleStructure?: {
    mode: "fixed" | "auto" | "per-journalist";
    fixed?: StructureId;        // structure used when mode === "fixed"
    allowlist?: StructureId[];  // allowed structures when mode === "auto"
  };
}

const CONFIG_FILE = path.join(__dirname, "..", "config.json");

// In-memory cache — updated by refreshConfigFromApi()
let _cache: PipelineConfig | null = null;

export function getConfig(): PipelineConfig {
  if (_cache) return _cache;
  const fromFile: PipelineConfig = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
  _cache = fromFile;
  return fromFile;
}

/**
 * Fetch the latest config from the web API and update the in-memory cache.
 * Falls back silently to the cached/file value on any error.
 * Called by the scheduler every minute.
 */
export async function refreshConfigFromApi(): Promise<void> {
  const websiteUrl = process.env.WEBSITE_URL;
  const apiSecret = process.env.ARTICLES_API_SECRET;
  if (!websiteUrl || !apiSecret) return;

  try {
    const res = await axios.get<{ config: PipelineConfig }>(
      `${websiteUrl}/api/pipeline/config`,
      { headers: { Authorization: `Bearer ${apiSecret}` }, timeout: 5000 }
    );
    const newConfig = res.data.config;
    _cache = newConfig;
    // Keep config.json in sync as local fallback
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(newConfig, null, 2), "utf-8");
  } catch {
    // Keep using cached/file config — silent fail
  }
}
