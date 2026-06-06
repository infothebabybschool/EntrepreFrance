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

export interface StructureInfo {
  id: StructureId;
  label: string;
  description: string;
}

export const STRUCTURES: StructureInfo[] = [
  { id: "pyramide-inversee",    label: "Pyramide inversée",        description: "Facts first, then context, reactions, perspectives" },
  { id: "flash",                label: "En bref / Flash",           description: "150-250 words, essential facts only" },
  { id: "narratif",             label: "WSJ / Narratif",            description: "Anecdote opener, nut graf, development, forward close" },
  { id: "analyse",              label: "Analyse / Décryptage",      description: "600-800 words with subheadings, multiple angles" },
  { id: "qr",                   label: "Q&R / Essentiel",           description: "Bold questions + short direct answers" },
  { id: "listicle",             label: "Listicle / Points clés",    description: "Brief intro + numbered key facts" },
  { id: "chronologie",          label: "Chronologie / Timeline",    description: "Dated events building to today's news" },
  { id: "contexte-dabord",      label: "Contexte d'abord",          description: "Background first, then the news" },
  { id: "mise-en-perspective",  label: "Mise en perspective",       description: "Belgium vs neighbouring countries comparison" },
  { id: "briefing",             label: "Briefing structuré",        description: "Les faits / Le contexte / Les réactions / Ce qu'il faut surveiller" },
];

export const DEFAULT_STRUCTURE: StructureId = "pyramide-inversee";
