export interface Journalist {
  id: string;
  name: string;
  slug: string;
  bio: string | null;
  photo_url: string | null;
  specializations: string[];
  style_tags: string[];
  job_title: string | null;
  countries: string[];
  article_structure: string | null;
  active: boolean;
  created_at: string;
}

export interface Article {
  id: string;
  title: string;
  slug: string;
  chapo: string | null;
  body: string | null;
  category: string;
  featured_image_url: string | null;
  image_credit: string | null;
  status: "draft" | "published";
  published_at: string | null;
  created_at: string;
  source_urls: string[] | null;
  tags: string[] | null;
  deleted_at: string | null;
  journalist_id: string | null;
  journalist?: Pick<Journalist, "id" | "name" | "slug" | "photo_url"> | null;
}

export interface ReadingHistoryEntry {
  id: string;
  read_at: string;
  articles: Pick<Article, "id" | "title" | "slug" | "chapo" | "category" | "featured_image_url" | "published_at"> | null;
}

export interface NewsletterSubscriber {
  id: string;
  email: string;
  confirmed: boolean;
  created_at: string;
}
