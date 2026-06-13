"use client";

import { useRouter } from "next/navigation";

export default function DeleteJournalistButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();

  async function handleDelete() {
    if (!confirm(`Supprimer ${name} ? Cette action est irréversible.`)) return;

    const res = await fetch(`/api/admin/journalists/${id}`, { method: "DELETE" });
    if (res.ok) {
      router.refresh();
    } else {
      const json = await res.json();
      alert(json.error ?? "Erreur lors de la suppression");
    }
  }

  return (
    <button onClick={handleDelete} className="text-red-500 hover:underline">
      Supprimer
    </button>
  );
}
