import type { GetServerSideProps } from "next";
import type { User } from "../../types/api";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";
import { MapPin, Briefcase, Edit, FileText, Tag, Upload } from "lucide-react";

const BACKEND = process.env.BACKEND_URL ?? "http://localhost:5000";

interface Props {
  user: User | null;
}

export const getServerSideProps: GetServerSideProps<Props> = async ({
  locale,
}) => {
  try {
    const res = await fetch(`${BACKEND}/api/user`);
    if (!res.ok) throw new Error("backend error");
    const user: User = await res.json();
    return {
      props: {
        user,
        ...(await serverSideTranslations(locale ?? "en", ["common"])),
      },
    };
  } catch {
    return {
      props: {
        user: null,
        ...(await serverSideTranslations(locale ?? "en", ["common"])),
      },
    };
  }
};

const locationFilters = [
  "Only my location",
  "Nearby location",
  "Region",
  "Country",
  "Remote",
];

export default function UserPage({ user }: Props) {
  if (!user) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400 dark:text-white/40 text-sm">
        Kunde inte hämta användardata – är backend igång?
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#0d0d0d]">
      {/* Banner */}
      <div className="h-48 bg-gradient-to-r from-orange-300 via-purple-500 to-purple-700" />

      {/* Main container */}
      <div className="max-w-7xl mx-auto px-8 -mt-24 pb-10">
        {/* Profile Card */}
        <div className="bg-white dark:bg-[#1a1a1a] rounded-3xl p-8 border border-gray-200 dark:border-white/5 shadow-xl mb-8">
          <div className="flex items-center gap-6">
            {/* Square Avatar with green status dot */}
            <div className="relative flex-shrink-0">
              <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center text-white text-3xl font-bold">
                {user.avatarInitials}
              </div>
              <div className="absolute bottom-2 right-2 w-5 h-5 bg-green-500 rounded-full border-3 border-white dark:border-[#1a1a1a]" />
            </div>

            {/* User Info */}
            <div className="flex-1">
              <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-3">
                {user.name}
              </h1>
              <div className="flex items-center gap-4 text-gray-600 dark:text-white/60">
                <div className="flex items-center gap-2">
                  <Briefcase className="w-4 h-4" />
                  <span>{user.title}</span>
                </div>
                <span className="text-gray-400 dark:text-white/30">•</span>
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4" />
                  <span>{user.location}</span>
                </div>
              </div>
            </div>

            {/* Edit Profile Button */}
            <button className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-colors font-semibold shadow-lg">
              <Edit className="w-4 h-4" />
              Edit Profile
            </button>
          </div>
        </div>

        {/* Two column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left column - Main content */}
          <div className="lg:col-span-2 space-y-6">
            {/* About Me */}
            <div className="bg-white dark:bg-[#1a1a1a] rounded-2xl p-6 border border-gray-200 dark:border-white/5 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-500/10 flex items-center justify-center">
                  <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                  About Me
                </h2>
              </div>
              <p className="text-gray-700 dark:text-white/70 leading-relaxed">
                {user.bio || "No bio available"}
              </p>
            </div>

            {/* Location Preferences */}
            <div className="bg-white dark:bg-[#1a1a1a] rounded-2xl p-6 border border-gray-200 dark:border-white/5 shadow-sm">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-500/10 flex items-center justify-center">
                  <MapPin className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                </div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                  Location Preferences
                </h2>
              </div>
              <div className="flex gap-3 flex-wrap">
                {locationFilters.map((f) => (
                  <button
                    key={f}
                    className="px-5 py-2.5 rounded-full border border-gray-200 dark:border-white/10 text-gray-700 dark:text-white/70 hover:bg-gray-50 dark:hover:bg-white/5 font-medium transition-colors"
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>

            {/* Skills */}
            <div className="bg-white dark:bg-[#1a1a1a] rounded-2xl p-6 border border-gray-200 dark:border-white/5 shadow-sm">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-xl bg-green-100 dark:bg-green-500/10 flex items-center justify-center">
                  <Tag className="w-5 h-5 text-green-600 dark:text-green-400" />
                </div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                  Skills
                </h2>
              </div>
              <div className="flex gap-3 flex-wrap">
                {user.tags.map((tag) => (
                  <span
                    key={tag}
                    className="px-4 py-2 bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-400 font-medium rounded-xl border border-green-200 dark:border-green-500/20"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>

            {/* Desired Roles */}
            <div className="bg-white dark:bg-[#1a1a1a] rounded-2xl p-6 border border-gray-200 dark:border-white/5 shadow-sm">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-xl bg-orange-100 dark:bg-orange-500/10 flex items-center justify-center">
                  <Briefcase className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                </div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                  Desired Roles
                </h2>
              </div>
              <div className="flex gap-3 flex-wrap">
                {user.roles.map((role) => (
                  <span
                    key={role}
                    className="px-4 py-2 bg-orange-50 dark:bg-orange-500/10 text-orange-700 dark:text-orange-400 font-medium rounded-xl border border-orange-200 dark:border-orange-500/20"
                  >
                    {role}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Right column - CV/Resume */}
          <div className="lg:col-span-1">
            <div className="bg-white dark:bg-[#1a1a1a] rounded-2xl p-6 border border-gray-200 dark:border-white/5 shadow-sm">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-500/10 flex items-center justify-center">
                  <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                  CV / Resume
                </h2>
              </div>

              {/* Upload area */}
              <div className="border-2 border-dashed border-gray-200 dark:border-white/10 rounded-2xl p-12 text-center">
                <div className="flex flex-col items-center gap-4">
                  <Upload className="w-14 h-14 text-gray-400 dark:text-white/30" />
                  <div>
                    <p className="text-base font-semibold text-gray-900 dark:text-white mb-1">
                      Upload your CV
                    </p>
                    <p className="text-sm text-gray-500 dark:text-white/50">
                      PDF, DOC, DOCX • Max 5MB
                    </p>
                  </div>
                  <button className="mt-2 px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition-colors shadow-lg">
                    Choose File
                  </button>
                  <p className="text-xs text-gray-500 dark:text-white/50 mt-2 max-w-xs">
                    Your CV will be used to match you with relevant
                    opportunities
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
