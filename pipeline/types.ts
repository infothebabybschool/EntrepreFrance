export interface ScrapedArticle {
  source: string;
  headline: string;
  summary: string | null;
  url: string;
  category: string | null;
  published_at: string | null;
  thumbnail_url: string | null;
}

export interface ScrapeResult {
  articles: ScrapedArticle[];
  error?: string;
}

export interface ScraperOutput {
  scraped_at: string;
  total: number;
  articles: ScrapedArticle[];
}

// ── Session 3: Editorial pipeline ────────────────────────────────────────────

export type ArticleCategory =
  | "politique"
  | "société"
  | "culture"
  | "économie"
  | "europe";

/** Claude's selection output — one entry per chosen story (may group multiple sources) */
export interface SelectedArticle {
  source_urls: string[];
  headlines: string[];
  angle: string;
  category: ArticleCategory;
  image_keywords: [string, string, string];
}

/** Claude's writing output — one fully written article */
export interface WrittenArticle {
  title: string;
  slug: string;
  chapo: string;
  body: string;
  category: string;
  tags: string[];
  source_urls: string[];
  image_keywords: string[];
  journalist_id?: string;
  structure_id?: string;
}

/** Final article enriched with image + schedule */
export interface ReadyArticle extends WrittenArticle {
  featured_image_url: string | null;
  image_credit: string | null;
  image_source?: "pexels" | "unsplash" | "pixabay" | "openverse" | "ai-generated";
  image_relevance_score?: number;
  scheduled_for: string;
}

/** The articles_ready.json file structure */
export interface ArticlesReadyOutput {
  generated_at: string;
  total: number;
  articles: ReadyArticle[];
}

// ── Session 4: Scheduler ──────────────────────────────────────────────────────

/** ReadyArticle after the poster has attempted to publish it */
export interface PostedArticle extends ReadyArticle {
  posted?: boolean;    // true after successful POST
  posted_at?: string;  // ISO timestamp of successful post
  failed?: boolean;    // true after one retry still failed — skip in future checks
}

/** articles_ready.json file structure as read/written by the poster */
export interface ArticlesReadyFileOutput {
  generated_at: string;
  total: number;
  articles: PostedArticle[];
}
