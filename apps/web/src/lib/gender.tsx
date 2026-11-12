"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { Gender } from "./catalog";

interface GenderState {
  gender: Gender;
  setGender: (g: Gender) => void;
}

const GenderContext = createContext<GenderState | null>(null);

const STORAGE_KEY = "arshop:gender";

export function GenderProvider({ children }: { children: React.ReactNode }) {
  const [gender, setGenderState] = useState<Gender>("mujer");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw === "hombre" || raw === "mujer") setGenderState(raw);
    } catch {}
  }, []);

  const setGender = (g: Gender) => {
    setGenderState(g);
    try {
      localStorage.setItem(STORAGE_KEY, g);
    } catch {}
  };

  return (
    <GenderContext.Provider value={{ gender, setGender }}>
      {children}
    </GenderContext.Provider>
  );
}

export function useGender() {
  const ctx = useContext(GenderContext);
  if (!ctx) throw new Error("useGender must be used within GenderProvider");
  return ctx;
}
