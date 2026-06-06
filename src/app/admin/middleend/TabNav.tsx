"use client";

import { useRouter } from "next/navigation";

interface Props {
  active: "team" | "retropubli";
}

export default function TabNav({ active }: Props) {
  const router = useRouter();

  const tabs: { key: "team" | "retropubli"; label: string }[] = [
    { key: "team", label: "Team" },
    { key: "retropubli", label: "RetroPubli" },
  ];

  return (
    <div className="flex gap-1 border-b border-gray-200 mb-8">
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => router.push(`/admin/middleend?tab=${t.key}`)}
          className={`px-5 py-2.5 text-sm font-medium font-sans border-b-2 -mb-px transition-colors ${
            active === t.key
              ? "border-navy text-navy"
              : "border-transparent text-gray-500 hover:text-gray-800"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
