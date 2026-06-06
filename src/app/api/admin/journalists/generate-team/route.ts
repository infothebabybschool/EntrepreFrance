import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import Anthropic from "@anthropic-ai/sdk";
import { createServerClient } from "@/lib/supabase/server";

function getClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set in environment variables");
  return new Anthropic({ apiKey });
}

interface PhotoOpts {
  gender: string;
  age: string;
  ethnicity: string;
  style: string;
  background: string;
}

interface TeamMember {
  name: string;
  slug: string;
  bio: string;
  specializations: string[];
  style_tags: string[];
  job_title: string;
  countries: string[];
  photo_opts: PhotoOpts;
}

function jobTitlePlan(count: number): string {
  if (count === 1) return "1 Rédacteur·rice en chef";
  if (count === 2) return "1 Rédacteur·rice en chef, 1 Journaliste";
  if (count <= 4) return `1 Rédacteur·rice en chef, ${count - 1} Journalistes`;
  if (count <= 6) return `1 Rédacteur·rice en chef, 1 Rédacteur·rice adjoint·e, ${count - 2} Journalistes`;
  if (count <= 10) return `1 Rédacteur·rice en chef, 1 Rédacteur·rice adjoint·e, 2 Chef·fes de rubrique, ${count - 4} Journalistes`;
  return `1 Rédacteur·rice en chef, 2 Rédacteur·rices adjoint·es, 3 Chef·fes de rubrique, ${count - 6} Journalistes`;
}

function buildPrompt(count: number, parity: number, diversity: number, countries: string[]): string {
  const womenCount = Math.round((parity / 100) * count);
  const menCount = count - womenCount;

  const diversityDesc =
    diversity < 20 ? "very low diversity: all journalists share the same cultural background"
    : diversity < 40 ? "low diversity: mostly one background with slight variation"
    : diversity < 60 ? "moderate diversity: mix of backgrounds"
    : diversity < 80 ? "high diversity: significant variety in origins and appearances"
    : "maximum diversity: very wide variety of origins representing the global community";

  const countryContext = countries.length > 0
    ? `The journalists come from or cover the following countries/regions: ${countries.join(", ")}. Names and backgrounds should reflect these countries.`
    : "The journalists work for a Belgian French-language newspaper. Names should reflect Belgian, French, or international backgrounds appropriate to the diversity setting.";

  return `You are a creative director building a fictional team of journalists for BEpaper, a Belgian French-language news site.

Generate exactly ${count} journalists:
- ${womenCount} women and ${menCount} men
- Diversity level: ${diversityDesc}
- ${countryContext}

Job title distribution (assign in this order, most senior first):
${jobTitlePlan(count)}

Use these exact job title strings matching gender:
- "Rédacteur en chef" (homme) or "Rédactrice en chef" (femme)
- "Rédacteur en chef adjoint" (homme) or "Rédactrice en chef adjointe" (femme)
- "Chef de rubrique" (homme) or "Cheffe de rubrique" (femme)
- "Journaliste" (both)

Categories: politique, société, culture, économie, europe (cover all 5 across the team)
Style tags (pick 1-3): analytique, terrain, opinion, data, enquête, portrait, investigation, correspondant, marchés, justice, droits, parlement, institutionnel, lifestyle, critique, vétéran

Rules:
- Names must be realistic and appropriate to the journalist's background/country
- Bios in French, 2-3 sentences about career and specialty
- photo_opts.ethnicity must visually match the journalist's actual background
- Senior roles (chef, adjoint) should have age 35-45 or 45-55
- photo_opts.style: "corporate" for senior roles, vary for others
- countries array: list 1-2 countries the journalist is from or covers

Respond ONLY with a valid JSON array. No markdown fences, no comments, no text outside the array:
[
  {
    "name": "Full Name",
    "slug": "url-slug-no-accents",
    "bio": "Bio in French...",
    "specializations": ["politique"],
    "style_tags": ["analytique"],
    "job_title": "Rédactrice en chef",
    "countries": ["Belgique"],
    "photo_opts": {
      "gender": "femme",
      "age": "45-55",
      "ethnicity": "europeenne",
      "style": "corporate",
      "background": "studio"
    }
  }
]`;
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as { count: number; parity: number; diversity: number; countries?: string[] };
  const { count = 6, parity = 50, diversity = 50, countries = [] } = body;

  if (count < 1 || count > 20) {
    return NextResponse.json({ error: "count must be between 1 and 20" }, { status: 400 });
  }

  const prompt = buildPrompt(count, parity, diversity, countries);

  // Step 1: Generate team with Claude
  let members: TeamMember[];
  try {
    const client = getClient();
    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    });

    const raw = message.content[0].type === "text" ? message.content[0].text.trim() : "";
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) throw new Error(`No JSON array in response. Got: ${raw.slice(0, 200)}`);
    members = JSON.parse(match[0]) as TeamMember[];
    if (!Array.isArray(members) || members.length === 0) {
      throw new Error("Claude returned an empty array");
    }
  } catch (err) {
    return NextResponse.json(
      { error: `Claude generation failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }

  // Step 2: Insert journalists into DB
  const supabase = createServerClient();
  const created: { id: string; name: string; photo_opts: PhotoOpts }[] = [];
  const errors: string[] = [];

  for (const m of members) {
    // Ensure unique slug
    let slug = (m.slug ?? "").replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "journalist";
    const { data: existing } = await supabase
      .from("journalists")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (existing) {
      slug = `${slug}-${Math.random().toString(36).slice(2, 5)}`;
    }

    const { data, error } = await supabase
      .from("journalists")
      .insert({
        name: m.name,
        slug,
        bio: m.bio ?? null,
        specializations: Array.isArray(m.specializations) ? m.specializations : [],
        style_tags: Array.isArray(m.style_tags) ? m.style_tags : [],
        job_title: m.job_title ?? "Journaliste",
        countries: Array.isArray(m.countries) ? m.countries : [],
        active: true,
      })
      .select("id")
      .single();

    if (error) {
      errors.push(`${m.name}: ${error.message}`);
      continue;
    }
    if (data) {
      created.push({ id: data.id, name: m.name, photo_opts: m.photo_opts ?? {} as PhotoOpts });
    }
  }

  if (created.length === 0) {
    return NextResponse.json(
      { error: `All ${members.length} DB inserts failed. First error: ${errors[0] ?? "unknown"}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ journalists: created, skipped: errors.length });
}
