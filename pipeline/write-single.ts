import * as dotenv from "dotenv";
dotenv.config();
import * as fs from "fs";
import * as path from "path";
import { callClaude, extractJson } from "./lib/claude";
import { getConfig } from "./lib/config";
import { log, logError } from "./lib/logger";
import { fetchJournalists, selectJournalist } from "./lib/journalists";
import {
  findStructure,
  STRUCTURES,
  DEFAULT_ARTICLE_STRUCTURE_CONFIG,
  StructureTemplate,
} from "./lib/article-structures";
import { pickImage, DEFAULT_SOURCES } from "./lib/image-sources";
import { generateImage } from "./lib/image-gen";
import { uploadImageFromUrl } from "./lib/image-storage";
import { recordImageCost } from "./lib/sync";
import { SelectedArticle, WrittenArticle } from "./types";

const SELECTED_FILE = path.join(__dirname, "data", "selected_articles.json");
const OUTPUT_FILE = path.join(__dirname, "data", "articles_ready.json");
const EDITORIAL_FILE = path.join(__dirname, "editorial_style.md");

const IMAGE_CONFIG_DEFAULTS = {
  enabled: false,
  relevanceThreshold: 5,
  generationStyle: "photorealistic editorial news photo, professional lighting, no text overlay, no logo",
  strategy: "priority" as const,
  sources: DEFAULT_SOURCES,
};

function timeStrToUtcMs(timeStr: string, timezone: string, today: Date): number {
  const [hour, minute] = timeStr.split(":").map(Number);
  const dateStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(today);
  const [year, month, day] = dateStr.split("-").map(Number);
  const testDate = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  const tzNoon = parseInt(
    new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "numeric", hour12: false }).format(testDate), 10
  );
  const offset = tzNoon - 12;
  return Date.UTC(year, month - 1, day, hour - offset, minute, 0, 0);
}

function scheduledFor(index: number): string {
  const cfg = getConfig();
  const { mode, firstPostTime, intervalMinutes, randomMin, randomMax, specificTimes } = cfg.posting;
  const timezone = cfg.schedule.timezone;
  const today = new Date();
  const baseMs = timeStrToUtcMs(firstPostTime, timezone, today);

  switch (mode) {
    case "same-time":
      return new Date(baseMs).toISOString();
    case "interval":
      return new Date(baseMs + index * intervalMinutes * 60_000).toISOString();
    case "random": {
      let ms = baseMs;
      for (let i = 0; i < index; i++)
        ms += (randomMin + Math.random() * (randomMax - randomMin)) * 60_000;
      return new Date(ms).toISOString();
    }
    case "specific": {
      const t = specificTimes?.[index] ?? firstPostTime;
      return new Date(timeStrToUtcMs(t, timezone, today)).toISOString();
    }
    default:
      return new Date(baseMs + index * intervalMinutes * 60_000).toISOString();
  }
}

function buildStructureBlock(
  structure: StructureTemplate,
  allowlist?: StructureTemplate[]
): string {
  if (allowlist) {
    const optionsList = allowlist
      .map((s) => `- "${s.id}" — ${s.label} : ${s.instruction.split("\n")[0]}`)
      .join("\n");
    const fullInstructions = allowlist
      .map((s) => `=== ${s.id} ===\n${s.instruction}`)
      .join("\n\n");
    return `<article_structure_choice>
Choisis la structure la plus adaptée au sujet parmi les options ci-dessous et indique ton choix dans le champ "structure_id" du JSON.

Options disponibles :
${optionsList}

Instructions complètes par structure :
${fullInstructions}
</article_structure_choice>`;
  }

  return `<article_structure>
${structure.instruction}
</article_structure>`;
}

function buildPrompt(
  editorialStyle: string,
  article: SelectedArticle,
  structure: StructureTemplate,
  allowlist?: StructureTemplate[]
): string {
  const structureBlock = buildStructureBlock(structure, allowlist);
  const structureIdField = allowlist
    ? `\n  "structure_id": "${structure.id}",`
    : "";

  return `Tu es journaliste pour BEpaper, un site d'information belge francophone.

Voici ta ligne éditoriale :
<editorial_style>
${editorialStyle}
</editorial_style>

Écris un article basé sur ${article.source_urls.length > 1 ? `ces ${article.source_urls.length} sources` : "cette source"} :
${article.source_urls.map((url, i) => `- Source ${i + 1} : "${article.headlines[i]}" — ${url}`).join("\n")}
- Angle éditorial : ${article.angle}
- Catégorie : ${article.category}${article.source_urls.length > 1 ? "\n\nSynthétise les informations de toutes les sources pour produire un article complet et équilibré." : ""}

${structureBlock}

Consignes générales :
- Titre informatif, max 10 mots
- Chapô : 2-3 phrases répondant à qui/quoi/quand/où
- Ton neutre, factuel, jamais sensationnaliste
- Respecte scrupuleusement la structure indiquée ci-dessus pour le corps de l'article

Réponds UNIQUEMENT avec un objet JSON valide. Aucun commentaire, aucun markdown, aucun texte avant ou après le JSON. Format exact :
{${structureIdField}
  "title": "...",
  "slug": "...",
  "chapo": "...",
  "body": "...",
  "category": "${article.category}",
  "tags": ["tag1", "tag2", "tag3"],
  "source_urls": ${JSON.stringify(article.source_urls)},
  "image_keywords": ["keyword1", "keyword2", "keyword3"]
}

Le slug est le titre en minuscules, sans accents, avec des tirets à la place des espaces.`;
}

function validate(data: unknown): WrittenArticle {
  if (typeof data !== "object" || data === null) throw new Error("Response is not an object");
  const a = data as Record<string, unknown>;
  if (typeof a.title !== "string" || !a.title) throw new Error("missing title");
  if (typeof a.slug !== "string" || !a.slug) throw new Error("missing slug");
  if (typeof a.chapo !== "string" || !a.chapo) throw new Error("missing chapo");
  if (typeof a.body !== "string" || !a.body) throw new Error("missing body");
  if (typeof a.category !== "string" || !a.category) throw new Error("missing category");
  if (!Array.isArray(a.tags)) throw new Error("missing tags");
  if (!Array.isArray(a.source_urls)) throw new Error("missing source_urls");
  if (!Array.isArray(a.image_keywords)) throw new Error("missing image_keywords");
  return a as unknown as WrittenArticle;
}

export async function generateSingleArticle(sourceUrl: string): Promise<void> {
  log("write-single", `Looking for article: ${sourceUrl}`);

  if (!fs.existsSync(SELECTED_FILE)) throw new Error("selected_articles.json not found");
  const selectedData = JSON.parse(fs.readFileSync(SELECTED_FILE, "utf-8"));
  const article: SelectedArticle = selectedData.articles.find((a: any) => Array.isArray(a.source_urls) ? a.source_urls.includes(sourceUrl) : a.source_url === sourceUrl);
  if (!article) throw new Error(`Article not found in selection: ${sourceUrl}`);

  // Load existing output to check for duplicates and determine scheduling index
  let existingData: any = { generated_at: new Date().toISOString(), total: 0, articles: [] };
  if (fs.existsSync(OUTPUT_FILE)) {
    existingData = JSON.parse(fs.readFileSync(OUTPUT_FILE, "utf-8"));
  }

  const alreadyExists = existingData.articles.some(
    (a: any) => Array.isArray(a.source_urls) && a.source_urls.includes(sourceUrl)
  );
  if (alreadyExists) {
    log("write-single", "Article already generated — skipping");
    return;
  }

  // Determine structure and journalist (before buildPrompt for per-journalist mode)
  const journalists = await fetchJournalists();
  const cfg = getConfig();
  const structCfg = { ...DEFAULT_ARTICLE_STRUCTURE_CONFIG, ...(cfg.articleStructure ?? {}) };

  let structure = findStructure(structCfg.fixed);
  let allowlist: StructureTemplate[] | undefined;
  let preselectedJournalist = null;

  switch (structCfg.mode) {
    case "fixed":
      structure = findStructure(structCfg.fixed);
      break;
    case "auto": {
      const ids = structCfg.allowlist ?? STRUCTURES.map((s) => s.id);
      allowlist = ids.length > 0
        ? ids.map((id) => findStructure(id))
        : [findStructure(structCfg.fixed)];
      structure = allowlist[0];
      break;
    }
    case "per-journalist":
      preselectedJournalist = selectJournalist(article.category, journalists);
      structure = findStructure(preselectedJournalist?.article_structure);
      break;
  }

  log("write-single", `Writing: "${article.headlines[0].slice(0, 60)}"`);
  const editorialStyle = fs.readFileSync(EDITORIAL_FILE, "utf-8");
  const prompt = buildPrompt(editorialStyle, article, structure, allowlist);

  let written: WrittenArticle;
  let rawResponse = await callClaude(prompt, "write-single");
  try {
    written = validate(extractJson(rawResponse));
  } catch (firstErr) {
    logError("write-single", `First attempt failed: ${firstErr instanceof Error ? firstErr.message : String(firstErr)}`);
    log("write-single", "Retrying…");
    rawResponse = await callClaude(
      prompt + "\n\nATTENTION : ta réponse précédente n'était pas du JSON valide. Réponds uniquement avec l'objet JSON, rien d'autre.",
      "write-single"
    );
    written = validate(extractJson(rawResponse));
  }

  // Auto mode: resolve the structure Claude actually chose
  if (allowlist && typeof written.structure_id === "string") {
    const chosen = allowlist.find((s) => s.id === written.structure_id);
    if (chosen) structure = chosen;
  }
  written.structure_id = structure.id;

  // Journalist assignment
  const journalist =
    preselectedJournalist ??
    selectJournalist(written.category, journalists);
  written.journalist_id = journalist?.id ?? undefined;

  log("write-single", `✅ Article written: "${written.title.slice(0, 70)}" [${structure.label}]`);
  log("write-single", `Sourcing image for: [${written.image_keywords.join(", ")}]`);

  // Image sourcing using the full multi-source pipeline
  const imgCfg = { ...IMAGE_CONFIG_DEFAULTS, ...(cfg.images ?? {}) };
  const usedUrls = new Set<string>();
  let pick = await pickImage(written, usedUrls, {
    strategy: imgCfg.strategy,
    sources: imgCfg.sources,
    imagesEnabled: imgCfg.enabled,
    relevanceThreshold: imgCfg.relevanceThreshold,
  });

  let featured_image_url = pick.featured_image_url;
  let image_credit = pick.image_credit;
  let image_source = pick.image_source as string | null;

  if (pick.needsAIGeneration) {
    log("write-single", `  Attempting DALL-E 3 generation…`);
    try {
      const generated = await generateImage(written.title, written.image_keywords, imgCfg.generationStyle);
      if (generated) {
        const filename = `${written.slug}-${Date.now()}.png`;
        const uploadedUrl = await uploadImageFromUrl(generated.imageUrl, filename);
        if (uploadedUrl) {
          featured_image_url = uploadedUrl;
          image_credit = "Illustration IA";
          image_source = "ai-generated";
          log("write-single", `  ✅ AI image stored: ${uploadedUrl.slice(0, 80)}`);
          await recordImageCost();
        } else {
          log("write-single", `  ⚠️  Upload failed — publishing without image`);
        }
      } else {
        log("write-single", `  ⚠️  Generation failed — publishing without image`);
      }
    } catch (err) {
      logError("write-single", `AI image generation error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (featured_image_url) {
    log("write-single", `Image found (${image_source}): ${featured_image_url.slice(0, 80)}`);
  } else {
    log("write-single", "No image found — will publish without featured image");
  }

  const index = existingData.articles.length;
  existingData.articles.push({
    ...written,
    featured_image_url,
    image_credit,
    image_source,
    scheduled_for: scheduledFor(index),
  });
  existingData.total = existingData.articles.length;
  existingData.generated_at = new Date().toISOString();

  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  const tmp = OUTPUT_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(existingData, null, 2), "utf-8");
  fs.renameSync(tmp, OUTPUT_FILE);

  log("write-single", `✅ Appended to articles_ready.json (total: ${existingData.total})`);
}

// Standalone entrypoint
if (require.main === module) {
  const sourceUrl = process.env.SOURCE_URL;
  if (!sourceUrl) {
    logError("write-single", "SOURCE_URL env var is required");
    process.exit(1);
  }
  generateSingleArticle(sourceUrl).catch((err) => {
    logError("write-single", err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
