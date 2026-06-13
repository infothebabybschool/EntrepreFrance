import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { slugify } from "@/lib/utils";
import { CATEGORIES } from "@/lib/utils";

// GET /api/articles
// Public — returns published, non-deleted articles.
// Optional query params: ?category=politique&limit=50
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category");
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50"), 100);

  const supabase = createServerClient();

  let query = supabase
    .from("articles")
    .select(
      "id, title, slug, chapo, category, featured_image_url, image_credit, published_at, tags, journalist_id, journalists(id, name, slug, photo_url)"
    )
    .eq("status", "published")
    .lte("published_at", new Date().toISOString())
    .is("deleted_at", null)
    .order("published_at", { ascending: false })
    .limit(limit);

  if (category && CATEGORIES.includes(category as (typeof CATEGORIES)[number])) {
    query = query.eq("category", category);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ articles: data });
}

// POST /api/articles
// Protected by ARTICLES_API_SECRET in Authorization header.
// Used by the automated pipeline — not browser clients.
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const secret = process.env.ARTICLES_API_SECRET;

  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { title, category } = body;

  if (!title || typeof title !== "string") {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }
  if (!category || !CATEGORIES.includes(category as (typeof CATEGORIES)[number])) {
    return NextResponse.json(
      { error: `category must be one of: ${CATEGORIES.join(", ")}` },
      { status: 400 }
    );
  }

  const supabase = createServerClient();

  // Auto-generate slug if not provided; append random suffix on collision
  let slug = typeof body.slug === "string" && body.slug ? body.slug : slugify(title);

  const { data: existing } = await supabase
    .from("articles")
    .select("id")
    .eq("slug", slug)
    .single();

  if (existing) {
    slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
  }

  const payload = {
    title,
    slug,
    chapo: body.chapo ?? null,
    body: body.body ?? null,
    category,
    featured_image_url: body.featured_image_url ?? null,
    image_credit: body.image_credit ?? null,
    status: body.status ?? "draft",
    published_at: body.published_at ?? null,
    source_urls: body.source_urls ?? null,
    tags: body.tags ?? null,
    journalist_id: body.journalist_id ?? null,
  };

  const { data, error } = await supabase
    .from("articles")
    .insert(payload)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ article: data }, { status: 201 });
}
