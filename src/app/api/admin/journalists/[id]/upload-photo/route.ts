import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createServerClient } from "@/lib/supabase/server";

interface Params { params: { id: string } }

export async function POST(req: NextRequest, { params }: Params) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("photo") as File | null;
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
  const contentType = file.type || "image/jpeg";
  const filename = `journalists/${params.id}.${ext}`;

  const buffer = Buffer.from(await file.arrayBuffer());

  const supabase = createServerClient();

  const { error: uploadError } = await supabase.storage
    .from("article-images")
    .upload(filename, buffer, { contentType, upsert: true });

  if (uploadError) {
    return NextResponse.json({ error: `Upload failed: ${uploadError.message}` }, { status: 500 });
  }

  const { data: urlData } = supabase.storage
    .from("article-images")
    .getPublicUrl(filename);

  const publicUrl = `${urlData.publicUrl}?v=${Date.now()}`;

  const { error } = await supabase
    .from("journalists")
    .update({ photo_url: publicUrl })
    .eq("id", params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ photo_url: publicUrl });
}
