import type { GetServerSideProps } from "next";
import type { Job, Progression, JobsData } from "../types/api";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";

const BACKEND = process.env.BACKEND_URL ?? "http://localhost:5000";

interface Props {
  jobs: Job[];
  progression: Progression;
}

export const getServerSideProps: GetServerSideProps<Props> = async ({
  locale,
}) => {
  try {
    const res = await fetch(`${BACKEND}/api/jobs`);
    if (!res.ok) throw new Error("backend error");
    const data: JobsData = await res.json();
    return {
      props: {
        jobs: data.jobs,
        progression: data.progression,
        ...(await serverSideTranslations(locale ?? "en", ["common"])),
      },
    };
  } catch {
    return {
      props: {
        jobs: [],
        progression: { applied: 0, readyToApply: 0, readyToGenerate: 0 },
        ...(await serverSideTranslations(locale ?? "en", ["common"])),
      },
    };
  }
};

export default function Home({ jobs, progression }: Props) {
  const total =
    progression.applied +
      progression.readyToApply +
      progression.readyToGenerate || 1;
  const appliedPct = (progression.applied / total) * 100;
  const readyPct =
    ((progression.applied + progression.readyToApply) / total) * 100;

  const gradeCount = (g: "A" | "B" | "C") =>
    jobs.filter((j) => j.grade === g).length;
  const gradeA = gradeCount("A");
  const gradeB = gradeCount("B");
  const gradeC = gradeCount("C");

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#0d0d0d] p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header Section */}
        <div className="space-y-2">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white">
            Dashboard
          </h1>
          <p className="text-gray-500 dark:text-white/60">
            Track your job applications and matches
          </p>
        </div>

        {/* Stats Grid - Progression + Grades */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Progression Card */}
          <div className="lg:col-span-1 bg-gradient-to-br from-orange-300 via-purple-500 to-purple-700 rounded-3xl p-8 shadow-lg hover:shadow-xl transition-shadow">
            <h3 className="text-sm font-semibold text-white/90 uppercase tracking-wider mb-6">
              Progression
            </h3>

            <div className="flex justify-center mb-8">
              <div className="relative w-32 h-32">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                  <circle
                    cx="18"
                    cy="18"
                    r="15.9"
                    fill="none"
                    stroke="rgba(255,255,255,0.2)"
                    strokeWidth="2.5"
                  />
                  <circle
                    cx="18"
                    cy="18"
                    r="15.9"
                    fill="none"
                    stroke="rgba(255,255,255,0.5)"
                    strokeWidth="2.5"
                    strokeDasharray={`${readyPct} ${100 - readyPct}`}
                    strokeLinecap="round"
                  />
                  <circle
                    cx="18"
                    cy="18"
                    r="15.9"
                    fill="none"
                    stroke="white"
                    strokeWidth="2.5"
                    strokeDasharray={`${appliedPct} ${100 - appliedPct}`}
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-2xl font-bold text-white">
                    {progression.applied}
                  </span>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="w-3 h-3 rounded-full bg-white" />
                  <span className="text-sm text-white/90">Applied</span>
                </div>
                <span className="text-sm font-semibold text-white">
                  {progression.applied}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="w-3 h-3 rounded-full bg-white/50" />
                  <span className="text-sm text-white/90">Ready to apply</span>
                </div>
                <span className="text-sm font-semibold text-white">
                  {progression.readyToApply}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="w-3 h-3 rounded-full bg-white/20" />
                  <span className="text-sm text-white/90">
                    Ready to generate
                  </span>
                </div>
                <span className="text-sm font-semibold text-white">
                  {progression.readyToGenerate}
                </span>
              </div>
            </div>
          </div>

          {/* Grade Match Cards */}
          <div className="lg:col-span-3 grid grid-cols-3 gap-6">
            {/* A Grade */}
            <div className="bg-white dark:bg-[#1a1a1a] rounded-3xl p-8 border border-gray-200 dark:border-white/5 shadow-sm hover:shadow-md dark:shadow-none transition-all hover:scale-[1.02] group">
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm font-semibold text-gray-500 dark:text-white/60 uppercase tracking-wider">
                  A Grade
                </span>
                <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-500/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <span className="text-lg font-bold text-green-600 dark:text-green-400">
                    A
                  </span>
                </div>
              </div>
              <div className="mt-6">
                <p className="text-5xl font-bold text-gray-900 dark:text-white mb-2">
                  {gradeA}
                </p>
                <p className="text-sm text-gray-500 dark:text-white/50">
                  Matches
                </p>
              </div>
            </div>

            {/* B Grade */}
            <div className="bg-white dark:bg-[#1a1a1a] rounded-3xl p-8 border border-gray-200 dark:border-white/5 shadow-sm hover:shadow-md dark:shadow-none transition-all hover:scale-[1.02] group">
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm font-semibold text-gray-500 dark:text-white/60 uppercase tracking-wider">
                  B Grade
                </span>
                <div className="w-10 h-10 rounded-full bg-yellow-100 dark:bg-yellow-500/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <span className="text-lg font-bold text-yellow-600 dark:text-yellow-400">
                    B
                  </span>
                </div>
              </div>
              <div className="mt-6">
                <p className="text-5xl font-bold text-gray-900 dark:text-white mb-2">
                  {gradeB}
                </p>
                <p className="text-sm text-gray-500 dark:text-white/50">
                  Matches
                </p>
              </div>
            </div>

            {/* C Grade */}
            <div className="bg-white dark:bg-[#1a1a1a] rounded-3xl p-8 border border-gray-200 dark:border-white/5 shadow-sm hover:shadow-md dark:shadow-none transition-all hover:scale-[1.02] group">
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm font-semibold text-gray-500 dark:text-white/60 uppercase tracking-wider">
                  C Grade
                </span>
                <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-500/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <span className="text-lg font-bold text-red-600 dark:text-red-400">
                    C
                  </span>
                </div>
              </div>
              <div className="mt-6">
                <p className="text-5xl font-bold text-gray-900 dark:text-white mb-2">
                  {gradeC}
                </p>
                <p className="text-sm text-gray-500 dark:text-white/50">
                  Matches
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Job List Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              Recent Jobs
            </h2>
            <span className="text-sm text-gray-500 dark:text-white/60">
              {jobs.length} jobs
            </span>
          </div>

          {jobs.length === 0 && (
            <div className="bg-white dark:bg-[#1a1a1a] rounded-3xl p-12 border border-gray-200 dark:border-white/5 text-center">
              <p className="text-gray-400 dark:text-white/40">
                No jobs available. Make sure the backend is running.
              </p>
            </div>
          )}

          <div className="grid gap-4">
            {jobs.map((job) => (
              <div
                key={job.id}
                className="bg-white dark:bg-[#1a1a1a] rounded-3xl p-6 border border-gray-200 dark:border-white/5 hover:border-gray-300 dark:hover:border-white/10 transition-all hover:shadow-md dark:shadow-none group"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
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
                      <span>{job.location}</span>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <span className="text-xs bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-white/70 rounded-full px-3 py-1.5 border border-gray-200 dark:border-white/10">
                        {job.type}
                      </span>
                      {job.perks.map((perk) => (
                        <span
                          key={perk}
                          className="text-xs bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-white/70 rounded-full px-3 py-1.5 border border-gray-200 dark:border-white/10"
                        >
                          {perk}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-3">
                    <span
                      className={`text-sm font-bold px-4 py-1.5 rounded-full ${
                        job.grade === "A"
                          ? "bg-green-100 dark:bg-green-500/20 text-green-600 dark:text-green-400"
                          : job.grade === "B"
                            ? "bg-yellow-100 dark:bg-yellow-500/20 text-yellow-600 dark:text-yellow-400"
                            : "bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400"
                      }`}
                    >
                      {job.grade} Match
                    </span>
                    <button className="text-gray-400 dark:text-white/30 hover:text-gray-600 dark:hover:text-white/70 transition-colors p-2">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="w-5 h-5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.5}
                          d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
                        />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
