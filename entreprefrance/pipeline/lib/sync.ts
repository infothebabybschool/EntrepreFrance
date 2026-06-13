import axios from "axios";

function base() { return process.env.WEBSITE_URL; }
function secret() { return process.env.ARTICLES_API_SECRET; }
function canSync() { return !!(base() && secret()); }
function auth() { return { Authorization: `Bearer ${secret()}` }; }

/** Push scrape data + history to the web API cache. */
export async function syncScrapeCache(
  scraped_at: string,
  total: number,
  articles: object[],
  history: object[]
): Promise<void> {
  if (!canSync()) return;
  try {
    await axios.post(
      `${base()}/api/pipeline/cache`,
      { type: "scrape", scraped_at, total, articles, history },
      { headers: auth(), timeout: 8000 }
    );
  } catch {}
}

/** Push selection data to the web API cache. */
export async function syncSelectionCache(
  selected_at: string,
  total: number,
  articles: object[]
): Promise<void> {
  if (!canSync()) return;
  try {
    await axios.post(
      `${base()}/api/pipeline/cache`,
      { type: "selection", selected_at, total, articles },
      { headers: auth(), timeout: 8000 }
    );
  } catch {}
}

/** Push ready articles data to the web API cache. */
export async function syncReadyCache(
  generated_at: string,
  total: number,
  articles: object[]
): Promise<void> {
  if (!canSync()) return;
  try {
    await axios.post(
      `${base()}/api/pipeline/cache`,
      { type: "ready", generated_at, total, articles },
      { headers: auth(), timeout: 8000 }
    );
  } catch {}
}

/** Record one AI image generation cost in the pipeline config cost log. */
export async function recordImageCost(): Promise<void> {
  if (!canSync()) return;
  const date = new Date().toISOString().slice(0, 10);
  try {
    await axios.post(
      `${base()}/api/pipeline/image-cost`,
      { date },
      { headers: auth(), timeout: 5000 }
    );
  } catch {}
}

/** Record one OpenAI image generation. */
export async function syncOpenAIUsage(
  model: string,
  imagesCount: number
): Promise<void> {
  if (!canSync()) return;
  const date = new Date().toISOString().slice(0, 10);
  try {
    await axios.post(
      `${base()}/api/pipeline/openai-usage`,
      { date, model, images_count: imagesCount },
      { headers: auth(), timeout: 5000 }
    );
  } catch {}
}

/** Record one Claude API call's token usage. */
export async function syncClaudeUsage(
  scope: string,
  inputTokens: number,
  outputTokens: number
): Promise<void> {
  if (!canSync()) return;
  const date = new Date().toISOString().slice(0, 10);
  try {
    await axios.post(
      `${base()}/api/pipeline/usage`,
      { date, scope, input_tokens: inputTokens, output_tokens: outputTokens },
      { headers: auth(), timeout: 5000 }
    );
  } catch {}
}

/** Send a pipeline failure alert email via the web app. Fire-and-forget. */
export async function syncAlert(subject: string, message: string): Promise<void> {
  if (!canSync()) return;
  try {
    await axios.post(
      `${base()}/api/pipeline/alert`,
      { subject, message },
      { headers: auth(), timeout: 10000 }
    );
  } catch {}
}

/** Append a log entry to the web API logs. */
export async function syncLog(
  scope: string,
  message: string,
  is_error = false
): Promise<void> {
  if (!canSync()) return;
  try {
    await axios.post(
      `${base()}/api/pipeline/logs`,
      { entries: [{ scope, message, is_error }] },
      { headers: auth(), timeout: 5000 }
    );
  } catch {}
}
