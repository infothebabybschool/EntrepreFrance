import * as https from "https";
import { log, logError } from "./logger";

interface UnsplashPhoto {
  id: string;
  urls: { regular: string };
  user: { name: string };
}

interface UnsplashResponse {
  results: UnsplashPhoto[];
  total: number;
}

function httpsGet(url: string, accessKey: string): Promise<{ body: string; status: number }> {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { Authorization: `Client-ID ${accessKey}` } }, (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => resolve({ body, status: res.statusCode ?? 0 }));
      })
      .on("error", reject);
  });
}

export async function findUnsplashImage(
  keywords: string[],
  usedUrls: Set<string> = new Set()
): Promise<{ featured_image_url: string | null; image_credit: string | null }> {
  const accessKey = process.env.UNSPLASH_ACCESS_KEY;
  if (!accessKey) {
    logError("unsplash", "UNSPLASH_ACCESS_KEY is not set — skipping");
    return { featured_image_url: null, image_credit: null };
  }

  const queries = [keywords.join(" "), keywords[0]];

  for (const query of queries) {
    try {
      const encoded = encodeURIComponent(query);
      const url = `https://api.unsplash.com/search/photos?query=${encoded}&per_page=15&orientation=landscape`;
      const { body, status } = await httpsGet(url, accessKey);

      if (status !== 200) {
        let errMsg = `HTTP ${status}`;
        try {
          const errData = JSON.parse(body) as { errors?: string[] };
          if (errData.errors?.length) errMsg += `: ${errData.errors[0]}`;
        } catch {}
        logError("unsplash", `API error for "${query}": ${errMsg}`);
        return { featured_image_url: null, image_credit: null };
      }

      const data: UnsplashResponse = JSON.parse(body);

      if (data.results && data.results.length > 0) {
        const photo = data.results.find((p) => !usedUrls.has(p.urls.regular));
        if (photo) {
          log("unsplash", `Found image for "${query}": ${photo.urls.regular}`);
          return {
            featured_image_url: photo.urls.regular,
            image_credit: `${photo.user.name} / Unsplash`,
          };
        }
        log("unsplash", `All ${data.results.length} results for "${query}" already used — ${queries.indexOf(query) === 0 ? "trying fallback..." : "giving up."}`);
        continue;
      }

      log("unsplash", `No results for "${query}", ${queries.indexOf(query) === 0 ? "trying fallback..." : "giving up."}`);
    } catch (err) {
      logError("unsplash", `Request failed for "${query}": ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { featured_image_url: null, image_credit: null };
}
