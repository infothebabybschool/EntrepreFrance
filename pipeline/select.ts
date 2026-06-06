import * as fs from "fs";
import * as path from "path";
import { callClaude, extractJson } from "./lib/claude";
import { log, logError } from "./lib/logger";
import { getConfig } from "./lib/config";
import { syncSelectionCache } from "./lib/sync";
import { ScraperOutput, SelectedArticle } from "./types";

const SCRAPED_FILE = path.join(__dirname, "data", "scraped_articles.json");
const EDITORIAL_FILE = path.join(__dirname, "editorial_style.md");

const VALID_CATEGORIES = ["politique", "société", "culture", "économie", "europe"] as const;

// Claude sometimes returns unaccented versions — normalize before validating
const CATEGORY_ALIASES: Record<string, string> = {
  "economie": "économie",
  "societe": "société",
};

function buildPrompt(editorialStyle: string, articles: ScraperOutput, count: number, excludeUrls: string[] = [], topicRepetitionWeight = 5): string {
  const filtered = excludeUrls.length
    ? { ...articles, articles: articles.articles.filter(a => !excludeUrls.includes(a.url)), total: 0 }
    : articles;
  filtered.total = filtered.articles.length;

  const exclusionNote = excludeUrls.length
    ? `\nCes articles ont déjà été sélectionnés — ne les inclus pas :\n${excludeUrls.map(u => `- ${u}`).join("\n")}\n`
    : "";

  return `Tu es le rédacteur en chef de BEpaper, un site d'information belge francophone.

Voici ta ligne éditoriale :
<editorial_style>
${editorialStyle}
</editorial_style>
${exclusionNote}
Voici les ${filtered.total} articles disponibles (scrapés le ${articles.scraped_at}) :
<articles>
${JSON.stringify(filtered.articles, null, 2)}
</articles>

Sélectionne exactement ${count} articles à traiter aujourd'hui. Respecte la diversité thématique de ta ligne éditoriale (1-2 politique belge, 1 économie/travail, 1 Europe/international, 1 société, 1 culture si pertinent). Élimine les doublons thématiques et les sujets exclus (sport, faits divers, célébrités).

Poids de convergence entre sources : ${topicRepetitionWeight}/10. ${topicRepetitionWeight <= 2 ? "Ignore la répétition d'un sujet entre sources — privilégie la diversité des sujets." : topicRepetitionWeight >= 8 ? "Privilégie fortement les sujets couverts par plusieurs sources différentes : leur présence simultanée est un signal éditorial important." : "Prends en compte la répétition d'un sujet entre plusieurs sources comme un indicateur de son importance, sans en faire le critère principal."}

Pour chaque article sélectionné, retourne :
- source_urls : tableau des URLs des articles sources couvrant ce sujet (souvent 1 seul, mais peut en contenir plusieurs si plusieurs sources traitent du même événement)
- headlines : tableau des titres originaux correspondant à chaque URL (même ordre que source_urls)
- angle : l'angle éditorial à adopter (1-2 phrases)
- category : exactement l'une de ces valeurs : "politique", "société", "culture", "économie", "europe"
- image_keywords : tableau de 3 mots-clés EN ANGLAIS pour chercher une photo sur Pexels

Réponds UNIQUEMENT avec un tableau JSON valide. Règles strictes :
- Aucun texte avant ou après le tableau JSON
- Aucun markdown, aucun code fence
- Toutes les valeurs de chaîne sur une seule ligne (pas de saut de ligne dans les valeurs)
- N'utilise jamais de guillemets doubles (" ") dans les valeurs — reformule si nécessaire`;
}

function validateSelection(data: unknown, articlesPerDay: number): SelectedArticle[] {
  if (!Array.isArray(data)) throw new Error("Response is not an array");
  if (data.length !== articlesPerDay) throw new Error(`Expected ${articlesPerDay} articles, got ${data.length}`);

  return data.map((item, i) => {
    if (typeof item !== "object" || item === null) throw new Error(`Item ${i} is not an object`);
    const a = item as Record<string, unknown>;
    // Backward compatibility: normalize old singular format to arrays
    if (typeof a.source_url === "string" && !Array.isArray(a.source_urls)) {
      a.source_urls = [a.source_url];
      delete a.source_url;
    }
    if (typeof a.headline === "string" && !Array.isArray(a.headlines)) {
      a.headlines = [a.headline];
      delete a.headline;
    }
    if (!Array.isArray(a.source_urls) || (a.source_urls as unknown[]).length === 0) throw new Error(`Item ${i}: missing source_urls`);
    if (!Array.isArray(a.headlines) || (a.headlines as unknown[]).length === 0) throw new Error(`Item ${i}: missing headlines`);
    if (typeof a.angle !== "string") throw new Error(`Item ${i}: missing angle`);
    if (typeof a.category === "string" && CATEGORY_ALIASES[a.category]) {
      a.category = CATEGORY_ALIASES[a.category];
    }
    if (!VALID_CATEGORIES.includes(a.category as (typeof VALID_CATEGORIES)[number])) {
      throw new Error(`Item ${i}: invalid category "${a.category}"`);
    }
    if (!Array.isArray(a.image_keywords) || a.image_keywords.length < 1) {
      throw new Error(`Item ${i}: missing image_keywords`);
    }
    return a as unknown as SelectedArticle;
  });
}

export async function selectArticles(options: { count?: number; excludeUrls?: string[] } = {}): Promise<SelectedArticle[]> {
  log("select", "Reading scraped articles and editorial style…");

  const { articlesPerDay, topicRepetitionWeight } = getConfig().pipeline;
  const count = options.count ?? articlesPerDay;
  const excludeUrls = options.excludeUrls ?? [];

  const scraped: ScraperOutput = JSON.parse(fs.readFileSync(SCRAPED_FILE, "utf-8"));
  const editorialStyle = fs.readFileSync(EDITORIAL_FILE, "utf-8");

  log("select", `${scraped.total} scraped articles available${excludeUrls.length ? `, ${excludeUrls.length} excluded` : ""}`);

  const prompt = buildPrompt(editorialStyle, scraped, count, excludeUrls, topicRepetitionWeight ?? 5);

  // First attempt
  log("select", "Calling Claude for editorial selection…");
  let rawResponse = await callClaude(prompt, "select");

  let selected: SelectedArticle[];
  try {
    selected = validateSelection(extractJson(rawResponse), count);
  } catch (firstErr) {
    logError("select", `First attempt failed: ${firstErr instanceof Error ? firstErr.message : String(firstErr)}`);
    logError("select", `Raw response (first 500 chars): ${rawResponse.slice(0, 500)}`);
    log("select", "Retrying with explicit JSON instruction…");

    const retryPrompt =
      prompt +
      "\n\nATTENTION : ta réponse précédente n'était pas du JSON valide. Réponds UNIQUEMENT avec le tableau JSON brut, rien d'autre. Règles strictes :\n- Pas de saut de ligne dans les valeurs de chaîne\n- N'utilise jamais de guillemets doubles à l'intérieur des valeurs (reformule si nécessaire)\n- Pas de texte avant ou après le tableau JSON";
    rawResponse = await callClaude(retryPrompt, "select");

    try {
      selected = validateSelection(extractJson(rawResponse), count);
    } catch (secondErr) {
      logError("select", `Raw response (retry, first 500 chars): ${rawResponse.slice(0, 500)}`);
      throw new Error(
        `Claude returned invalid JSON on both attempts: ${secondErr instanceof Error ? secondErr.message : String(secondErr)}`
      );
    }
  }

  log("select", `✅ ${selected.length} articles selected`);
  selected.forEach((a, i) =>
    log("select", `  ${i + 1}. [${a.category}] ${a.headlines[0].slice(0, 70)}${a.source_urls.length > 1 ? ` (+${a.source_urls.length - 1} source)` : ""}`)
  );

  // Sync to Supabase so web admin can read it
  await syncSelectionCache(new Date().toISOString(), selected.length, selected);

  return selected;
}
