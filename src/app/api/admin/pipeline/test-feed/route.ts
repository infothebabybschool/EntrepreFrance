import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { url } = await req.json();
  if (!url || typeof url !== "string" || !url.startsWith("http")) {
    return NextResponse.json({ error: "Valid URL required" }, { status: 400 });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 BEpaper-Bot" },
      signal: controller.signal,
      redirect: "follow",
    });
    clearTimeout(timeout);

    if (!res.ok) {
      const msg = res.status === 403
        ? `HTTP 403 — ce site bloque les requêtes automatiques`
        : `HTTP ${res.status}`;
      return NextResponse.json({ valid: false, error: msg });
    }

    const body = await res.text();
    const items = body.match(/<item[\s>][\s\S]*?<\/item>/g) ?? [];

    if (items.length === 0) {
      return NextResponse.json({ valid: false, error: "Aucun article trouvé dans ce flux" });
    }

    return NextResponse.json({ valid: true, itemCount: items.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erreur réseau";
    return NextResponse.json({ valid: false, error: msg });
  }
}
