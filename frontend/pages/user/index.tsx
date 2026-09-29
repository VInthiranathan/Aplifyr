import type { GetServerSideProps } from "next";
import {useDialogFocus} from '../../lib/useDialogFocus';
import type { User } from "../../types/api";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";
import { useTranslation } from "next-i18next";
import { serverSupabase } from "../../lib/serverSupabase";
import { isSupabaseConfigured } from "../../lib/supabaseClient";
import {
  MapPin,
  Briefcase,
  Globe,
  Linkedin,
  Mail,
  Phone,
  Edit,
  FileText,
  Tag,
  X,
  Save,
} from "lucide-react";
import { useState, useEffect } from "react";
import { Button } from "../../components/ui/button";
import JobPreferences from "../../components/JobPreferences";
import { useMatchSession } from "../../lib/matchSessionContext";
import CareerHistory from "../../components/CareerHistory";
import CareerOverview from "../../components/CareerOverview";
import { CareerEntriesProvider } from "../../lib/CareerEntriesContext";
const profileTabs = ['overview', 'work', 'education', 'preferences'] as const;
type ProfileTab = typeof profileTabs[number];
interface Props {
  user: User | null;
}

export const getServerSideProps: GetServerSideProps<Props> = async ({
  locale,
  req,
  res,
}) => {
  res.setHeader("Cache-Control", "private, no-store");
  try {
    if (isSupabaseConfigured) {
      const supabase = serverSupabase(req, res);

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
        .select("id,full_name,title,location,contact_email,phone,website_url,linkedin_url,bio,tech_stack,roles,location_preferences,created_at,updated_at")
        .eq("id", user.id)
        .maybeSingle();

      const frontendUser: User | null = profile
        ? {
            id: profile.id,
            updatedAt: profile.updated_at,
            name: profile.full_name ?? "",
            title: profile.title ?? "",
            location: profile.location ?? "",
            contactEmail: profile.contact_email ?? "",
            phone: profile.phone ?? "",
            websiteUrl: profile.website_url ?? "",
            linkedinUrl: profile.linkedin_url ?? "",
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

const emptyUser: User = {
  id: "",
  name: "",
  title: "",
  location: "",
  contactEmail: "",
  phone: "",
  websiteUrl: "",
  linkedinUrl: "",
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
  updatedAt: profile.updated_at,
  name: profile.full_name ?? "",
  title: profile.title ?? "",
  location: profile.location ?? "",
  contactEmail: profile.contact_email ?? "",
  phone: profile.phone ?? "",
  websiteUrl: profile.website_url ?? "",
  linkedinUrl: profile.linkedin_url ?? "",
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

const saveProfile = async (nextUser: User, section: "profile" | "bio" | "skills") => {
  const fields = section === "profile" ? {
    name: nextUser.name, title: nextUser.title, location: nextUser.location,
    contactEmail: nextUser.contactEmail, phone: nextUser.phone,
    websiteUrl: nextUser.websiteUrl, linkedinUrl: nextUser.linkedinUrl,
  }
    : section === "bio" ? { bio: nextUser.bio } : { tags: nextUser.tags };
  const res = await fetch("/api/profile", {
    method: "PUT",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...fields, updatedAt: nextUser.updatedAt ?? null }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    console.error("save profile failed", err);
    throw new Error(res.status === 409 ? "profileConflict" : "save profile failed");
  }

  const data = await res.json();
  return data.profile ? mapProfileToUser(data.profile) : nextUser;
};

export default function UserPage({ user }: Props) {
  const { t } = useTranslation("common");
  const { clearSession } = useMatchSession();
  const [activeTab, setActiveTab] = useState<ProfileTab>('overview');
  const [visitedTabs, setVisitedTabs] = useState<ProfileTab[]>(['overview']);
  const selectTab = (tab: ProfileTab) => {
    setActiveTab(tab);
    setVisitedTabs(previous => previous.includes(tab) ? previous : [...previous, tab]);
  };
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const editDialog=useDialogFocus(isEditModalOpen,()=>setIsEditModalOpen(false));
  const [editedUser, setEditedUser] = useState<User | null>(user);
  const [editSection, setEditSection] = useState<
    "profile" | "bio" | "skills" | null
  >(null);
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
          } else {
            // no profile yet — allow user to create one via UI
            setClientProfile({ ...emptyUser, id: data.userId });
            setEditedUser({ ...emptyUser, id: data.userId });
          }
        } catch (e) {
          setClientProfile(null);
          setEditedUser({ ...emptyUser });
        }
      })();
    } else {
      setClientProfile(user);
      setEditedUser(user);
    }
  }, [user]);

  const handleSaveProfile = async () => {
    if (!editedUser || !editSection) return;
    try {
      const savedProfile = await saveProfile(editedUser, editSection);
      clearSession();
      setClientProfile(savedProfile);
      setEditedUser(savedProfile);
      setIsEditModalOpen(false);
    } catch (error) {
      console.error(error);
      alert(t(error instanceof Error && error.message === "profileConflict" ? "privacy.profileConflict" : "user.saveProfileError"));
    }
  };

  return (
    <CareerEntriesProvider key={user?.id ?? "profile"}>
    <div className="min-h-full min-w-0 overflow-x-hidden bg-gray-50 dark:bg-[#0d0d0d]">
      {/* Banner — shorter on mobile */}
      <div className="h-20 bg-gradient-to-r from-orange-300 via-purple-500 to-purple-700 sm:h-48" />

      {/* Main container */}
      <div className="mx-auto -mt-10 max-w-7xl px-4 pb-6 sm:-mt-24 sm:px-8 sm:pb-10">
        {/* Profile Card */}
        <div className="mb-5 rounded-2xl border border-gray-200 bg-white p-4 shadow-lg dark:border-white/5 dark:bg-[#1a1a1a] sm:mb-8 sm:rounded-3xl sm:p-8 sm:shadow-xl">
          <div className="flex flex-wrap items-center gap-4 sm:gap-6">
            {/* Square Avatar */}
            <div className="relative flex-shrink-0">
              <div className="w-16 h-16 sm:w-24 sm:h-24 rounded-2xl bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center text-white text-2xl sm:text-3xl font-bold">
                {(clientProfile && clientProfile.avatarInitials) || ""}
              </div>
            </div>

            {/* User Info */}
            <div className="flex-1 min-w-0">
              <h1 className="mb-1 break-words text-xl font-bold text-gray-900 dark:text-white [overflow-wrap:anywhere] sm:mb-3 sm:text-4xl">
                {clientProfile?.name ?? ""}
              </h1>
              <div className="flex min-w-0 flex-col gap-1 text-sm text-gray-600 dark:text-white/60 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4 sm:text-base">
                <div className="flex items-center gap-2">
                  <Briefcase className="w-4 h-4" />
                  <span>{(clientProfile && clientProfile.title) || ""}</span>
                </div>
                <span className="hidden text-gray-400 dark:text-white/30 sm:inline">•</span>
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4" />
                  <span>{(clientProfile && clientProfile.location) || ""}</span>
                </div>
              </div>
              {(clientProfile?.contactEmail || clientProfile?.phone || clientProfile?.websiteUrl || clientProfile?.linkedinUrl) && (
                <div className="mt-3 flex min-w-0 flex-col gap-2 text-sm text-gray-600 dark:text-white/60 sm:flex-row sm:flex-wrap sm:gap-x-4">
                  {clientProfile.contactEmail && <a className="flex min-w-0 items-center gap-2 hover:underline" href={`mailto:${clientProfile.contactEmail}`}><Mail aria-hidden="true" className="h-4 w-4 shrink-0" /><span className="break-all">{clientProfile.contactEmail}</span></a>}
                  {clientProfile.phone && <a className="flex min-w-0 items-center gap-2 hover:underline" href={`tel:${clientProfile.phone.replace(/[^0-9+]/g, '')}`}><Phone aria-hidden="true" className="h-4 w-4 shrink-0" /><span>{clientProfile.phone}</span></a>}
                  {clientProfile.websiteUrl && <a className="flex min-w-0 items-center gap-2 hover:underline" href={clientProfile.websiteUrl} target="_blank" rel="noopener noreferrer"><Globe aria-hidden="true" className="h-4 w-4 shrink-0" /><span className="break-all">{t('user.website')}</span></a>}
                  {clientProfile.linkedinUrl && <a className="flex min-w-0 items-center gap-2 hover:underline" href={clientProfile.linkedinUrl} target="_blank" rel="noopener noreferrer"><Linkedin aria-hidden="true" className="h-4 w-4 shrink-0" /><span>LinkedIn</span></a>}
                </div>
              )}
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

        <div role="tablist" aria-label={t('career.tabs.label')} className="mb-5 grid grid-cols-2 gap-1 rounded-2xl border border-gray-200 bg-white p-1.5 dark:border-white/5 dark:bg-[#1a1a1a] sm:mb-6 sm:flex sm:gap-2 sm:p-2">
          {profileTabs.map((tab, index) => (
            <button key={tab} id={`profile-tab-${tab}`} type="button" role="tab"
              aria-selected={activeTab === tab} aria-controls={`profile-panel-${tab}`}
              tabIndex={activeTab === tab ? 0 : -1}
              className={`min-w-0 rounded-xl px-2 py-3 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 sm:shrink-0 sm:px-4 sm:text-sm ${activeTab === tab ? 'bg-purple-100 text-purple-900 dark:bg-purple-500/20 dark:text-purple-200' : 'app-hover-standard text-gray-600 dark:text-white/60'}`}
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
        <section id="profile-panel-preferences" role="tabpanel" aria-labelledby="profile-tab-preferences" hidden={activeTab !== 'preferences'} tabIndex={0}>
          {visitedTabs.includes('preferences') && <JobPreferences
            profile={clientProfile}
            onSaved={profile => {
              const mapped = mapProfileToUser(profile);
              setClientProfile(mapped);
              clearSession();
            }}
          />}
        </section>
        <section id="profile-panel-overview" role="tabpanel" aria-labelledby="profile-tab-overview" hidden={activeTab !== 'overview'} tabIndex={0}>
        {/* Two column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Left column - Main content */}
          <div className="min-w-0 space-y-6 lg:col-span-2 xl:col-span-3">
            {/* About Me */}
            <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-white/5 dark:bg-[#1a1a1a] sm:p-6">
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

            {/* Tech stack */}
            <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-white/5 dark:bg-[#1a1a1a] sm:p-6">
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
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <div ref={editDialog} tabIndex={-1} role="dialog" aria-modal="true" aria-label={t('user.editModalTitle')} className="flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-gray-200 bg-white shadow-2xl dark:border-white/5 dark:bg-[#1a1a1a] sm:rounded-2xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-gray-200 bg-white p-4 dark:border-white/5 dark:bg-[#1a1a1a] sm:p-6">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white sm:text-2xl">
                {t("user.editModalTitle")}
              </h2>
              <Button
                onClick={() => setIsEditModalOpen(false)}
                aria-label={t('privacy.close')}
                variant="ghost"
                size="icon"
                className="text-gray-500 dark:text-white/50"
              >
                <X className="w-5 h-5 text-gray-500 dark:text-white/50" />
              </Button>
            </div>

            {/* Modal Body */}
            <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-4 sm:p-6">
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

                  <div className="border-t border-gray-200 pt-6 dark:border-white/10">
                    <h3 className="font-semibold text-gray-900 dark:text-white">{t('user.contactDetails')}</h3>
                    <p className="mt-1 text-sm text-gray-600 dark:text-white/60">{t('user.contactDetailsHelp')}</p>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-semibold text-gray-900 dark:text-white" htmlFor="profile-contact-email">{t('user.contactEmail')}</label>
                    <input id="profile-contact-email" type="email" autoComplete="email" maxLength={254} value={editedUser.contactEmail} onChange={(e) => setEditedUser({ ...editedUser, contactEmail: e.target.value })} className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-white/10 dark:bg-white/5 dark:text-white" />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-semibold text-gray-900 dark:text-white" htmlFor="profile-phone">{t('user.phone')}</label>
                    <input id="profile-phone" type="tel" autoComplete="tel" maxLength={32} value={editedUser.phone} onChange={(e) => setEditedUser({ ...editedUser, phone: e.target.value })} placeholder={t('user.phonePlaceholder')} className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-white/10 dark:bg-white/5 dark:text-white" />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-semibold text-gray-900 dark:text-white" htmlFor="profile-website">{t('user.website')}</label>
                    <input id="profile-website" type="url" inputMode="url" maxLength={2048} value={editedUser.websiteUrl} onChange={(e) => setEditedUser({ ...editedUser, websiteUrl: e.target.value })} placeholder="https://example.com" className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-white/10 dark:bg-white/5 dark:text-white" />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-semibold text-gray-900 dark:text-white" htmlFor="profile-linkedin">LinkedIn</label>
                    <input id="profile-linkedin" type="url" inputMode="url" maxLength={2048} value={editedUser.linkedinUrl} onChange={(e) => setEditedUser({ ...editedUser, linkedinUrl: e.target.value })} placeholder="https://www.linkedin.com/in/..." className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-white/10 dark:bg-white/5 dark:text-white" />
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

            </div>

            {/* Modal Footer */}
            <div className="grid grid-cols-2 gap-3 border-t border-gray-200 bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] dark:border-white/5 dark:bg-[#1a1a1a] sm:flex sm:items-center sm:justify-end sm:p-6">
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="app-secondary-button min-w-0 px-3 py-3 sm:px-6"
              >
                {t("user.cancel")}
              </button>
              <button
                onClick={handleSaveProfile}
                className="app-primary-button min-w-0 px-3 py-3 sm:px-6"
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
