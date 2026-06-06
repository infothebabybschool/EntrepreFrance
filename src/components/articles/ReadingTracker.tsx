"use client";

import { useEffect } from "react";
import { useAuth } from "@clerk/nextjs";

export default function ReadingTracker({ articleId }: { articleId: string }) {
  const { isSignedIn } = useAuth();

  useEffect(() => {
    if (!isSignedIn || !articleId) return;

    fetch("/api/reading-history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ articleId }),
    }).catch(() => {
      // Silent fail — reading history is non-critical
    });
  }, [isSignedIn, articleId]);

  return null;
}
