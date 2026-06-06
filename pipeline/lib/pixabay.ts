import * as https from "https";
import { log, logError } from "./logger";

interface PixabayHit {
  id: number;
  largeImageURL: string;
  user: string;
}

interface PixabayResponse {
  total: number;
  hits: PixabayHit[];
}

function httpsGet(url: string): Promise<{ body: string; status: number }> {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => resolve({ body, status: res.statusCode ?? 0 }));
      })
      .on("error", reject);
  });
}

export async function findPixabayImage(
  keywords: string[],
  usedUrls: Set<string> = new Set()
): Promise<{ featured_image_url: string | null; image_credit: string | null }> {
  const apiKey = process.env.PIXABAY_API_KEY;
  if (!apiKey) {
    logError("pixabay", "PIXABAY_API_KEY is not set — skipping");
    return { featured_image_url: null, image_credit: null };
  }

  const queries = [keywords.join(" "), keywords[0]];

  for (const query of queries) {
    try {
      const encoded = encodeURIComponent(query);
      const url = `https://pixabay.com/api/?key=${apiKey}&q=${encoded}&image_type=photo&orientation=horizontal&per_page=15&safesearch=true`;
      const { body, status } = await httpsGet(url);

      if (status !== 200) {
        let errMsg = `HTTP ${status}`;
        try {
          const errData = JSON.parse(body) as { error?: string };
          if (errData.error) errMsg += `: ${errData.error}`;
        } catch {}
        logError("pixabay", `API error for "${query}": ${errMsg}`);
        return { featured_image_url: null, image_credit: null };
      }

      const data: PixabayResponse = JSON.parse(body);

      if (data.hits && data.hits.length > 0) {
        const photo = data.hits.find((p) => !usedUrls.has(p.largeImageURL));
        if (photo) {
          log("pixabay", `Found image for "${query}": ${photo.largeImageURL}`);
          return {
            featured_image_url: photo.largeImageURL,
            image_credit: `${photo.user} / Pixabay`,
          };
        }
        log("pixabay", `All ${data.hits.length} results for "${query}" already used — ${queries.indexOf(query) === 0 ? "trying fallback..." : "giving up."}`);
        continue;
      }

      log("pixabay", `No results for "${query}", ${queries.indexOf(query) === 0 ? "trying fallback..." : "giving up."}`);
    } catch (err) {
      logError("pixabay", `Request failed for "${query}": ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { featured_image_url: null, image_credit: null };
}
