import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createServerClient } from "@/lib/supabase/server";
import { slugify } from "@/lib/utils";
import { CATEGORIES } from "@/lib/utils";

// POST /api/admin/articles — create article from admin form (Clerk-protected)
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
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

  let slug = slugify(title as string);
  const { data: existing } = await supabase
    .from("articles")
    .select("id")
    .eq("slug", slug)
    .single();

  if (existing) {
    slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
  }

  // If published but no published_at, default to now
  const published_at =
    body.published_at ??
    (body.status === "published" ? new Date().toISOString() : null);

  const { data, error } = await supabase
    .from("articles")
    .insert({
      title,
      slug,
      chapo: body.chapo ?? null,
      body: body.body ?? null,
      category,
      featured_image_url: body.featured_image_url ?? null,
      image_credit: body.image_credit ?? null,
      status: body.status ?? "draft",
      published_at,
      source_urls: body.source_urls ?? null,
      tags: body.tags ?? null,
      journalist_id: body.journalist_id ?? null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ article: data }, { status: 201 });
}
