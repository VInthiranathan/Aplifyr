import type { GetServerSideProps } from "next";
import type { User } from "../../types/api";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";
import { useTranslation } from "next-i18next";
import {
  createServerClient,
  parseCookieHeader,
  serializeCookieHeader,
} from "@supabase/auth-helpers-nextjs";
import { isSupabaseConfigured } from "../../lib/supabaseClient";
import {
  MapPin,
  Briefcase,
  Edit,
  FileText,
  Tag,
  X,
  Save,
} from "lucide-react";
import { useState, useEffect } from "react";
import { Button } from "../../components/ui/button";
import CareerHistory from "../../components/CareerHistory";
import CareerOverview from "../../components/CareerOverview";
import { CareerEntriesProvider } from "../../lib/CareerEntriesContext";
const profileTabs = ['overview', 'work', 'education'] as const;
type ProfileTab = typeof profileTabs[number];
interface Props {
  user: User | null;
}

export const getServerSideProps: GetServerSideProps<Props> = async ({
  locale,
  req,
  res,
}) => {
  try {
    if (isSupabaseConfigured) {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
      const supabaseAnonKey = process.env
        .NEXT_PUBLIC_SUPABASE_ANON_KEY as string;

      const parsed = parseCookieHeader(req.headers.cookie ?? "");

      const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
        cookies: {
          getAll() {
            return parsed.map((c) => ({ name: c.name, value: c.value ?? "" }));
          },
          setAll(cookies) {
            const setCookie = cookies.map(({ name, value, options }) =>
              serializeCookieHeader(name, value, options),
            );
            setCookie.forEach((c) => res.setHeader("Set-Cookie", c));
          },
        },
      });

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        return {
          props: {
            user: null,
            ...(await serverSideTranslations(locale ?? "en", ["common"])),
          },
        };
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("id,full_name,title,location,bio,tech_stack,roles,location_preferences,created_at,updated_at")
        .eq("id", user.id)
        .maybeSingle();

      const frontendUser: User | null = profile
        ? {
            id: profile.id,
            name: profile.full_name ?? "",
            title: profile.title ?? "",
            location: profile.location ?? "",
            locationPreferences: profile.location_preferences ?? [],
            bio: profile.bio ?? "",
            tags: profile.tech_stack ?? [],
            roles: profile.roles ?? [],
            avatarInitials: profile.full_name
              ? profile.full_name
                  .split(/\s+/)
                  .map((p: string) => p[0])
                  .slice(0, 2)
                  .join("")
                  .toUpperCase()
              : "",
          }
        : null;

      return {
        props: {
          user: frontendUser,
          ...(await serverSideTranslations(locale ?? "en", ["common"])),
        },
      };
    }

    return {
      props: {
        user: null,
        ...(await serverSideTranslations(locale ?? "en", ["common"])),
      },
    };
  } catch (e) {
    return {
      props: {
        user: null,
        ...(await serverSideTranslations(locale ?? "en", ["common"])),
      },
    };
  }
};

const locationFilterKeys = [
  "user.onlyMyLocation",
  "user.nearbyLocation",
  "user.region",
  "user.country",
  "user.remote",
];

const emptyUser: User = {
  id: "",
  name: "",
  title: "",
  location: "",
  locationPreferences: [],
  bio: "",
  tags: [],
  roles: [],
  avatarInitials: "",
};

const CANONICAL_LOCATION_PREFS = new Set([
  "onlyMyLocation",
  "nearbyLocation",
  "region",
  "country",
  "remote",
]);

const mapProfileToUser = (profile: Record<string, any>): User => ({
  id: profile.id,
  name: profile.full_name ?? "",
  title: profile.title ?? "",
  location: profile.location ?? "",
  locationPreferences: Array.from(
    new Set(
      (profile.location_preferences ?? [])
        .filter((v: unknown): v is string => typeof v === "string")
        .map((v: string) => v.trim())
        .filter((v: string) => CANONICAL_LOCATION_PREFS.has(v)),
    ),
  ),
  bio: profile.bio ?? "",
  tags: profile.tech_stack ?? [],
  roles: profile.roles ?? [],
  avatarInitials: profile.full_name
    ? profile.full_name
        .split(/\s+/)
        .map((segment: string) => segment[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : "",
});

const saveProfile = async (nextUser: User) => {
  const res = await fetch("/api/profile", {
    method: "PUT",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(nextUser),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    console.error("save profile failed", err);
    throw new Error("save profile failed");
  }

  const data = await res.json();
  return data.profile ? mapProfileToUser(data.profile) : nextUser;
};

export default function UserPage({ user }: Props) {
  const { t } = useTranslation("common");
  const [activeTab, setActiveTab] = useState<ProfileTab>('overview');
  const [visitedTabs, setVisitedTabs] = useState<ProfileTab[]>(['overview']);
  const selectTab = (tab: ProfileTab) => {
    setActiveTab(tab);
    setVisitedTabs(previous => previous.includes(tab) ? previous : [...previous, tab]);
  };
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editedUser, setEditedUser] = useState<User | null>(user);
  const [editSection, setEditSection] = useState<
    "profile" | "bio" | "skills" | "roles" | null
  >(null);
  const [selectedLocations, setSelectedLocations] = useState<string[]>(
    user?.locationPreferences ?? [],
  );
  const locationFilterItems = locationFilterKeys.map((key) => ({
    value: key.replace("user.", ""),  // e.g. "remote", "region", "country"
    label: t(key),
  }));

  // client-side profile state: undefined = loading, null = no profile, User = loaded
  const [clientProfile, setClientProfile] = useState<User | null | undefined>(
    user,
  );

  useEffect(() => {
    // if SSR didn't provide a user/profile, try fetching client-side from Supabase
    if (user === null) {
      setClientProfile(undefined); // loading
      (async () => {
        try {
          const res = await fetch("/api/profile", {
            credentials: "same-origin",
          });
          if (!res.ok) throw new Error("fetch failed");
          const data = await res.json();
          if (data.profile) {
            const mapped = mapProfileToUser(data.profile);
            setClientProfile(mapped);
            setEditedUser(mapped);
            setSelectedLocations(mapped.locationPreferences);
          } else {
            // no profile yet — allow user to create one via UI
            setClientProfile(null);
            setEditedUser({ ...emptyUser });
            setSelectedLocations([]);
          }
        } catch (e) {
          setClientProfile(null);
          setEditedUser({ ...emptyUser });
          setSelectedLocations([]);
        }
      })();
    } else {
      setClientProfile(user);
      setEditedUser(user);
      setSelectedLocations(user.locationPreferences);
    }
  }, [user]);

  const toggleLocation = async (location: string) => {
    const previousLocations = selectedLocations;
    const nextLocations = previousLocations.includes(location)
      ? previousLocations.filter((loc) => loc !== location)
      : [...previousLocations, location];

    const baseUser = clientProfile ?? editedUser ?? emptyUser;
    const nextUser: User = {
      ...baseUser,
      locationPreferences: nextLocations,
    };

    setSelectedLocations(nextLocations);
    setClientProfile((prev) => (prev === undefined ? prev : nextUser));
    setEditedUser(nextUser);

    try {
      const savedProfile = await saveProfile(nextUser);
      setClientProfile(savedProfile);
      setEditedUser(savedProfile);
      setSelectedLocations(savedProfile.locationPreferences);
    } catch (error) {
      console.error(error);
      setSelectedLocations(previousLocations);
      setClientProfile((prev) => (prev === undefined ? prev : baseUser));
      setEditedUser(baseUser);
      alert(t("user.saveProfileError"));
    }
  };

  const handleSaveProfile = async () => {
    if (!editedUser) return;
    try {
      const savedProfile = await saveProfile({
        ...editedUser,
        locationPreferences: selectedLocations,
      });
      setClientProfile(savedProfile);
      setEditedUser(savedProfile);
      setSelectedLocations(savedProfile.locationPreferences);
      setIsEditModalOpen(false);
    } catch (error) {
      console.error(error);
      alert(t("user.saveProfileError"));
    }
  };

  return (
    <CareerEntriesProvider key={user?.id ?? "profile"}>
    <div className="min-h-screen bg-gray-50 dark:bg-[#0d0d0d]">
      {/* Banner — shorter on mobile */}
      <div className="h-28 sm:h-48 bg-gradient-to-r from-orange-300 via-purple-500 to-purple-700" />

      {/* Main container */}
      <div className="max-w-7xl mx-auto px-4 sm:px-8 -mt-16 sm:-mt-24 pb-10">
        {/* Profile Card */}
        <div className="bg-white dark:bg-[#1a1a1a] rounded-3xl p-4 sm:p-8 border border-gray-200 dark:border-white/5 shadow-xl mb-8">
          <div className="flex flex-wrap items-center gap-4 sm:gap-6">
            {/* Square Avatar */}
            <div className="relative flex-shrink-0">
              <div className="w-16 h-16 sm:w-24 sm:h-24 rounded-2xl bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center text-white text-2xl sm:text-3xl font-bold">
                {(clientProfile && clientProfile.avatarInitials) || ""}
              </div>
            </div>

            {/* User Info */}
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-2 sm:mb-3">
                {clientProfile?.name ?? ""}
              </h1>
              <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-gray-600 dark:text-white/60">
                <div className="flex items-center gap-2">
                  <Briefcase className="w-4 h-4" />
                  <span>{(clientProfile && clientProfile.title) || ""}</span>
                </div>
                <span className="text-gray-400 dark:text-white/30">•</span>
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4" />
                  <span>{(clientProfile && clientProfile.location) || ""}</span>
                </div>
              </div>
            </div>

            {/* Edit Profile Button */}
            <button
              onClick={() => {
                setEditedUser(
                  clientProfile ??
                    editedUser ??
                    emptyUser,
                );
                setEditSection("profile");
                setIsEditModalOpen(true);
              }}
              className="app-primary-button px-4 sm:px-6 py-2.5 sm:py-3 w-full sm:w-auto"
            >
              <Edit className="w-4 h-4" />
              {t("user.editProfile")}
            </button>
          </div>
        </div>

        <div role="tablist" aria-label={t('career.tabs.label')} className="mb-6 flex gap-2 overflow-x-auto rounded-2xl border border-gray-200 bg-white p-2 dark:border-white/5 dark:bg-[#1a1a1a]">
          {profileTabs.map((tab, index) => (
            <button key={tab} id={`profile-tab-${tab}`} type="button" role="tab"
              aria-selected={activeTab === tab} aria-controls={`profile-panel-${tab}`}
              tabIndex={activeTab === tab ? 0 : -1}
              className={`shrink-0 rounded-xl px-4 py-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 ${activeTab === tab ? 'bg-purple-100 text-purple-900 dark:bg-purple-500/20 dark:text-purple-200' : 'app-hover-standard text-gray-600 dark:text-white/60'}`}
              onClick={() => selectTab(tab)}
              onKeyDown={event => {
                const nextIndex = event.key === 'ArrowRight' ? (index + 1) % profileTabs.length
                  : event.key === 'ArrowLeft' ? (index + profileTabs.length - 1) % profileTabs.length
                  : event.key === 'Home' ? 0 : event.key === 'End' ? profileTabs.length - 1 : null;
                if (nextIndex === null) return;
                event.preventDefault();
                const next = profileTabs[nextIndex];
                selectTab(next);
                document.getElementById(`profile-tab-${next}`)?.focus();
              }}>
              {t(`career.tabs.${tab}`)}
            </button>
          ))}
        </div>
        {(['work', 'education'] as const).map(kind => (
          <section key={kind} id={`profile-panel-${kind}`} role="tabpanel" aria-labelledby={`profile-tab-${kind}`} hidden={activeTab !== kind} tabIndex={0}>
            {visitedTabs.includes(kind) && <CareerHistory kind={kind} />}
          </section>
        ))}
        <section id="profile-panel-overview" role="tabpanel" aria-labelledby="profile-tab-overview" hidden={activeTab !== 'overview'} tabIndex={0}>
        {/* Two column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Left column - Main content */}
          <div className="min-w-0 space-y-6 lg:col-span-2 xl:col-span-3">
            {/* About Me */}
            <div className="bg-white dark:bg-[#1a1a1a] rounded-2xl p-6 border border-gray-200 dark:border-white/5 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-500/10 flex items-center justify-center">
                  <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="flex items-center justify-between w-full">
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                    {t("user.aboutMe")}
                  </h2>
                  <Button
                    onClick={() => {
                      setEditedUser(
                        clientProfile ??
                          editedUser ??
                          emptyUser,
                      );
                      setEditSection("bio");
                      setIsEditModalOpen(true);
                    }}
                    variant="secondary"
                    className="h-auto px-3 py-1.5"
                  >
                    {t("user.edit")}
                  </Button>
                </div>
              </div>
              <p className="text-gray-700 dark:text-white/70 leading-relaxed">
                {(clientProfile && clientProfile.bio) || t("user.noBioAvailable")}
              </p>
            </div>

            {/* Location Preferences */}
            <div className="bg-white dark:bg-[#1a1a1a] rounded-2xl p-6 border border-gray-200 dark:border-white/5 shadow-sm">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-500/10 flex items-center justify-center">
                  <MapPin className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                </div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                  {t("user.locationPreferences")}
                </h2>
              </div>
              <div className="flex gap-3 flex-wrap">
                {locationFilterItems.map((f) => {
                  const isSelected = selectedLocations.includes(f.value);
                  return (
                    <button
                      key={f.value}
                      onClick={() => toggleLocation(f.value)}
                      className={`px-5 py-2.5 rounded-full border font-medium transition-all ${
                        isSelected
                          ? "bg-purple-100 dark:bg-purple-500/20 border-purple-500 dark:border-purple-500/50 text-purple-700 dark:text-purple-300"
                          : "border-gray-200 dark:border-white/10 text-gray-700 dark:text-white/70 hover:bg-gray-50 dark:hover:bg-white/5"
                      }`}
                    >
                      {f.label}
                      {isSelected && (
                        <span className="ml-2 text-purple-600 dark:text-purple-400">
                          ✓
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              {selectedLocations.length > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-200 dark:border-white/10">
                  <p className="text-sm text-gray-600 dark:text-white/60">
                    {t("user.selected", {
                      value: selectedLocations
                        .map((v) => locationFilterItems.find((f) => f.value === v)?.label ?? v)
                        .join(", "),
                    })}
                  </p>
                </div>
              )}
            </div>

            {/* Tech stack */}
            <div className="bg-white dark:bg-[#1a1a1a] rounded-2xl p-6 border border-gray-200 dark:border-white/5 shadow-sm">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-xl bg-green-100 dark:bg-green-500/10 flex items-center justify-center">
                  <Tag className="w-5 h-5 text-green-600 dark:text-green-400" />
                </div>
                <div className="flex items-center justify-between w-full">
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                    {t("user.techStack")}
                  </h2>
                  <Button
                    onClick={() => {
                      setEditedUser(
                        clientProfile ??
                          editedUser ??
                          emptyUser,
                      );
                      setEditSection("skills");
                      setIsEditModalOpen(true);
                    }}
                    variant="secondary"
                    className="h-auto px-3 py-1.5"
                  >
                    {t("user.edit")}
                  </Button>
                </div>
              </div>
              <div className="flex gap-3 flex-wrap">
                {(clientProfile ? clientProfile.tags : []).map((tag) => (
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
                <div className="flex items-center justify-between w-full">
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                    {t("user.desiredRoles")}
                  </h2>
                  <Button
                    onClick={() => {
                      setEditedUser(
                        clientProfile ??
                          editedUser ??
                          emptyUser,
                      );
                      setEditSection("roles");
                      setIsEditModalOpen(true);
                    }}
                    variant="secondary"
                    className="h-auto px-3 py-1.5"
                  >
                    {t("user.edit")}
                  </Button>
                </div>
              </div>
              <div className="flex gap-3 flex-wrap">
                {(clientProfile ? clientProfile.roles : []).map((role) => (
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

          {/* Career facts remain visible together in the overview. */}
          <aside className="min-w-0 space-y-6 lg:col-span-3 xl:col-span-2">
            <CareerOverview onManage={kind => {
              selectTab(kind);
              requestAnimationFrame(() => document.getElementById(`profile-tab-${kind}`)?.focus());
            }} />
          </aside>
        </div>
        </section>
      </div>

      {/* Edit Profile Modal */}
      {isEditModalOpen && editedUser && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-[#1a1a1a] rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-gray-200 dark:border-white/5 shadow-2xl">
            {/* Modal Header */}
            <div className="sticky top-0 bg-white dark:bg-[#1a1a1a] border-b border-gray-200 dark:border-white/5 p-6 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                {t("user.editModalTitle")}
              </h2>
              <Button
                onClick={() => setIsEditModalOpen(false)}
                variant="ghost"
                size="icon"
                className="text-gray-500 dark:text-white/50"
              >
                <X className="w-5 h-5 text-gray-500 dark:text-white/50" />
              </Button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-6">
              {editSection === "profile" && (
                <>
                  {/* Profile Picture */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-900 dark:text-white mb-3">
                      {t("user.profilePicture")}
                    </label>
                    <p className="mb-3 text-sm text-gray-600 dark:text-white/60">
                      {t("user.profileImageUnavailable")}
                    </p>
                    <div className="flex items-center gap-6">
                      {/* Avatar Preview */}
                      <div className="relative flex-shrink-0">
                        <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center text-white text-3xl font-bold">
                          {(editedUser && editedUser.avatarInitials) ||
                            (clientProfile && clientProfile.avatarInitials) ||
                            ""}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Name */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-900 dark:text-white mb-2">
                      {t("user.name")}
                    </label>
                    <input
                      type="text"
                      value={editedUser.name}
                      onChange={(e) =>
                        setEditedUser({ ...editedUser, name: e.target.value })
                      }
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  {/* Title */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-900 dark:text-white mb-2">
                      {t("user.titleLabel")}
                    </label>
                    <input
                      type="text"
                      value={editedUser.title}
                      onChange={(e) =>
                        setEditedUser({ ...editedUser, title: e.target.value })
                      }
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  {/* Location */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-900 dark:text-white mb-2">
                      {t("user.location")}
                    </label>
                    <input
                      type="text"
                      value={editedUser.location}
                      onChange={(e) =>
                        setEditedUser({
                          ...editedUser,
                          location: e.target.value,
                        })
                      }
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </>
              )}

              {editSection === "bio" && (
                <div>
                  <label className="block text-sm font-semibold text-gray-900 dark:text-white mb-2">
                    {t("user.aboutMeLabel")}
                  </label>
                  <textarea
                    value={editedUser.bio}
                    onChange={(e) =>
                      setEditedUser({ ...editedUser, bio: e.target.value })
                    }
                    rows={4}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  />
                </div>
              )}

              {editSection === "skills" && (
                <div>
                  <label className="block text-sm font-semibold text-gray-900 dark:text-white mb-2">
                    {t("user.skillsCommaSeparated")}
                  </label>
                  <input
                    type="text"
                    value={editedUser.tags.join(", ")}
                    onChange={(e) =>
                      setEditedUser({
                        ...editedUser,
                        tags: e.target.value.split(",").map((s) => s.trim()),
                      })
                    }
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder={t("user.skillsPlaceholder")}
                  />
                </div>
              )}

              {editSection === "roles" && (
                <div>
                  <label className="block text-sm font-semibold text-gray-900 dark:text-white mb-2">
                    {t("user.rolesCommaSeparated")}
                  </label>
                  <input
                    type="text"
                    value={editedUser.roles.join(", ")}
                    onChange={(e) =>
                      setEditedUser({
                        ...editedUser,
                        roles: e.target.value.split(",").map((s) => s.trim()),
                      })
                    }
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder={t("user.rolesPlaceholder")}
                  />
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="sticky bottom-0 bg-white dark:bg-[#1a1a1a] border-t border-gray-200 dark:border-white/5 p-6 flex items-center justify-end gap-3">
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="app-secondary-button px-6 py-3"
              >
                {t("user.cancel")}
              </button>
              <button
                onClick={handleSaveProfile}
                className="app-primary-button px-6 py-3"
              >
                <Save className="w-4 h-4" />
                {t("user.saveChanges")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </CareerEntriesProvider>
  );
}
