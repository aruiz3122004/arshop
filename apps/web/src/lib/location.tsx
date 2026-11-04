"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { DEFAULT_LOCATION } from "./colombia";

export interface Location {
  department: string;
  city: string;
}

interface LocationState {
  location: Location;
  setLocation: (loc: Location) => void;
}

const LocationContext = createContext<LocationState | null>(null);

const STORAGE_KEY = "arshop:location";

export function LocationProvider({ children }: { children: React.ReactNode }) {
  const [location, setLocationState] = useState<Location>(DEFAULT_LOCATION);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Location;
        if (parsed?.department && parsed?.city) setLocationState(parsed);
      }
    } catch {}
  }, []);

  const setLocation = (loc: Location) => {
    setLocationState(loc);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(loc));
    } catch {}
  };

  return (
    <LocationContext.Provider value={{ location, setLocation }}>
      {children}
    </LocationContext.Provider>
  );
}

export function useLocation() {
  const ctx = useContext(LocationContext);
  if (!ctx) throw new Error("useLocation must be used within LocationProvider");
  return ctx;
}
