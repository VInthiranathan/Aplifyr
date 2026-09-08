import type { GetServerSideProps } from "next";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";
import { useTranslation } from "next-i18next";
import { useFavorites } from "../lib/useFavorites";
import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { Search, Bookmark, Trash2, MapPin, Briefcase } from "lucide-react";
import JobListCard from "../components/JobListCard";
import { Button } from "../components/ui/button";

export const getServerSideProps: GetServerSideProps = async ({ locale }) => ({
  props: { ...(await serverSideTranslations(locale ?? "en", ["common"])) },
});

export default function FavoritesPage() {
  const { t } = useTranslation("common");
  const { locale } = useRouter();
  const { favorites, removeFavorite, clearAllFavorites, loaded } =
    useFavorites();
  const [searchQuery, setSearchQuery] = useState("");
  const dateLocale = locale === "sv" ? "sv-SE" : "en-US";

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
      <div className="app-page-shell">
          <p className="text-gray-400 dark:text-white/40">
            {t("favorites.loading")}
          </p>
      </div>
    );
  }

  return (
    <div className="app-page-shell">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="app-page-header">
            <h1 className="app-page-title">
              {t("favorites.title")}
            </h1>
            <p className="app-page-subtitle">
              {t("favorites.savedCount", { count: favorites.length })}
            </p>
          </div>

          {favorites.length > 0 && (
            <Button
              onClick={() => {
                if (confirm(t("favorites.clearAllConfirm"))) {
                  clearAllFavorites();
                }
              }}
              variant="secondary"
              className="px-4 py-2 text-red-600 dark:text-red-400 border-red-200 dark:border-red-900/40 hover:bg-red-100 dark:hover:bg-red-900/30 hover:text-red-700 dark:hover:text-red-300"
            >
              <Trash2 size={16} />
              {t("favorites.clearAll")}
            </Button>
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
              placeholder={t("favorites.search")}
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
              {t("favorites.emptyTitle")}
            </h2>
            <p className="text-gray-500 dark:text-white/50 mb-6">
              {t("favorites.emptyDescription")}
            </p>
            <Button asChild className="px-6 py-3">
              <Link href="/jobs">{t("favorites.exploreJobs")}</Link>
            </Button>
          </div>
        )}

        {/* No search results */}
        {favorites.length > 0 &&
          filteredFavorites.length === 0 &&
          searchQuery && (
            <div className="bg-white dark:bg-[#1a1a1a] rounded-3xl p-12 border border-gray-200 dark:border-white/5 text-center">
              <p className="text-gray-400 dark:text-white/40">
                {t("favorites.noResults", { query: searchQuery })}
              </p>
            </div>
          )}

        {/* Favorites list */}
        {filteredFavorites.length > 0 && (
          <div className="grid gap-4">
            {filteredFavorites.map((job) => {
              const gradeToUse = job.matchGrade || job.grade;
              return (
                <JobListCard
                  key={job.id}
                  title={
                    <Link
                      href={`/jobs/${job.id}`}
                      className="text-lg font-semibold text-gray-900 dark:text-white hover:underline"
                    >
                      {job.title}
                    </Link>
                  }
                  badges={
                    <>
                      {job.isNew && (
                        <span className="text-xs font-semibold bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 px-3 py-1 rounded-full">
                          {t("favorites.new")}
                        </span>
                      )}
                      {job.badge && (
                        <span className="text-xs font-medium text-purple-600 dark:text-purple-400 border border-purple-300 dark:border-purple-500/40 px-3 py-1 rounded-full">
                          {job.badge}
                        </span>
                      )}
                    </>
                  }
                  meta={
                    <>
                      <span className="font-medium">{job.company}</span>
                      <span className="text-gray-400 dark:text-white/40">•</span>
                      <span className="flex items-center gap-1">
                        <MapPin size={14} />
                        {job.location}
                      </span>
                    </>
                  }
                  tags={
                    job.type || (job.perks && job.perks.length > 0) ? (
                      <>
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
                      </>
                    ) : null
                  }
                  aside={
                    <>
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
                          {gradeToUse} {t("favorites.match")}
                        </span>
                      )}
                      <Button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          removeFavorite(job.id);
                        }}
                        variant="ghost"
                        size="icon"
                        className="text-purple-500 dark:text-purple-400 hover:text-red-500 dark:hover:text-red-400"
                        title={t("favorites.removeFavorite")}
                      >
                        <Bookmark size={20} fill="currentColor" />
                      </Button>
                    </>
                  }
                  footer={
                    <p className="text-xs text-gray-400 dark:text-white/30">
                      {t("favorites.savedOn", {
                        date: new Date(job.savedAt).toLocaleDateString(dateLocale, {
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                        }),
                      })}
                    </p>
                  }
                />
              );
            })}
          </div>
        )}
    </div>
  );
}
