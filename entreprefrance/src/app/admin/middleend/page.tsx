import Link from "next/link";
import Image from "next/image";
import { createServerClient } from "@/lib/supabase/server";
import { capitalizeCategory } from "@/lib/utils";
import DeleteJournalistButton from "../equipe/DeleteJournalistButton";
import GenerateTeamPanel from "@/components/admin/GenerateTeamPanel";
import BylineSettingsPanel from "@/components/admin/BylineSettingsPanel";
import TabNav from "./TabNav";
import RetroPubliPanel from "./RetroPubliPanel";

export const dynamic = "force-dynamic";

const TITLE_RANK: Record<string, number> = {
  "Rédacteur en chef": 1,
  "Rédactrice en chef": 1,
  "Rédacteur en chef adjoint": 2,
  "Rédactrice en chef adjointe": 2,
  "Rédacteur adjoint": 2,
  "Rédactrice adjointe": 2,
  "Chef de rubrique": 3,
  "Cheffe de rubrique": 3,
};
function rank(title: string | null): number {
  if (!title) return 4;
  return TITLE_RANK[title] ?? 4;
}

export default async function MiddleEndPage({
  searchParams,
}: {
  searchParams: { tab?: string };
}) {
  const tab = searchParams.tab === "retropubli" ? "retropubli" : "team";

  // Fetch journalists for Team tab
  const supabase = createServerClient();
  const { data: journalists } = await supabase
    .from("journalists")
    .select("*")
    .order("name", { ascending: true });

  const byRank: Record<number, typeof journalists> = {};
  if (journalists) {
    for (const j of journalists) {
      const r = rank(j.job_title);
      if (!byRank[r]) byRank[r] = [];
      byRank[r]!.push(j);
    }
  }
  const hasOrgData = journalists?.some((j) => j.job_title && j.job_title !== "Journaliste");

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-serif text-2xl font-bold text-gray-900">MiddleEnd</h1>
        {tab === "team" && (
          <Link
            href="/admin/equipe/nouveau"
            className="bg-navy text-white text-sm font-medium px-4 py-2 rounded hover:bg-navy-light transition-colors"
          >
            + Nouveau journaliste
          </Link>
        )}
      </div>

      <TabNav active={tab} />

      {/* ── TEAM TAB ─────────────────────────────────── */}
      {tab === "team" && (
        <div>
          <BylineSettingsPanel />
          <GenerateTeamPanel />

          {!journalists?.length ? (
            <p className="text-gray-500 text-sm">Aucun journaliste pour l&apos;instant.</p>
          ) : (
            <>
              {hasOrgData && (
                <div className="mb-8">
                  <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
                    Organigramme
                  </h2>
                  <div className="overflow-x-auto">
                    <div className="flex flex-col items-center gap-2 min-w-max">
                      {[1, 2, 3, 4].map((r) => {
                        const group = byRank[r];
                        if (!group?.length) return null;
                        return (
                          <div key={r} className="flex flex-col items-center w-full">
                            {r > 1 && <div className="w-px h-5 bg-gray-300" />}
                            <div className="flex flex-wrap justify-center gap-3">
                              {group.map((j) => <OrgCard key={j.id} journalist={j} />)}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
                Tous les journalistes
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {journalists.map((j) => (
                  <div key={j.id} className="bg-white border border-gray-200 rounded p-4 flex gap-4">
                    <div className="flex-shrink-0">
                      {j.photo_url ? (
                        <div className="relative w-14 h-14 rounded-full overflow-hidden border border-gray-200">
                          <Image src={j.photo_url} alt={j.name} fill className="object-cover" unoptimized />
                        </div>
                      ) : (
                        <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 font-bold text-xl">
                          {j.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold text-gray-900 text-sm">{j.name}</p>
                          {j.job_title && <p className="text-xs text-gray-500">{j.job_title}</p>}
                          {!j.active && (
                            <span className="inline-block text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
                              inactif
                            </span>
                          )}
                        </div>
                        <div className="flex gap-2 text-xs flex-shrink-0">
                          <Link href={`/admin/equipe/${j.id}`} className="text-navy hover:underline">
                            Modifier
                          </Link>
                          <DeleteJournalistButton id={j.id} name={j.name} />
                        </div>
                      </div>
                      {j.specializations?.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {j.specializations.map((s: string) => (
                            <span key={s} className="text-xs bg-accent/10 text-accent px-1.5 py-0.5 rounded">
                              {capitalizeCategory(s)}
                            </span>
                          ))}
                        </div>
                      )}
                      {j.style_tags?.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {j.style_tags.map((t: string) => (
                            <span key={t} className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
                              {t}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── RETROPUBLI TAB ───────────────────────────── */}
      {tab === "retropubli" && <RetroPubliPanel />}
    </div>
  );
}

function OrgCard({
  journalist,
}: {
  journalist: { id: string; name: string; photo_url: string | null; job_title: string | null };
}) {
  return (
    <div className="flex flex-col items-center gap-1 bg-white border border-gray-200 rounded px-3 py-2 w-32 text-center shadow-sm">
      {journalist.photo_url ? (
        <div className="relative w-10 h-10 rounded-full overflow-hidden border border-gray-200">
          <Image src={journalist.photo_url} alt={journalist.name} fill className="object-cover" unoptimized />
        </div>
      ) : (
        <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 font-bold">
          {journalist.name.charAt(0).toUpperCase()}
        </div>
      )}
      <p className="text-xs font-semibold text-gray-800 leading-tight">{journalist.name}</p>
      {journalist.job_title && (
        <p className="text-[10px] text-gray-400 leading-tight">{journalist.job_title}</p>
      )}
    </div>
  );
}
