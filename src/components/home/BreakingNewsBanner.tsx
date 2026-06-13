"use client";

import { useState, useEffect } from "react";
import { BREAKING_NEWS_TEXT } from "@/lib/site-config";

const DISMISS_KEY = "breaking-news-dismissed";

export default function BreakingNewsBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!BREAKING_NEWS_TEXT) return;
    try {
      const dismissed = sessionStorage.getItem(DISMISS_KEY);
      if (!dismissed) {
        setVisible(true);
      }
    } catch {
      setVisible(true);
    }
  }, []);

  function dismiss() {
    setVisible(false);
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // sessionStorage not available
    }
  }

  if (!BREAKING_NEWS_TEXT || !visible) return null;

  return (
    <div
      role="alert"
      className="flex items-center gap-3 px-4 py-3 bg-yellow-50 border-l-4 border-accent
                 text-sm font-sans"
    >
      <span className="shrink-0 font-bold text-accent uppercase tracking-widest text-xs">
        Urgent
      </span>
      <span className="flex-1 text-gray-800 leading-snug">{BREAKING_NEWS_TEXT}</span>
      <button
        onClick={dismiss}
        aria-label="Fermer le bandeau"
        className="shrink-0 text-gray-400 hover:text-gray-700 transition-colors p-1 rounded"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}
