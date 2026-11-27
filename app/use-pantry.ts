"use client";

import { useEffect, useState } from "react";
import { emptyPantry, readPantry, type Pantry } from "../lib/pantry";

const storageKey = "recipe-doctor-pantry-v1";

export function usePantry() {
  const [pantry, setPantry] = useState<Pantry>(emptyPantry);
  const [ready, setReady] = useState(false);
  const [storageFailed, setStorageFailed] = useState(false);
  useEffect(() => {
    try {
      setPantry(readPantry(localStorage.getItem(storageKey)));
    } catch {
      setStorageFailed(true);
    } finally {
      setReady(true);
    }
  }, []);
  useEffect(() => {
    if (!ready) return;
    try {
      if (pantry === emptyPantry) localStorage.removeItem(storageKey);
      else localStorage.setItem(storageKey, JSON.stringify(pantry));
    } catch {
      setStorageFailed(true);
    }
  }, [pantry, ready]);
  return { pantry, setPantry, ready, storageFailed };
}
