import * as fs from "fs";
import * as path from "path";
import { callClaude, extractJson } from "./lib/claude";
import { log, logError } from "./lib/logger";
import { getConfig } from "./lib/config";
import { fetchJournalists, selectJournalist } from "./lib/journalists";
import {
  findStructure,
  STRUCTURES,
  DEFAULT_ARTICLE_STRUCTURE_CONFIG,
  StructureTemplate,
} from "./lib/article-structures";
import { SelectedArticle, WrittenArticle } from "./types";

const EDITORIAL_FILE = path.join(__dirname, "editorial_style.md");

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

Voici la ligne éditoriale de BEpaper (ton, style et structure à respecter) :
<editorial_style>
${editorialStyle}
</editorial_style>

INSTRUCTION IMPORTANTE : Cet article a été sélectionné manuellement par la rédaction. Tu dois TOUJOURS écrire l'article, quel que soit le sujet. Ne refuse jamais d'écrire sous prétexte que le sujet ne correspond pas aux thèmes habituels. La ligne éditoriale s'applique au ton, au style et à la structure — pas au choix de publier ou non. Si le sujet est inhabituel, adapte l'angle pour le rendre pertinent pour un lecteur belge francophone, et choisis la catégorie la plus proche parmi : politique, société, culture, économie, europe.

Écris un article basé sur ${article.source_urls.length > 1 ? `ces ${article.source_urls.length} sources` : "cette source"} :
${article.source_urls.map((url, i) => `- Source ${i + 1} : "${article.headlines[i]}" — ${url}`).join("\n")}
- Angle éditorial : ${article.angle}
- Catégorie suggérée : ${article.category}${article.source_urls.length > 1 ? "\n\nSynthétise les informations de toutes les sources pour produire un article complet et équilibré." : ""}

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
  "category": "politique|société|culture|économie|europe",
  "tags": ["tag1", "tag2", "tag3"],
  "source_urls": ${JSON.stringify(article.source_urls)},
  "image_keywords": ["keyword1", "keyword2", "keyword3"]
}

Le slug est le titre en minuscules, sans accents, avec des tirets à la place des espaces.`;
}

function validateWrittenArticle(data: unknown, index: number): WrittenArticle {
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function writeArticles(selected: SelectedArticle[]): Promise<WrittenArticle[]> {
  log("write", `Writing ${selected.length} articles…`);

  const editorialStyle = fs.readFileSync(EDITORIAL_FILE, "utf-8");
  const journalists = await fetchJournalists();
  const written: WrittenArticle[] = [];

  const structCfg = { ...DEFAULT_ARTICLE_STRUCTURE_CONFIG, ...(getConfig().articleStructure ?? {}) };

  for (let i = 0; i < selected.length; i++) {
    const article = selected[i];
    log("write", `Article ${i + 1}/${selected.length}: "${article.headlines[0].slice(0, 60)}"`);

    if (i > 0) {
      await sleep(2000);
    }

    // Determine structure and journalist
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

    const prompt = buildPrompt(editorialStyle, article, structure, allowlist);

    let result: WrittenArticle;
    try {
      const rawResponse = await callClaude(prompt, "write");
      const parsed = extractJson<unknown>(rawResponse);
      result = validateWrittenArticle(parsed, i);

      // Auto mode: resolve the structure Claude actually chose
      if (allowlist && typeof result.structure_id === "string") {
        const chosen = allowlist.find((s) => s.id === result.structure_id);
        if (chosen) structure = chosen;
      }
      result.structure_id = structure.id;

      // Journalist assignment
      const journalist =
        preselectedJournalist ??
        selectJournalist(result.category, journalists);
      result.journalist_id = journalist?.id ?? undefined;

      log("write", `  ✅ Article ${i + 1}: "${result.title.slice(0, 70)}" [${structure.label}]`);
    } catch (err) {
      logError("write", `Article ${i + 1} failed: ${err instanceof Error ? err.message : String(err)}`);
      log("write", `  ⚠️  Skipping article ${i + 1}`);
      continue;
    }

    written.push(result);
  }

  // Only enforce the minimum when writing a full batch (>= minArticlesRequired input).
  // Single-article generation from admin commands should never be blocked by this guard.
  const { minArticlesRequired } = getConfig().pipeline;
  if (selected.length >= minArticlesRequired && written.length < minArticlesRequired) {
    throw new Error(
      `Pipeline aborted: only ${written.length} articles written successfully (minimum ${minArticlesRequired} required)`
    );
  }

  log("write", `✅ ${written.length}/${selected.length} articles written successfully`);
  return written;
}
