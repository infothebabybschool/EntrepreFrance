import { Metadata } from "next";
import ArticleForm from "@/components/admin/ArticleForm";

export const metadata: Metadata = { title: "Nouvel article — Admin" };

export default function NewArticlePage() {
  return (
    <div>
      <h1 className="font-serif text-2xl font-bold text-gray-900 mb-6">
        Nouvel article
      </h1>
      <ArticleForm />
    </div>
  );
}
