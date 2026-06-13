"use client";

import { useState, useEffect } from "react";

type TextSize = "sm" | "base" | "lg";

const SIZE_KEY = "article-text-size";

const SIZE_CLASSES: Record<TextSize, string> = {
  sm: "text-sm",
  base: "text-base",
  lg: "text-lg",
};

interface Props {
  children: React.ReactNode;
}

export default function TextSizeControl({ children }: Props) {
  const [size, setSize] = useState<TextSize>("base");

  useEffect(() => {
    try {
      const stored = localStorage.getItem(SIZE_KEY) as TextSize | null;
      if (stored && stored in SIZE_CLASSES) {
        setSize(stored);
      }
    } catch {
      // localStorage not available
    }
  }, []);

  function changeSize(next: TextSize) {
    setSize(next);
    try {
      localStorage.setItem(SIZE_KEY, next);
    } catch {
      // localStorage not available
    }
  }

  return (
    <div>
      {/* A- / A+ controls */}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xs text-gray-400 font-sans">Taille du texte&nbsp;:</span>
        <button
          onClick={() => changeSize("sm")}
          aria-label="Texte petit"
          aria-pressed={size === "sm"}
          className={`w-7 h-7 rounded border text-sm font-serif font-bold transition-colors
            ${size === "sm"
              ? "bg-navy text-white border-navy"
              : "bg-white text-gray-600 border-gray-300 hover:border-navy hover:text-navy"
            }`}
        >
          A
        </button>
        <button
          onClick={() => changeSize("base")}
          aria-label="Texte normal"
          aria-pressed={size === "base"}
          className={`w-7 h-7 rounded border text-base font-serif font-bold transition-colors
            ${size === "base"
              ? "bg-navy text-white border-navy"
              : "bg-white text-gray-600 border-gray-300 hover:border-navy hover:text-navy"
            }`}
        >
          A
        </button>
        <button
          onClick={() => changeSize("lg")}
          aria-label="Texte grand"
          aria-pressed={size === "lg"}
          className={`w-8 h-8 rounded border text-lg font-serif font-bold transition-colors
            ${size === "lg"
              ? "bg-navy text-white border-navy"
              : "bg-white text-gray-600 border-gray-300 hover:border-navy hover:text-navy"
            }`}
        >
          A
        </button>
      </div>

      {/* Content wrapper with dynamic size class */}
      <div className={SIZE_CLASSES[size]}>
        {children}
      </div>
    </div>
  );
}
