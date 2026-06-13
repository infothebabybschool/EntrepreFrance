import slugifyLib from "slugify";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";

export const CATEGORIES = [
  "Entrepreneuriat et Startups",
  "Technologie et Innovation",
  "Économie et Marché",
  "Finance et Investissement",
  "Leadership et Développement"
] as const;

export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_TO_SLUG: Record<string, string> = {
  "Entrepreneuriat et Startups": "entrepreneuriat-startups",
  "Technologie et Innovation": "technologie-innovation",
  "Économie et Marché": "economie-marche",
  "Finance et Investissement": "finance-investissement",
  "Leadership et Développement": "leadership-developpement"
};

export const SLUG_TO_CATEGORY: Record<string, string> = {
  "entrepreneuriat-startups": "Entrepreneuriat et Startups",
  "technologie-innovation": "Technologie et Innovation",
  "economie-marche": "Économie et Marché",
  "finance-investissement": "Finance et Investissement",
  "leadership-developpement": "Leadership et Développement"
};

export const CATEGORY_SLUGS = Object.values(CATEGORY_TO_SLUG);

export function slugify(title: string): string {
  return slugifyLib(title, { lower: true, strict: true, locale: "fr" });
}

export function formatTimeAgo(date: string | Date): string {
  return formatDistanceToNow(new Date(date), { addSuffix: true, locale: fr });
}

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric", month: "long", year: "numeric",
  }).format(new Date(date));
}

export function capitalizeCategory(category: string): string {
  return category.charAt(0).toUpperCase() + category.slice(1);
}