import * as https from "https";
import { log, logError } from "./logger";

interface PexelsPhoto {
  id: number;
  photographer: string;
  src: {
    original: string;
    large: string;
    medium: string;
  };
}

interface PexelsResponse {
  photos: PexelsPhoto[];
  total_results: number;
}

function httpsGet(url: string, apiKey: string): Promise<{ body: string; status: number }> {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { Authorization: apiKey } }, (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => resolve({ body, status: res.statusCode ?? 0 }));
      })
      .on("error", reject);
  });
}

/**
 * Search Pexels for a landscape photo matching the given keywords.
 * Skips URLs already present in usedUrls (dedup across recent articles).
 * Returns null for both fields if nothing is found.
 */
export async function findPexelsImage(
  keywords: string[],
  usedUrls: Set<string> = new Set()
): Promise<{ featured_image_url: string | null; image_credit: string | null }> {
  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey) {
    logError("pexels", "PEXELS_API_KEY is not set — skipping image search");
    return { featured_image_url: null, image_credit: null };
  }

  // Try with all keywords first, then fall back to first keyword alone
  const queries = [keywords.join(" "), keywords[0]];

  for (const query of queries) {
    try {
      const encoded = encodeURIComponent(query);
      const url = `https://api.pexels.com/v1/search?query=${encoded}&per_page=15&orientation=landscape`;
      const { body, status } = await httpsGet(url, apiKey);

      if (status !== 200) {
        let errMsg = `HTTP ${status}`;
        try {
          const errData = JSON.parse(body) as { error?: string };
          if (errData.error) errMsg += `: ${errData.error}`;
        } catch {}
        logError("pexels", `API error for "${query}": ${errMsg}`);
        return { featured_image_url: null, image_credit: null };
      }

      let data: PexelsResponse;
      try {
        data = JSON.parse(body) as PexelsResponse;
      } catch {
        logError("pexels", `Non-JSON response for "${query}": ${body.slice(0, 200)}`);
        continue;
      }
      if ((data as unknown as { error?: string }).error) {
        logError("pexels", `API error for "${query}": ${(data as unknown as { error: string }).error}`);
        continue;
      }

      if (data.photos && data.photos.length > 0) {
        const photo = data.photos.find((p) => !usedUrls.has(p.src.large));
        if (photo) {
          log("pexels", `Found image for "${query}": ${photo.src.large}`);
          return {
            featured_image_url: photo.src.large,
            image_credit: `${photo.photographer} / Pexels`,
          };
        }
        log("pexels", `All ${data.photos.length} results for "${query}" already used — ${queries.indexOf(query) === 0 ? "trying fallback..." : "giving up."}`);
        continue;
      }

      log("pexels", `No results for "${query}", ${queries.indexOf(query) === 0 ? "trying fallback..." : "giving up."}`);
    } catch (err) {
      logError("pexels", `Request failed for "${query}": ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { featured_image_url: null, image_credit: null };
}
