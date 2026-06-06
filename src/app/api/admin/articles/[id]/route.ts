import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createServerClient } from "@/lib/supabase/server";
import { CATEGORIES } from "@/lib/utils";

interface Params {
  params: { id: string };
}

// PATCH /api/admin/articles/[id] — update article
export async function PATCH(req: NextRequest, { params }: Params) {
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

  if (
    body.category &&
    !CATEGORIES.includes(body.category as (typeof CATEGORIES)[number])
  ) {
    return NextResponse.json(
      { error: `category must be one of: ${CATEGORIES.join(", ")}` },
      { status: 400 }
    );
  }

  // If changing to published and no published_at set, default to now
  const updates: Record<string, unknown> = { ...body };
  if (body.status === "published" && !body.published_at) {
    updates.published_at = new Date().toISOString();
  }

  const supabase = createServerClient();

  const { data, error } = await supabase
    .from("articles")
    .update(updates)
    .eq("id", params.id)
    .is("deleted_at", null)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ article: data });
}

// DELETE /api/admin/articles/[id] — soft delete
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServerClient();

  const { error } = await supabase
    .from("articles")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", params.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
