"use client";

import { useCallback, useEffect, useState } from "react";

const KEY = "arshop:recent-searches";
const MAX = 6;

export function useRecentSearches() {
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setRecent(parsed.slice(0, MAX));
      }
    } catch {}
  }, []);

  const persist = (list: string[]) => {
    setRecent(list);
    try {
      localStorage.setItem(KEY, JSON.stringify(list));
    } catch {}
  };

  const push = useCallback(
    (q: string) => {
      const trimmed = q.trim();
      if (trimmed.length < 2) return;
      setRecent((prev) => {
        const next = [trimmed, ...prev.filter((x) => x.toLowerCase() !== trimmed.toLowerCase())].slice(0, MAX);
        try {
          localStorage.setItem(KEY, JSON.stringify(next));
        } catch {}
        return next;
      });
    },
    [],
  );

  const remove = useCallback((q: string) => {
    setRecent((prev) => {
      const next = prev.filter((x) => x !== q);
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  const clear = useCallback(() => persist([]), []);

  return { recent, push, remove, clear };
}
