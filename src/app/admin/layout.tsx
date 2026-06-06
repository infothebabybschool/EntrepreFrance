import Link from "next/link";
import { UserButton } from "@clerk/nextjs";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-100">
      {/* Admin top bar */}
      <div className="bg-navy-dark text-white px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link href="/" className="font-serif font-bold text-lg">
            BEpaper
          </Link>
          <span className="text-blue-300 text-xs uppercase tracking-widest font-sans">
            Administration
          </span>
          <nav className="flex gap-4 ml-4">
            <Link
              href="/admin"
              className="text-sm text-blue-200 hover:text-white transition-colors"
            >
              Articles
            </Link>
            <Link
              href="/admin/pipeline"
              className="text-sm text-blue-200 hover:text-white transition-colors"
            >
              Pipeline
            </Link>
            <Link
              href="/admin/middleend"
              className="text-sm text-blue-200 hover:text-white transition-colors"
            >
              MiddleEnd
            </Link>
            <Link
              href="/admin/backend"
              className="text-sm text-blue-200 hover:text-white transition-colors"
            >
              Back-end
            </Link>
            <Link
              href="/admin/analytics"
              className="text-sm text-blue-200 hover:text-white transition-colors"
            >
              Analytics
            </Link>
            <Link
              href="/admin/articles/new"
              className="text-sm text-blue-200 hover:text-white transition-colors"
            >
              + Nouvel article
            </Link>
          </nav>
        </div>
        <UserButton afterSignOutUrl="/" />
      </div>

      {/* Page content */}
      <div className="max-w-7xl mx-auto px-6 py-8">{children}</div>
    </div>
  );
}
