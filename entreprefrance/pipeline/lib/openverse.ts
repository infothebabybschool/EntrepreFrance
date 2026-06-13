import * as https from "https";
import { log, logError } from "./logger";

interface OpenverseResult {
  id: string;
  url: string;
  creator: string | null;
  source: string | null;
}

interface OpenverseResponse {
  count: number;
  results: OpenverseResult[];
}

function httpsGet(url: string): Promise<{ body: string; status: number }> {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { "User-Agent": "BEpaper-Bot/1.0" } }, (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => resolve({ body, status: res.statusCode ?? 0 }));
      })
      .on("error", reject);
  });
}

export async function findOpenverseImage(
  keywords: string[],
  usedUrls: Set<string> = new Set()
): Promise<{ featured_image_url: string | null; image_credit: string | null }> {
  const queries = [keywords.join(" "), keywords[0]];

  for (const query of queries) {
    try {
      const encoded = encodeURIComponent(query);
      const url = `https://api.openverse.org/v1/images/?q=${encoded}&license_type=commercial&aspect_ratio=wide&page_size=15`;
      const { body, status } = await httpsGet(url);

      if (status !== 200) {
        logError("openverse", `API error for "${query}": HTTP ${status} — ${body.slice(0, 200)}`);
        return { featured_image_url: null, image_credit: null };
      }

      const data: OpenverseResponse = JSON.parse(body);

      if (data.results && data.results.length > 0) {
        const photo = data.results.find((p) => !usedUrls.has(p.url));
        if (photo) {
          const credit = photo.creator
            ? `${photo.creator} via Openverse`
            : `Openverse${photo.source ? ` / ${photo.source}` : ""}`;
          log("openverse", `Found image for "${query}": ${photo.url}`);
          return { featured_image_url: photo.url, image_credit: credit };
        }
        log("openverse", `All ${data.results.length} results for "${query}" already used — ${queries.indexOf(query) === 0 ? "trying fallback..." : "giving up."}`);
        continue;
      }

      log("openverse", `No results for "${query}", ${queries.indexOf(query) === 0 ? "trying fallback..." : "giving up."}`);
    } catch (err) {
      logError("openverse", `Request failed for "${query}": ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { featured_image_url: null, image_credit: null };
}
