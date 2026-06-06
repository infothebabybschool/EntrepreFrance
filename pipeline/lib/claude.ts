import Anthropic from "@anthropic-ai/sdk";
import { jsonrepair } from "jsonrepair";
import { log, logError } from "./logger";
import { syncClaudeUsage } from "./sync";

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

/**
 * Call Claude and return the raw text response.
 * Logs token usage via the pipeline logger.
 */
// Max tokens by scope — keeps response buffers small
const MAX_TOKENS: Record<string, number> = {
  write: 2000,   // article body ~800 tokens + JSON overhead
  select: 3000,  // selection JSON: up to 6 items × ~400 tokens (URLs + angles can be long)
};
const DEFAULT_MAX_TOKENS = 2000;

export async function callClaude(
  prompt: string,
  scope = "claude"
): Promise<string> {
  const client = getClient();
  const maxTokens = MAX_TOKENS[scope] ?? DEFAULT_MAX_TOKENS;

  const RETRY_DELAYS = [15000, 30000, 60000]; // wait 15s, 30s, 60s before giving up

  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    try {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: maxTokens,
        messages: [{ role: "user", content: prompt }],
      });

      const inputTokens = response.usage.input_tokens;
      const outputTokens = response.usage.output_tokens;
      log(scope, `Claude responded — input: ${inputTokens} tokens, output: ${outputTokens} tokens`);
      syncClaudeUsage(scope, inputTokens, outputTokens).catch(() => {});

      const block = response.content[0];
      if (block.type !== "text") throw new Error("Unexpected response type from Claude");
      return block.text;
    } catch (err) {
      const isOverloaded =
        err instanceof Error &&
        (err.message.includes("overloaded") || err.message.includes("529") || err.message.includes("Overloaded"));

      if (isOverloaded && attempt < RETRY_DELAYS.length) {
        const waitMs = RETRY_DELAYS[attempt];
        log(scope, `⚠️  Claude API overloaded — retrying in ${waitMs / 1000}s (attempt ${attempt + 1}/${RETRY_DELAYS.length})…`);
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        continue;
      }
      throw err;
    }
  }

  throw new Error("callClaude: exhausted all retry attempts");
}

/**
 * Extract and parse JSON from Claude's response.
 * Handles markdown code fences and locates the outermost JSON object/array.
 */
export function extractJson<T>(text: string): T {
  // Strip markdown code fences
  let cleaned = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  // Find the outermost JSON structure
  const firstBrace = cleaned.indexOf("{");
  const firstBracket = cleaned.indexOf("[");

  let start: number;
  let end: number;
  let isArray: boolean;

  if (firstBracket !== -1 && (firstBrace === -1 || firstBracket < firstBrace)) {
    start = firstBracket;
    end = cleaned.lastIndexOf("]");
    isArray = true;
  } else if (firstBrace !== -1) {
    start = firstBrace;
    end = cleaned.lastIndexOf("}");
    isArray = false;
  } else {
    throw new Error("No JSON object or array found in Claude response");
  }

  if (end === -1) throw new Error("Malformed JSON: no closing bracket/brace");

  const jsonStr = cleaned.slice(start, end + 1);

  // First try strict parse; fall back to jsonrepair for common LLM mistakes
  // (unescaped quotes, trailing commas, line breaks inside strings, etc.)
  try {
    return JSON.parse(jsonStr) as T;
  } catch {
    return JSON.parse(jsonrepair(jsonStr)) as T;
  }
}
