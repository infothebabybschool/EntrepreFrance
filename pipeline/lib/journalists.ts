import axios from "axios";
import { log } from "./logger";

export interface PipelineJournalist {
  id: string;
  name: string;
  slug: string;
  specializations: string[];
  article_structure: string | null;
  active: boolean;
}

let cached: PipelineJournalist[] | null = null;

export async function fetchJournalists(): Promise<PipelineJournalist[]> {
  if (cached !== null) return cached;

  const base = process.env.WEBSITE_URL;
  const secret = process.env.ARTICLES_API_SECRET;

  if (!base || !secret) {
    log("journalists", "WEBSITE_URL or ARTICLES_API_SECRET not set — skipping journalist fetch");
    cached = [];
    return [];
  }

  try {
    const res = await axios.get(`${base}/api/pipeline/journalists`, {
      headers: { Authorization: `Bearer ${secret}` },
      timeout: 8000,
    });
    cached = (res.data.journalists ?? []) as PipelineJournalist[];
    log("journalists", `Fetched ${cached.length} journalists`);
  } catch (err) {
    log("journalists", `Failed to fetch journalists: ${err instanceof Error ? err.message : String(err)}`);
    cached = [];
  }

  return cached;
}

/** Pick a journalist matching the article category. Falls back to any active journalist. Returns null if none. */
export function selectJournalist(category: string, journalists: PipelineJournalist[]): PipelineJournalist | null {
  if (!journalists.length) return null;

  const matching = journalists.filter((j) => j.specializations.includes(category));
  const pool = matching.length > 0 ? matching : journalists;
  const picked = pool[Math.floor(Math.random() * pool.length)];
  log("journalists", `Journalist assigned: ${picked.name} (category: ${category})`);
  return picked;
}

/** Reset cache — call between pipeline runs if needed. */
export function resetJournalistCache() {
  cached = null;
}
