import axios from "axios";
import { log, logError } from "./logger";
import { syncOpenAIUsage } from "./sync";

interface DalleResponse {
  data: Array<{ url: string; revised_prompt?: string }>;
}

/**
 * Generate an image with DALL-E 3 (cheapest option: standard quality, 1024x1024).
 * Returns the temporary OpenAI CDN URL (valid ~1 hour) or null on failure.
 * Requires OPENAI_API_KEY env var.
 */
export async function generateImage(
  title: string,
  keywords: string[],
  style: string
): Promise<{ imageUrl: string } | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    logError("image-gen", "OPENAI_API_KEY is not set — skipping AI image generation");
    return null;
  }

  const prompt = `${style}. Subject: ${title}. Keywords: ${keywords.join(", ")}`;

  try {
    const res = await axios.post<DalleResponse>(
      "https://api.openai.com/v1/images/generations",
      {
        model: "dall-e-3",
        prompt,
        n: 1,
        size: "1024x1024",
        quality: "standard",
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        timeout: 60000,
      }
    );

    const imageUrl = res.data.data[0]?.url;
    if (!imageUrl) {
      logError("image-gen", "DALL-E 3 returned no image URL");
      return null;
    }

    log("image-gen", `Generated image: ${imageUrl.slice(0, 80)}…`);
    syncOpenAIUsage("dall-e-3", 1).catch(() => {});
    return { imageUrl };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logError("image-gen", `DALL-E 3 generation failed: ${message}`);
    return null;
  }
}
