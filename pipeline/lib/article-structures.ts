export type StructureId =
  | "pyramide-inversee"
  | "flash"
  | "narratif"
  | "analyse"
  | "qr"
  | "listicle"
  | "chronologie"
  | "contexte-dabord"
  | "mise-en-perspective"
  | "briefing";

export interface StructureTemplate {
  id: StructureId;
  label: string;
  description: string;
  instruction: string;
}

export const STRUCTURES: StructureTemplate[] = [
  {
    id: "pyramide-inversee",
    label: "Pyramide inversée",
    description: "Facts first, then context, reactions, perspectives — the standard news format",
    instruction: `Structure : pyramide inversée.
Corps : 400-600 mots en markdown, 3-4 paragraphes.
Commence par les faits essentiels (qui, quoi, quand, où, pourquoi), puis développe le contexte et les enjeux, puis les réactions ou positions des acteurs concernés, et termine par les perspectives ou les suites attendues.
Présent journalistique. Pas de sous-titres.`,
  },
  {
    id: "flash",
    label: "En bref / Flash",
    description: "150-250 words, just the essential facts, no context or analysis",
    instruction: `Structure : flash / en bref.
Corps : 150-250 mots en markdown, exactement 2 paragraphes courts.
Premier paragraphe : les faits bruts uniquement (qui, quoi, quand, où) — maximum 4 phrases.
Deuxième paragraphe : une seule information de contexte indispensable pour comprendre l'événement — maximum 3 phrases.
Pas de développement, pas de réactions, pas de perspectives, pas de sous-titres.
Présent journalistique. Concision absolue.`,
  },
  {
    id: "narratif",
    label: "WSJ / Narratif",
    description: "Anecdote opener, nut graf, development, forward-looking close",
    instruction: `Structure : narrative (style Wall Street Journal).
Corps : 450-600 mots en markdown, 4 paragraphes.
Paragraphe 1 (accroche narrative) : commence par une scène concrète, une anecdote ou une citation frappante qui illustre le sujet sans énoncer la nouvelle directement.
Paragraphe 2 (nut graf) : énonce clairement la nouvelle, son importance et son contexte en 2-3 phrases.
Paragraphe 3 (développement) : faits, chiffres, contexte plus large et positions des acteurs concernés.
Paragraphe 4 (perspective) : une phrase ou question prospective sur les suites ou enjeux à venir.
Présent journalistique. Pas de sous-titres.`,
  },
  {
    id: "analyse",
    label: "Analyse / Décryptage",
    description: "600-800 words with subheadings, multiple angles weighed",
    instruction: `Structure : analyse / décryptage.
Corps : 600-800 mots en markdown avec sous-titres en gras (## format).
Introduction (1 paragraphe) : pose la problématique centrale sans anecdote.
Puis 2-3 sections thématiques, chacune précédée d'un sous-titre (## Le contexte / ## Les causes / ## Les enjeux / ou tout autre titre pertinent), chaque section développant un angle différent.
Conclusion (1 paragraphe) : synthèse ouverte sur les enjeux ou les inconnues restantes.
Présent journalistique. Ton analytique, pas de sensationnalisme.`,
  },
  {
    id: "qr",
    label: "Q&R / Essentiel",
    description: "Bold questions + short direct answers",
    instruction: `Structure : questions-réponses.
Corps : 300-450 mots en markdown.
4 à 5 questions en gras (** **), chacune suivie de 1-2 phrases de réponse directe sans formules introductives.
Questions obligatoires : **Que s'est-il passé ?** / **Pourquoi maintenant ?** / **Qui est concerné ?** / **Qu'est-ce que ça change ?**
Tu peux ajouter une cinquième question spécifique au sujet si pertinent.
Pas d'introduction ni de conclusion distinctes — commence directement par la première question.
Présent journalistique. Réponses concises et factuelles.`,
  },
  {
    id: "listicle",
    label: "Listicle / Points clés",
    description: "Brief intro + numbered key facts, scannable",
    instruction: `Structure : listicle / points clés.
Corps : 300-500 mots en markdown.
1-2 phrases d'introduction situant le sujet.
Puis une liste numérotée de 5 à 7 points clés — chaque point : titre court en gras + 1-2 phrases d'explication factuelle.
Terminer par une phrase de synthèse ou une note prospective après la liste.
Présent journalistique. Pas de sous-titres supplémentaires en dehors des titres de points.`,
  },
  {
    id: "chronologie",
    label: "Chronologie / Timeline",
    description: "Dated events building up to today's news",
    instruction: `Structure : chronologie / timeline.
Corps : 350-500 mots en markdown.
1-2 phrases d'introduction situant le contexte général.
Puis une liste chronologique d'événements datés, du plus ancien au plus récent, au format : **[Date ou période]** — description courte (1-2 phrases).
Minimum 5 entrées chronologiques ; la dernière correspond aux faits du jour.
Terminer par 1-2 phrases sur ce qui est attendu ou ce qu'il faut surveiller.
Présent journalistique pour les faits récents, passé composé pour les événements antérieurs.`,
  },
  {
    id: "contexte-dabord",
    label: "Contexte d'abord",
    description: "Background first, then the news — inverse of the classic pyramid",
    instruction: `Structure : contexte d'abord (pyramide inversée retournée).
Corps : 400-600 mots en markdown, 3-4 paragraphes.
Paragraphe 1 : le contexte général et les enjeux de fond — sans mentionner la nouvelle du jour.
Paragraphe 2 : introduit la nouvelle comme découlant naturellement du contexte (transition "C'est dans ce contexte que..." ou similaire).
Paragraphe 3 : réactions, positions des acteurs, chiffres et détails.
Paragraphe 4 : perspectives ou suites attendues.
Présent journalistique. Pas de sous-titres.`,
  },
  {
    id: "mise-en-perspective",
    label: "Mise en perspective",
    description: "Belgium vs neighbouring countries comparison",
    instruction: `Structure : mise en perspective comparative.
Corps : 500-700 mots en markdown, 3-4 paragraphes.
Paragraphe 1 : les faits et la situation en Belgique.
Paragraphes suivants : comparaison explicite avec au moins deux pays voisins (France, Pays-Bas ou Allemagne selon la pertinence du sujet), en soulignant similitudes et différences sur les plans politique, économique ou social.
Dernier paragraphe : ce que la comparaison révèle sur la spécificité ou les enjeux de la situation belge.
Présent journalistique. Chiffres et données comparatives bienvenus.`,
  },
  {
    id: "briefing",
    label: "Briefing structuré",
    description: "Four fixed sections: Les faits / Le contexte / Les réactions / Ce qu'il faut surveiller",
    instruction: `Structure : briefing structuré en quatre sections.
Corps : 400-600 mots en markdown avec exactement 4 sections titrées.
## Les faits — ce qui s'est passé, les chiffres-clés, la séquence des événements (2-4 phrases).
## Le contexte — pourquoi c'est important, les enjeux politiques ou sociaux de fond (2-4 phrases).
## Les réactions — positions des acteurs principaux, citations si disponibles (2-4 phrases).
## Ce qu'il faut surveiller — prochaines étapes, décisions attendues, signaux d'alerte (2-3 phrases).
Présent journalistique. Chaque section indépendante et directement utilisable.`,
  },
];

export const DEFAULT_STRUCTURE: StructureId = "pyramide-inversee";

export function findStructure(id: string | null | undefined): StructureTemplate {
  return (
    STRUCTURES.find((s) => s.id === id) ??
    STRUCTURES.find((s) => s.id === DEFAULT_STRUCTURE)!
  );
}

export interface ArticleStructureConfig {
  mode: "fixed" | "auto" | "per-journalist";
  fixed?: StructureId;
  allowlist?: StructureId[];
}

export const DEFAULT_ARTICLE_STRUCTURE_CONFIG: ArticleStructureConfig = {
  mode: "fixed",
  fixed: "pyramide-inversee",
  allowlist: STRUCTURES.map((s) => s.id),
};
