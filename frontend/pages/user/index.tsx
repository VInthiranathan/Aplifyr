import type { GetServerSideProps } from "next";
import type { User } from "../../types/api";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";
import { useTranslation } from "next-i18next";
import {
  createServerClient,
  parseCookieHeader,
  serializeCookieHeader,
} from "@supabase/auth-helpers-nextjs";
import {
  isSupabaseConfigured,
  getSupabaseBrowserClient,
} from "../../lib/supabaseClient";
import {
  MapPin,
  Briefcase,
  Edit,
  FileText,
  Tag,
  Upload,
  X,
  Save,
} from "lucide-react";
import { useState, useRef, useEffect } from "react";

const BACKEND = process.env.BACKEND_URL ?? "http://localhost:5000";

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
        .select("*")
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

const mapProfileToUser = (profile: Record<string, any>): User => ({
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
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editedUser, setEditedUser] = useState<User | null>(user);
  const [editSection, setEditSection] = useState<
    "profile" | "bio" | "skills" | "roles" | null
  >(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [cvUrl, setCvUrl] = useState<string | null>(null);
  const [selectedLocations, setSelectedLocations] = useState<string[]>(
    user?.locationPreferences ?? [],
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  const profileImageInputRef = useRef<HTMLInputElement>(null);
  const locationFilters = locationFilterKeys.map((key) => t(key));

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
            setCvUrl(data.profile.cv_url || null);
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
      // Fetch CV URL for the user
      (async () => {
        try {
          const res = await fetch("/api/profile", {
            credentials: "same-origin",
          });
          if (res.ok) {
            const data = await res.json();
            if (data.profile && data.profile.cv_url) {
              setCvUrl(data.profile.cv_url);
            }
          }
        } catch (e) {
          console.error("Failed to fetch CV URL:", e);
        }
      })();
    }
  }, [user]);

  const handleProfileImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.size <= 5 * 1024 * 1024) {
        const reader = new FileReader();
        reader.onloadend = () => {
          setProfileImage(reader.result as string);
        };
        reader.readAsDataURL(file);
        // TODO: Upload to backend
      } else {
        alert(t("user.fileSizeTooLarge"));
      }
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.size <= 5 * 1024 * 1024) {
        // 5MB
        setUploadedFile(file);
        await uploadCV(file);
      } else {
        alert(t("user.fileSizeTooLarge"));
      }
    }
  };

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

  const uploadCV = async (file: File) => {
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/upload-cv", {
        method: "POST",
        credentials: "same-origin",
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        setCvUrl(data.cv_url);
        alert(t("user.cvUploadedSuccess"));
      } else {
        const err = await res.json().catch(() => ({}));
        console.error("CV upload failed", err);
        alert(t("user.cvUploadFailed"));
      }
    } catch (error) {
      console.error("CV upload error:", error);
      alert(t("user.cvUploadError"));
    } finally {
      setIsUploading(false);
    }
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.size <= 5 * 1024 * 1024) {
        setUploadedFile(file);
        await uploadCV(file);
      } else {
        alert(t("user.fileSizeTooLarge"));
      }
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
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
    <div className="min-h-screen bg-gray-50 dark:bg-[#0d0d0d]">
      {/* Banner */}
      <div className="h-48 bg-gradient-to-r from-orange-300 via-purple-500 to-purple-700" />

      {/* Main container */}
      <div className="max-w-7xl mx-auto px-8 -mt-24 pb-10">
        {/* Profile Card */}
        <div className="bg-white dark:bg-[#1a1a1a] rounded-3xl p-8 border border-gray-200 dark:border-white/5 shadow-xl mb-8">
          <div className="flex items-center gap-6">
            {/* Square Avatar */}
            <div className="relative flex-shrink-0">
              {profileImage ? (
                <img
                  src={profileImage}
                  alt={(clientProfile && clientProfile.name) || t("user.profileAlt")}
                  className="w-24 h-24 rounded-2xl object-cover"
                />
              ) : (
                <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center text-white text-3xl font-bold">
                  {(clientProfile && clientProfile.avatarInitials) || ""}
                </div>
              )}
            </div>

            {/* User Info */}
            <div className="flex-1">
              <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-3">
                {clientProfile?.name ?? ""}
              </h1>
              <div className="flex items-center gap-4 text-gray-600 dark:text-white/60">
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

            {/* Edit Profile Button - edits name/title/location only */}
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
              className="app-primary-button px-6 py-3"
            >
              <Edit className="w-4 h-4" />
              {t("user.editProfile")}
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
                <div className="flex items-center justify-between w-full">
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                    {t("user.aboutMe")}
                  </h2>
                  <button
                    onClick={() => {
                      setEditedUser(
                        clientProfile ??
                          editedUser ??
                          emptyUser,
                      );
                      setEditSection("bio");
                      setIsEditModalOpen(true);
                    }}
                    className="text-sm font-semibold px-3 py-1 rounded-lg bg-gray-100 dark:bg-white/5 hover:bg-gray-200 dark:hover:bg-white/10"
                  >
                    {t("user.edit")}
                  </button>
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
                {locationFilters.map((f) => {
                  const isSelected = selectedLocations.includes(f);
                  return (
                    <button
                      key={f}
                      onClick={() => toggleLocation(f)}
                      className={`px-5 py-2.5 rounded-full border font-medium transition-all ${
                        isSelected
                          ? "bg-purple-100 dark:bg-purple-500/20 border-purple-500 dark:border-purple-500/50 text-purple-700 dark:text-purple-300"
                          : "border-gray-200 dark:border-white/10 text-gray-700 dark:text-white/70 hover:bg-gray-50 dark:hover:bg-white/5"
                      }`}
                    >
                      {f}
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
                    {t("user.selected", { value: selectedLocations.join(", ") })}
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
                  <button
                    onClick={() => {
                      setEditedUser(
                        clientProfile ??
                          editedUser ??
                          emptyUser,
                      );
                      setEditSection("skills");
                      setIsEditModalOpen(true);
                    }}
                    className="text-sm font-semibold px-3 py-1 rounded-lg bg-gray-100 dark:bg-white/5 hover:bg-gray-200 dark:hover:bg-white/10"
                  >
                    {t("user.edit")}
                  </button>
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
                  <button
                    onClick={() => {
                      setEditedUser(
                        clientProfile ??
                          editedUser ??
                          emptyUser,
                      );
                      setEditSection("roles");
                      setIsEditModalOpen(true);
                    }}
                    className="text-sm font-semibold px-3 py-1 rounded-lg bg-gray-100 dark:bg-white/5 hover:bg-gray-200 dark:hover:bg-white/10"
                  >
                    {t("user.edit")}
                  </button>
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

          {/* Right column - CV/Resume */}
          <div className="lg:col-span-1">
            <div className="bg-white dark:bg-[#1a1a1a] rounded-2xl p-6 border border-gray-200 dark:border-white/5 shadow-sm">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-500/10 flex items-center justify-center">
                  <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                  {t("user.cvResume")}
                </h2>
              </div>

              {/* Upload area */}
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.doc,.docx"
                onChange={handleFileChange}
                className="hidden"
                disabled={isUploading}
              />

              {cvUrl ? (
                <div className="border-2 border-gray-200 dark:border-white/10 rounded-2xl p-8 text-center">
                  <div className="flex flex-col items-center gap-4">
                    <FileText className="w-14 h-14 text-green-600 dark:text-green-400" />
                    <div>
                      <p className="text-base font-semibold text-gray-900 dark:text-white mb-1">
                        {t("user.cvUploaded")}
                      </p>
                      <p className="text-sm text-gray-500 dark:text-white/50">
                        {t("user.cvSavedHint")}
                      </p>
                    </div>
                    <div className="flex gap-3 mt-2">
                      <a
                        href={cvUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="app-primary-button px-6 py-3"
                      >
                        {t("user.viewCv")}
                      </a>
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploading}
                        className="app-secondary-button px-6 py-3"
                      >
                        {isUploading ? t("user.uploadingCv") : t("user.replaceCv")}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  className={`border-2 border-dashed rounded-2xl p-12 text-center transition-all cursor-pointer ${
                    isDragging
                      ? "border-blue-500 bg-blue-50 dark:bg-blue-500/10"
                      : "border-gray-200 dark:border-white/10 hover:border-blue-400 dark:hover:border-blue-500/50"
                  } ${isUploading ? "opacity-50 pointer-events-none" : ""}`}
                >
                  <div className="flex flex-col items-center gap-4">
                    {uploadedFile && !isUploading ? (
                      <>
                        <FileText className="w-14 h-14 text-blue-600 dark:text-blue-400" />
                        <div>
                          <p className="text-base font-semibold text-gray-900 dark:text-white mb-1">
                            {uploadedFile.name}
                          </p>
                          <p className="text-sm text-gray-500 dark:text-white/50">
                            {(uploadedFile.size / 1024 / 1024).toFixed(2)} MB
                          </p>
                        </div>
                        <button
                          onClick={() => setUploadedFile(null)}
                          className="mt-2 px-8 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-semibold transition-colors shadow-lg"
                        >
                          {t("user.removeFile")}
                        </button>
                      </>
                    ) : isUploading ? (
                      <>
                        <FileText className="w-14 h-14 text-blue-600 dark:text-blue-400 animate-pulse" />
                        <p className="text-base font-semibold text-gray-900 dark:text-white">
                          {t("user.uploadingCv")}
                        </p>
                      </>
                    ) : (
                      <>
                        <Upload className="w-14 h-14 text-gray-400 dark:text-white/30" />
                        <div>
                          <p className="text-base font-semibold text-gray-900 dark:text-white mb-1">
                            {t("user.uploadYourCv")}
                          </p>
                          <p className="text-sm text-gray-500 dark:text-white/50">
                            PDF, DOC, DOCX • Max 5MB
                          </p>
                        </div>
                        <button
                          onClick={() => fileInputRef.current?.click()}
                          className="app-primary-button mt-2 px-8 py-3"
                        >
                          {t("user.chooseFile")}
                        </button>
                        <p className="text-xs text-gray-500 dark:text-white/50 mt-2 max-w-xs">
                          {t("user.cvUploadHint")}
                        </p>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
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
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="w-10 h-10 rounded-xl hover:bg-gray-100 dark:hover:bg-white/5 flex items-center justify-center transition-colors"
              >
                <X className="w-5 h-5 text-gray-500 dark:text-white/50" />
              </button>
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
                    <div className="flex items-center gap-6">
                      {/* Avatar Preview */}
                      <div className="relative flex-shrink-0">
                        {profileImage ? (
                          <img
                            src={profileImage}
                            alt={t("user.profileAlt")}
                            className="w-24 h-24 rounded-2xl object-cover"
                          />
                        ) : (
                          <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center text-white text-3xl font-bold">
                            {(editedUser && editedUser.avatarInitials) ||
                              (clientProfile && clientProfile.avatarInitials) ||
                              ""}
                          </div>
                        )}
                      </div>

                      {/* Upload buttons */}
                      <div className="flex flex-col gap-2">
                        <input
                          ref={profileImageInputRef}
                          type="file"
                          accept="image/*"
                          onChange={handleProfileImageChange}
                          className="hidden"
                        />
                        <button
                          onClick={() => profileImageInputRef.current?.click()}
                          className="app-primary-button px-4 py-2 text-sm"
                        >
                          {t("user.uploadImage")}
                        </button>
                        {profileImage && (
                          <button
                            onClick={() => setProfileImage(null)}
                            className="app-secondary-button px-4 py-2 text-sm"
                          >
                            {t("user.useInitials")}
                          </button>
                        )}
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
  );
}
