"use client";

import Link from "next/link";
import { SignedIn, SignedOut, SignInButton, UserButton, useUser } from "@clerk/nextjs";
import { CATEGORIES, CATEGORY_TO_SLUG, capitalizeCategory } from "@/lib/utils";
import { ADMIN_USER_IDS } from "@/lib/admin";
import { SITE_NAME, TAGLINE } from "@/lib/brand";

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
    <header className="bg-navy text-white">
      {/* Top bar */}
      <div className="border-b border-navy-light">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="font-serif text-3xl font-bold tracking-tight">
            {SITE_NAME}
          </Link>
          <div className="flex items-center gap-4">
            <p className="hidden sm:block text-sm text-blue-200 italic">
              {TAGLINE}
            </p>
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
        <ul className="flex gap-1 overflow-x-auto py-0">
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
      </nav>
    </header>
  );
}
