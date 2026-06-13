import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { SITE_NAME } from "@/lib/brand";

const SOURCES = ["pexels", "unsplash", "pixabay", "openverse"] as const;
type SourceName = (typeof SOURCES)[number];

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { source, keywords } = (await req.json()) as { source: string; keywords?: string[] };
  if (!source || !SOURCES.includes(source as SourceName)) {
    return NextResponse.json({ error: "Valid source required" }, { status: 400 });
  }

  const q = encodeURIComponent((keywords ?? ["news"]).join(" "));
  const src = source as SourceName;

  let url: string;
  const headers: Record<string, string> = {};

  switch (src) {
    case "pexels": {
      const key = process.env.PEXELS_API_KEY;
      if (!key) return NextResponse.json({ valid: false, error: "PEXELS_API_KEY not configured" });
      url = `https://api.pexels.com/v1/search?query=${q}&per_page=1&orientation=landscape`;
      headers["Authorization"] = key;
      break;
    }
    case "unsplash": {
      const key = process.env.UNSPLASH_ACCESS_KEY;
      if (!key) return NextResponse.json({ valid: false, error: "UNSPLASH_ACCESS_KEY not configured" });
      url = `https://api.unsplash.com/search/photos?query=${q}&per_page=1&orientation=landscape`;
      headers["Authorization"] = `Client-ID ${key}`;
      break;
    }
    case "pixabay": {
      const key = process.env.PIXABAY_API_KEY;
      if (!key) return NextResponse.json({ valid: false, error: "PIXABAY_API_KEY not configured" });
      url = `https://pixabay.com/api/?key=${key}&q=${q}&image_type=photo&orientation=horizontal&per_page=3`;
      break;
    }
    case "openverse": {
      url = `https://api.openverse.org/v1/images/?q=${q}&license_type=commercial&aspect_ratio=wide&page_size=1`;
      headers["User-Agent"] = `${SITE_NAME}-Bot/1.0`;
      break;
    }
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(url!, { headers, signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) return NextResponse.json({ valid: false, error: `HTTP ${res.status}` });

    const data = await res.json();
    let sampleUrl: string | null = null;

    switch (src) {
      case "pexels":    sampleUrl = data.photos?.[0]?.src?.large ?? null; break;
      case "unsplash":  sampleUrl = data.results?.[0]?.urls?.regular ?? null; break;
      case "pixabay":   sampleUrl = data.hits?.[0]?.largeImageURL ?? null; break;
      case "openverse": sampleUrl = data.results?.[0]?.url ?? null; break;
    }

    if (!sampleUrl) return NextResponse.json({ valid: false, error: "No images found for test query" });
    return NextResponse.json({ valid: true, sampleUrl });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Network error";
    return NextResponse.json({ valid: false, error: msg });
  }
}
