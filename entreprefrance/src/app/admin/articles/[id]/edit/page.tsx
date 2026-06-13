import { notFound } from "next/navigation";
import { Metadata } from "next";
import { createServerClient } from "@/lib/supabase/server";
import ArticleForm from "@/components/admin/ArticleForm";
import { Article } from "@/types";

export const dynamic = "force-dynamic";

interface Props {
  params: { id: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const supabase = createServerClient();
  const { data } = await supabase
    .from("articles")
    .select("title")
    .eq("id", params.id)
    .single();

  return { title: data ? `Modifier : ${data.title}` : "Modifier l'article" };
}

export default async function EditArticlePage({ params }: Props) {
  const supabase = createServerClient();

  const { data: article, error } = await supabase
    .from("articles")
    .select("*")
    .eq("id", params.id)
    .is("deleted_at", null)
    .single();

  if (error || !article) {
    notFound();
  }

  return (
    <div>
      <h1 className="font-serif text-2xl font-bold text-gray-900 mb-6">
        Modifier l&apos;article
      </h1>
      <ArticleForm article={article as Article} />
    </div>
  );
}
