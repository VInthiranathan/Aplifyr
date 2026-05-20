import { useState, useEffect } from "react";

const FAVORITES_KEY = "applifyr_favorites";

export interface FavoriteJob {
  id: number | string;
  title: string;
  company: string;
  location: string;
  type?: string;
  grade?: "A" | "B" | "C";
  matchGrade?: "A" | "B" | "C";
  perks?: string[];
  isNew?: boolean;
  badge?: string | null;
  savedAt: number;
}

export function useFavorites() {
  const [favorites, setFavorites] = useState<FavoriteJob[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Load favorites from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(FAVORITES_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        setFavorites(parsed);
      }
    } catch (e) {
      console.error("Failed to load favorites:", e);
    }
    setLoaded(true);
  }, []);

  // Save to localStorage whenever favorites change
  useEffect(() => {
    if (loaded) {
      try {
        localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
      } catch (e) {
        console.error("Failed to save favorites:", e);
      }
    }
  }, [favorites, loaded]);

  const addFavorite = (job: Omit<FavoriteJob, "savedAt">) => {
    setFavorites((prev) => {
      // Avoid duplicates
      if (prev.some((f) => String(f.id) === String(job.id))) {
        return prev;
      }
      return [...prev, { ...job, savedAt: Date.now() }];
    });
  };

  const removeFavorite = (jobId: number | string) => {
    setFavorites((prev) => prev.filter((f) => String(f.id) !== String(jobId)));
  };

  const toggleFavorite = (job: Omit<FavoriteJob, "savedAt">) => {
    if (isFavorite(job.id)) {
      removeFavorite(job.id);
    } else {
      addFavorite(job);
    }
  };

  const isFavorite = (jobId: number | string) => {
    return favorites.some((f) => String(f.id) === String(jobId));
  };

  const clearAllFavorites = () => {
    setFavorites([]);
  };

  return {
    favorites,
    addFavorite,
    removeFavorite,
    toggleFavorite,
    isFavorite,
    clearAllFavorites,
    loaded,
  };
}
