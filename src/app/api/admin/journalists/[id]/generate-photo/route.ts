import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createServerClient } from "@/lib/supabase/server";

interface Params { params: { id: string } }

interface PhotoOptions {
  gender?: string;
  age?: string;
  ethnicity?: string;
  style?: string;
  background?: string;
}

function buildPrompt(name: string, opts: PhotoOptions): string {
  const genderMap: Record<string, string> = {
    femme: "woman",
    homme: "man",
    "non-binaire": "non-binary person",
  };
  const gender = genderMap[opts.gender ?? ""] ?? "person";

  const ageMap: Record<string, string> = {
    "25-35": "in their late twenties to mid thirties",
    "35-45": "in their late thirties to mid forties",
    "45-55": "in their mid forties to mid fifties",
    "55+": "in their late fifties or older",
  };
  const age = ageMap[opts.age ?? ""] ?? "";

  const ethnicityMap: Record<string, string> = {
    europeenne: "of European appearance",
    africaine: "of African appearance",
    asiatique: "of Asian appearance",
    "moyen-orientale": "of Middle Eastern appearance",
    latina: "of Latino/a appearance",
    mixte: "of mixed ethnic appearance",
  };
  const ethnicity = ethnicityMap[opts.ethnicity ?? ""] ?? "";

  const styleMap: Record<string, string> = {
    corporate: "wearing business formal attire, polished and professional",
    decontracte: "wearing smart-casual attire, approachable and relaxed",
    creatif: "wearing creative professional attire, with personality",
    formel: "wearing formal dark suit and tie",
  };
  const style = styleMap[opts.style ?? ""] ?? "wearing business casual attire";

  const backgroundMap: Record<string, string> = {
    studio: "neutral grey studio background, consistent corporate setting",
    personnel: "unique natural background reflecting their personality, candid feel",
    exterieur: "outdoor urban setting, city environment",
  };
  const background = backgroundMap[opts.background ?? ""] ?? "neutral grey background";

  const parts = [
    `Professional editorial headshot photograph of a ${gender}`,
    age ? `${age}` : "",
    ethnicity ? `, ${ethnicity}` : "",
    `, ${style}.`,
    `${background}.`,
    `Direct gaze, 35mm portrait lens, natural professional lighting.`,
    `Photorealistic. The subject is named ${name} and works as a journalist for a Belgian French-language newspaper.`,
  ].filter(Boolean);

  return parts.join(" ");
}

export async function POST(req: NextRequest, { params }: Params) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({})) as PhotoOptions;

  const supabase = createServerClient();

  const { data: journalist, error: fetchError } = await supabase
    .from("journalists")
    .select("id, name")
    .eq("id", params.id)
    .single();

  if (fetchError || !journalist) {
    return NextResponse.json({ error: "Journalist not found" }, { status: 404 });
  }

  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) {
    return NextResponse.json({ error: "OPENAI_API_KEY not set" }, { status: 500 });
  }

  const prompt = buildPrompt(journalist.name, body);

  // Generate via DALL-E 3
  const genRes = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "dall-e-3", prompt, n: 1, size: "1024x1024", quality: "standard" }),
  });

  if (!genRes.ok) {
    const err = await genRes.text();
    return NextResponse.json({ error: `DALL-E 3 failed: ${err}` }, { status: 500 });
  }

  const genData = await genRes.json() as { data: { url: string }[] };
  const imageUrl = genData.data[0].url;

  // Download image
  const imgRes = await fetch(imageUrl);
  if (!imgRes.ok) {
    return NextResponse.json({ error: "Failed to download generated image" }, { status: 500 });
  }
  const imageBuffer = Buffer.from(await imgRes.arrayBuffer());

  // Upload to Supabase Storage via JS client (handles upsert reliably)
  const filename = `journalists/${params.id}.png`;
  const { error: uploadError } = await supabase.storage
    .from("article-images")
    .upload(filename, imageBuffer, {
      contentType: "image/png",
      upsert: true,
    });

  if (uploadError) {
    return NextResponse.json({ error: `Upload failed: ${uploadError.message}` }, { status: 500 });
  }

  const { data: urlData } = supabase.storage
    .from("article-images")
    .getPublicUrl(filename);

  // Append version param so CDN serves fresh image even if filename is reused
  const publicUrl = `${urlData.publicUrl}?v=${Date.now()}`;

  // Save to journalist record
  const { error: updateError } = await supabase
    .from("journalists")
    .update({ photo_url: publicUrl })
    .eq("id", params.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ photo_url: publicUrl });
}
