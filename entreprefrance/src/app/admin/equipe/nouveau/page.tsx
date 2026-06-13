import JournalistForm from "@/components/admin/JournalistForm";

export default function NouveauJournalistePage() {
  return (
    <div>
      <h1 className="font-serif text-2xl font-bold text-gray-900 mb-6">
        Nouveau journaliste
      </h1>
      <JournalistForm />
    </div>
  );
}
