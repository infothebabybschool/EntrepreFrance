import Anthropic from "@anthropic-ai/sdk";
import axios from "axios";
import { log, logError } from "./logger";

const MODEL = "claude-sonnet-4-6";

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
    _client = new Anthropic({ apiKey });
  }
  return _client;
}

interface RelevanceResult {
  score: number;
  reasoning: string;
}

/**
 * Evaluate how relevant a Pexels image is to a given article using Claude vision.
 * Returns a score from 1 (completely unrelated) to 10 (highly relevant).
 * Returns { score: 10, reasoning: "skipped" } on any error so the pipeline never blocks.
 */
export async function evaluateImageRelevance(
  imageUrl: string,
  title: string,
  chapo: string,
  keywords: string[]
): Promise<RelevanceResult> {
  const fallback: RelevanceResult = { score: 10, reasoning: "evaluation skipped (error)" };

  try {
    const imageResponse = await axios.get(imageUrl, {
      responseType: "arraybuffer",
      timeout: 15000,
    });
    const base64 = Buffer.from(imageResponse.data as ArrayBuffer).toString("base64");
    const contentType = (imageResponse.headers["content-type"] as string) || "image/jpeg";
    const mediaType = (
      contentType.startsWith("image/") ? contentType.split(";")[0] : "image/jpeg"
    ) as "image/jpeg" | "image/png" | "image/gif" | "image/webp";

    const prompt = `You are evaluating whether a stock photo is relevant to a news article.

Article title: ${title}
Article summary: ${chapo}
Image search keywords used: ${keywords.join(", ")}

Rate the relevance of this image on a scale of 1-10:
- 1-3: Completely unrelated (e.g. a beach photo for a politics article)
- 4-5: Vaguely thematic but too generic (e.g. a generic cityscape for a specific local event)
- 6-7: Reasonably related to the topic
- 8-10: Highly relevant and specific to the article

Respond with JSON only, no markdown: {"score": <number 1-10>, "reasoning": "<one sentence>"}`;

    const client = getClient();
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 150,
      messages: [{
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mediaType, data: base64 },
          },
          { type: "text", text: prompt },
        ],
      }],
    });

    const inputTokens = response.usage.input_tokens;
    const outputTokens = response.usage.output_tokens;
    log("image-eval", `Claude vision — input: ${inputTokens} tokens, output: ${outputTokens} tokens`);

    const block = response.content[0];
    if (block.type !== "text") return fallback;

    const parsed = JSON.parse(block.text) as RelevanceResult;
    return { score: Number(parsed.score), reasoning: String(parsed.reasoning) };
  } catch (err) {
    logError("image-eval", `Relevance check failed: ${err instanceof Error ? err.message : String(err)}`);
    return fallback;
  }
}
