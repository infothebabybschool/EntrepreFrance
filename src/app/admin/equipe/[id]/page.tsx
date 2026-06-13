import { notFound } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import JournalistForm from "@/components/admin/JournalistForm";
import { Journalist } from "@/types";

export const dynamic = "force-dynamic";

interface Props { params: { id: string } }

export default async function EditJournalistePage({ params }: Props) {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("journalists")
    .select("*")
    .eq("id", params.id)
    .single();

  if (error || !data) notFound();

  return (
    <div>
      <h1 className="font-serif text-2xl font-bold text-gray-900 mb-6">
        Modifier — {data.name}
      </h1>
      <JournalistForm journalist={data as Journalist} />
    </div>
  );
}
