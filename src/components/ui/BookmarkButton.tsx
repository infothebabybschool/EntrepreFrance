"use client";

import { useState, useEffect } from "react";

const STORAGE_KEY = "bookmarks";

interface Props {
  slug: string;
}

function getBookmarks(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function setBookmarks(slugs: string[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(slugs));
  } catch {
    // localStorage not available
  }
}

export default function BookmarkButton({ slug }: Props) {
  const [bookmarked, setBookmarked] = useState(false);

  useEffect(() => {
    setBookmarked(getBookmarks().includes(slug));
  }, [slug]);

  function toggle() {
    const current = getBookmarks();
    let next: string[];
    if (current.includes(slug)) {
      next = current.filter((s) => s !== slug);
    } else {
      next = [...current, slug];
    }
    setBookmarks(next);
    setBookmarked(next.includes(slug));
  }

  return (
    <button
      onClick={toggle}
      aria-label="Enregistrer l'article"
      title="Enregistrer l'article"
      className={`inline-flex items-center gap-1 p-1.5 rounded transition-colors
        ${bookmarked
          ? "text-navy"
          : "text-gray-400 hover:text-navy"
        }`}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill={bookmarked ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
      </svg>
    </button>
  );
}
