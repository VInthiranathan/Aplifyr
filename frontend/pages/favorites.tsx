import type { GetStaticProps } from "next";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";
import { useFavorites } from "../lib/useFavorites";
import { useState, useMemo } from "react";
import Link from "next/link";
import { Search, Bookmark, Trash2, MapPin, Briefcase } from "lucide-react";

export const getStaticProps: GetStaticProps = async ({ locale }) => ({
  props: { ...(await serverSideTranslations(locale ?? "en", ["common"])) },
});

export default function FavoritesPage() {
  const { favorites, removeFavorite, clearAllFavorites, loaded } =
    useFavorites();
  const [searchQuery, setSearchQuery] = useState("");

  const filteredFavorites = useMemo(() => {
    if (!searchQuery.trim()) return favorites;
    const q = searchQuery.toLowerCase();
    return favorites.filter(
      (job) =>
        job.title.toLowerCase().includes(q) ||
        job.company.toLowerCase().includes(q) ||
        job.location.toLowerCase().includes(q),
    );
  }, [favorites, searchQuery]);

  if (!loaded) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-[#0d0d0d] p-8">
        <div className="max-w-7xl mx-auto">
          <p className="text-gray-400 dark:text-white/40">
            Laddar favoriter...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#0d0d0d] p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">
              Mina Favoriter
            </h1>
            <p className="text-gray-500 dark:text-white/60">
              {favorites.length}{" "}
              {favorites.length === 1 ? "sparad jobb" : "sparade jobb"}
            </p>
          </div>

          {favorites.length > 0 && (
            <button
              onClick={() => {
                if (
                  confirm("Är du säker på att du vill ta bort alla favoriter?")
                ) {
                  clearAllFavorites();
                }
              }}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/40 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
            >
              <Trash2 size={16} />
              Rensa alla
            </button>
          )}
        </div>

        {/* Search */}
        {favorites.length > 0 && (
          <div className="relative">
            <Search
              size={18}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 dark:text-white/30"
            />
            <input
              type="text"
              placeholder="Sök bland favoriter..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-white/10 rounded-2xl pl-12 pr-4 py-3 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/30 focus:outline-none focus:border-purple-400 dark:focus:border-purple-500/50"
            />
          </div>
        )}

        {/* Empty state */}
        {favorites.length === 0 && (
          <div className="bg-white dark:bg-[#1a1a1a] rounded-3xl p-16 border border-gray-200 dark:border-white/5 text-center">
            <Bookmark
              size={64}
              className="mx-auto mb-4 text-gray-300 dark:text-white/20"
            />
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
              Inga favoriter än
            </h2>
            <p className="text-gray-500 dark:text-white/50 mb-6">
              Spara jobb du är intresserad av genom att klicka på
              bokmärkesikonen
            </p>
            <Link
              href="/jobs"
              className="inline-block px-6 py-3 rounded-xl bg-purple-600 text-white font-medium hover:bg-purple-700 transition-colors"
            >
              Utforska jobb
            </Link>
          </div>
        )}

        {/* No search results */}
        {favorites.length > 0 &&
          filteredFavorites.length === 0 &&
          searchQuery && (
            <div className="bg-white dark:bg-[#1a1a1a] rounded-3xl p-12 border border-gray-200 dark:border-white/5 text-center">
              <p className="text-gray-400 dark:text-white/40">
                Inga favoriter matchar "{searchQuery}"
              </p>
            </div>
          )}

        {/* Favorites list */}
        {filteredFavorites.length > 0 && (
          <div className="grid gap-4">
            {filteredFavorites.map((job) => {
              const gradeToUse = job.matchGrade || job.grade;
              return (
                <div
                  key={job.id}
                  className="bg-white dark:bg-[#1a1a1a] rounded-3xl p-6 border border-gray-200 dark:border-white/5 hover:border-gray-300 dark:hover:border-white/10 transition-all hover:shadow-md dark:shadow-none group"
                >
                  <div className="flex items-start justify-between gap-4">
                    <Link href={`/jobs/${job.id}`} className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-3">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                          {job.title}
                        </h3>
                        {job.isNew && (
                          <span className="text-xs font-semibold bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 px-3 py-1 rounded-full">
                            New
                          </span>
                        )}
                        {job.badge && (
                          <span className="text-xs font-medium text-purple-600 dark:text-purple-400 border border-purple-300 dark:border-purple-500/40 px-3 py-1 rounded-full">
                            {job.badge}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-white/60 mb-4">
                        <span className="font-medium">{job.company}</span>
                        <span className="text-gray-400 dark:text-white/40">
                          •
                        </span>
                        <span className="flex items-center gap-1">
                          <MapPin size={14} />
                          {job.location}
                        </span>
                      </div>

                      {(job.type || (job.perks && job.perks.length > 0)) && (
                        <div className="flex flex-wrap gap-2">
                          {job.type && (
                            <span className="text-xs bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-white/70 rounded-full px-3 py-1.5 border border-gray-200 dark:border-white/10 flex items-center gap-1">
                              <Briefcase size={12} />
                              {job.type}
                            </span>
                          )}
                          {job.perks?.map((perk) => (
                            <span
                              key={perk}
                              className="text-xs bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-white/70 rounded-full px-3 py-1.5 border border-gray-200 dark:border-white/10"
                            >
                              {perk}
                            </span>
                          ))}
                        </div>
                      )}
                    </Link>

                    <div className="flex flex-col items-end gap-3">
                      {gradeToUse && (
                        <span
                          className={`text-sm font-bold px-4 py-1.5 rounded-full ${
                            gradeToUse === "A"
                              ? "bg-green-100 dark:bg-green-500/20 text-green-600 dark:text-green-400"
                              : gradeToUse === "B"
                                ? "bg-yellow-100 dark:bg-yellow-500/20 text-yellow-600 dark:text-yellow-400"
                                : "bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400"
                          }`}
                        >
                          {gradeToUse} Match
                        </span>
                      )}
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          removeFavorite(job.id);
                        }}
                        className="text-purple-500 dark:text-purple-400 hover:text-red-500 dark:hover:text-red-400 transition-colors p-2"
                        title="Ta bort från favoriter"
                      >
                        <Bookmark size={20} fill="currentColor" />
                      </button>
                    </div>
                  </div>

                  <div className="mt-3 pt-3 border-t border-gray-200 dark:border-white/5">
                    <p className="text-xs text-gray-400 dark:text-white/30">
                      Sparad{" "}
                      {new Date(job.savedAt).toLocaleDateString("sv-SE", {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
