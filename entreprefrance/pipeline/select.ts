import * as fs from "fs";
import * as path from "path";
import { callClaude, extractJson } from "./lib/claude";
import { log, logError } from "./lib/logger";
import { getConfig } from "./lib/config";
import { syncSelectionCache } from "./lib/sync";
import { ScraperOutput, SelectedArticle } from "./types";

const SCRAPED_FILE = path.join(process.cwd(), "data", "scraped_articles.json");
const EDITORIAL_FILE = path.join(process.cwd(), "editorial_style.md");

const VALID_CATEGORIES = ["politique", "sociÃ©tÃ©", "culture", "Ã©conomie", "europe"] as const;

// Claude sometimes returns unaccented versions â€” normalize before validating
const CATEGORY_ALIASES: Record<string, string> = {
  "economie": "Ã©conomie",
  "societe": "sociÃ©tÃ©",
};

function buildPrompt(editorialStyle: string, articles: ScraperOutput, count: number, excludeUrls: string[] = [], topicRepetitionWeight = 5): string {
  const filtered = excludeUrls.length
    ? { ...articles, articles: articles.articles.filter(a => !excludeUrls.includes(a.url)), total: 0 }
    : articles;
  filtered.total = filtered.articles.length;

  const exclusionNote = excludeUrls.length
    ? `\nCes articles ont dÃ©jÃ  Ã©tÃ© sÃ©lectionnÃ©s â€” ne les inclus pas :\n${excludeUrls.map(u => `- ${u}`).join("\n")}\n`
    : "";

  return `Tu es le rÃ©dacteur en chef de BEpaper, un site d'information belge francophone.

Voici ta ligne Ã©ditoriale :
<editorial_style>
${editorialStyle}
</editorial_style>
${exclusionNote}
Voici les ${filtered.total} articles disponibles (scrapÃ©s le ${articles.scraped_at}) :
<articles>
${JSON.stringify(filtered.articles, null, 2)}
</articles>

SÃ©lectionne exactement ${count} articles Ã  traiter aujourd'hui. Respecte la diversitÃ© thÃ©matique de ta ligne Ã©ditoriale (1-2 politique belge, 1 Ã©conomie/travail, 1 Europe/international, 1 sociÃ©tÃ©, 1 culture si pertinent). Ã‰limine les doublons thÃ©matiques et les sujets exclus (sport, faits divers, cÃ©lÃ©britÃ©s).

Poids de convergence entre sources : ${topicRepetitionWeight}/10. ${topicRepetitionWeight <= 2 ? "Ignore la rÃ©pÃ©tition d'un sujet entre sources â€” privilÃ©gie la diversitÃ© des sujets." : topicRepetitionWeight >= 8 ? "PrivilÃ©gie fortement les sujets couverts par plusieurs sources diffÃ©rentes : leur prÃ©sence simultanÃ©e est un signal Ã©ditorial important." : "Prends en compte la rÃ©pÃ©tition d'un sujet entre plusieurs sources comme un indicateur de son importance, sans en faire le critÃ¨re principal."}

Pour chaque article sÃ©lectionnÃ©, retourne :
- source_urls : tableau des URLs des articles sources couvrant ce sujet (souvent 1 seul, mais peut en contenir plusieurs si plusieurs sources traitent du mÃªme Ã©vÃ©nement)
- headlines : tableau des titres originaux correspondant Ã  chaque URL (mÃªme ordre que source_urls)
- angle : l'angle Ã©ditorial Ã  adopter (1-2 phrases)
- category : exactement l'une de ces valeurs : "politique", "sociÃ©tÃ©", "culture", "Ã©conomie", "europe"
- image_keywords : tableau de 3 mots-clÃ©s EN ANGLAIS pour chercher une photo sur Pexels

RÃ©ponds UNIQUEMENT avec un tableau JSON valide. RÃ¨gles strictes :
- Aucun texte avant ou aprÃ¨s le tableau JSON
- Aucun markdown, aucun code fence
- Toutes les valeurs de chaÃ®ne sur une seule ligne (pas de saut de ligne dans les valeurs)
- N'utilise jamais de guillemets doubles (" ") dans les valeurs â€” reformule si nÃ©cessaire`;
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
  log("select", "Reading scraped articles and editorial styleâ€¦");

  const { articlesPerDay, topicRepetitionWeight } = getConfig().pipeline;
  const count = options.count ?? articlesPerDay;
  const excludeUrls = options.excludeUrls ?? [];

  const scraped: ScraperOutput = JSON.parse(fs.readFileSync(SCRAPED_FILE, "utf-8"));
  const editorialStyle = fs.readFileSync(EDITORIAL_FILE, "utf-8");

  log("select", `${scraped.total} scraped articles available${excludeUrls.length ? `, ${excludeUrls.length} excluded` : ""}`);

  const prompt = buildPrompt(editorialStyle, scraped, count, excludeUrls, topicRepetitionWeight ?? 5);

  // First attempt
  log("select", "Calling Claude for editorial selectionâ€¦");
  let rawResponse = await callClaude(prompt, "select");

  let selected: SelectedArticle[];
  try {
    selected = validateSelection(extractJson(rawResponse), count);
  } catch (firstErr) {
    logError("select", `First attempt failed: ${firstErr instanceof Error ? firstErr.message : String(firstErr)}`);
    logError("select", `Raw response (first 500 chars): ${rawResponse.slice(0, 500)}`);
    log("select", "Retrying with explicit JSON instructionâ€¦");

    const retryPrompt =
      prompt +
      "\n\nATTENTION : ta rÃ©ponse prÃ©cÃ©dente n'Ã©tait pas du JSON valide. RÃ©ponds UNIQUEMENT avec le tableau JSON brut, rien d'autre. RÃ¨gles strictes :\n- Pas de saut de ligne dans les valeurs de chaÃ®ne\n- N'utilise jamais de guillemets doubles Ã  l'intÃ©rieur des valeurs (reformule si nÃ©cessaire)\n- Pas de texte avant ou aprÃ¨s le tableau JSON";
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

  log("select", `âœ… ${selected.length} articles selected`);
  selected.forEach((a, i) =>
    log("select", `  ${i + 1}. [${a.category}] ${a.headlines[0].slice(0, 70)}${a.source_urls.length > 1 ? ` (+${a.source_urls.length - 1} source)` : ""}`)
  );

  // Sync to Supabase so web admin can read it
  await syncSelectionCache(new Date().toISOString(), selected.length, selected);

  return selected;
}

