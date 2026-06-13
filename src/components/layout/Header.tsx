"use client";

import Link from "next/link";
import { SignedIn, SignedOut, SignInButton, UserButton, useUser } from "@clerk/nextjs";
import { CATEGORIES, CATEGORY_TO_SLUG, capitalizeCategory } from "@/lib/utils";
import { ADMIN_USER_IDS } from "@/lib/admin";
import { SITE_NAME, TAGLINE, LOGO_URL } from "@/lib/brand";
import { STICKY_HEADER, SEARCH_BAR_IN_HEADER, DARK_MODE_ENABLED, SEARCH_ENABLED } from "@/lib/site-config";
import DarkModeToggle from "@/components/ui/DarkModeToggle";

function HeaderUserNav() {
  const { user } = useUser();
  const isAdmin = user ? ADMIN_USER_IDS.includes(user.id) : false;

  return (
    <>
      <Link
        href={isAdmin ? "/admin" : "/mon-compte"}
        className="text-xs font-sans text-blue-200 hover:text-white transition-colors mr-1"
      >
        {isAdmin ? "Admin" : "Mon compte"}
      </Link>
      <UserButton afterSignOutUrl="/" />
    </>
  );
}

export default function Header() {
  return (
    <header className={`bg-navy text-white${STICKY_HEADER ? " sticky top-0 z-50" : ""}`}>
      {/* Top bar */}
      <div className="border-b border-navy-light">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center">
            {LOGO_URL ? (
              <img src={LOGO_URL} alt={SITE_NAME} className="h-10 w-auto max-w-[200px] object-contain" />
            ) : (
              <span className="font-serif text-3xl font-bold tracking-tight">{SITE_NAME}</span>
            )}
          </Link>
          <div className="flex items-center gap-4">
            <p className="hidden sm:block text-sm text-blue-200 italic">
              {TAGLINE}
            </p>
            {DARK_MODE_ENABLED && <DarkModeToggle />}
            <SignedOut>
              <SignInButton mode="modal">
                <button className="text-xs font-sans text-blue-200 hover:text-white transition-colors">
                  Connexion
                </button>
              </SignInButton>
            </SignedOut>
            <SignedIn>
              <HeaderUserNav />
            </SignedIn>
          </div>
        </div>
      </div>
      {/* Category navigation */}
      <nav className="max-w-7xl mx-auto px-4">
        <div className="flex items-center gap-1">
          <ul className="flex gap-1 overflow-x-auto py-0 flex-1">
            {CATEGORIES.map((cat) => (
              <li key={cat}>
                <Link
                  href={`/categorie/${CATEGORY_TO_SLUG[cat]}`}
                  className="block px-4 py-3 text-sm font-sans font-medium text-blue-100
                             hover:text-white hover:bg-navy-light transition-colors
                             whitespace-nowrap border-b-2 border-transparent
                             hover:border-accent"
                >
                  {capitalizeCategory(cat)}
                </Link>
              </li>
            ))}
          </ul>
          {(SEARCH_BAR_IN_HEADER || SEARCH_ENABLED) && (
            <Link
              href="/recherche"
              className="hidden sm:flex items-center gap-2 text-sm bg-navy-light text-blue-300
                         border border-blue-700 rounded px-3 py-1.5 hover:border-accent
                         hover:text-white transition-colors w-48 shrink-0"
              aria-label="Aller à la recherche"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              Rechercher…
            </Link>
          )}
        </div>
      </nav>
    </header>
  );
}
