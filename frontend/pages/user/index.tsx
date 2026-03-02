import type { GetServerSideProps } from "next";
import type { User } from "../../types/api";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";
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
import { useState, useRef } from "react";

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
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editedUser, setEditedUser] = useState<User | null>(user);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const profileImageInputRef = useRef<HTMLInputElement>(null);

  if (!user) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400 dark:text-white/40 text-sm">
        Kunde inte hämta användardata – är backend igång?
      </div>
    );
  }

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
        alert("File size must be less than 5MB");
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.size <= 5 * 1024 * 1024) {
        // 5MB
        setUploadedFile(file);
        // TODO: Upload to backend
      } else {
        alert("File size must be less than 5MB");
      }
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.size <= 5 * 1024 * 1024) {
        setUploadedFile(file);
        // TODO: Upload to backend
      } else {
        alert("File size must be less than 5MB");
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
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/user`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(editedUser),
        },
      );

      if (res.ok) {
        setIsEditModalOpen(false);
        window.location.reload(); // Refresh to show updated data
      } else {
        alert("Failed to save profile");
      }
    } catch (error) {
      alert("Error saving profile");
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
                  alt={user.name}
                  className="w-24 h-24 rounded-2xl object-cover"
                />
              ) : (
                <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center text-white text-3xl font-bold">
                  {user.avatarInitials}
                </div>
              )}
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
            <button
              onClick={() => {
                setEditedUser(user);
                setIsEditModalOpen(true);
              }}
              className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-colors font-semibold shadow-lg"
            >
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
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.doc,.docx"
                onChange={handleFileChange}
                className="hidden"
              />
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                className={`border-2 border-dashed rounded-2xl p-12 text-center transition-all cursor-pointer ${
                  isDragging
                    ? "border-blue-500 bg-blue-50 dark:bg-blue-500/10"
                    : "border-gray-200 dark:border-white/10 hover:border-blue-400 dark:hover:border-blue-500/50"
                }`}
              >
                <div className="flex flex-col items-center gap-4">
                  {uploadedFile ? (
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
                        Remove File
                      </button>
                    </>
                  ) : (
                    <>
                      <Upload className="w-14 h-14 text-gray-400 dark:text-white/30" />
                      <div>
                        <p className="text-base font-semibold text-gray-900 dark:text-white mb-1">
                          Upload your CV
                        </p>
                        <p className="text-sm text-gray-500 dark:text-white/50">
                          PDF, DOC, DOCX • Max 5MB
                        </p>
                      </div>
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="mt-2 px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition-colors shadow-lg"
                      >
                        Choose File
                      </button>
                      <p className="text-xs text-gray-500 dark:text-white/50 mt-2 max-w-xs">
                        Your CV will be used to match you with relevant
                        opportunities
                      </p>
                    </>
                  )}
                </div>
              </div>
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
                Edit Profile
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
              {/* Profile Picture */}
              <div>
                <label className="block text-sm font-semibold text-gray-900 dark:text-white mb-3">
                  Profile Picture
                </label>
                <div className="flex items-center gap-6">
                  {/* Avatar Preview */}
                  <div className="relative flex-shrink-0">
                    {profileImage ? (
                      <img
                        src={profileImage}
                        alt="Profile"
                        className="w-24 h-24 rounded-2xl object-cover"
                      />
                    ) : (
                      <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center text-white text-3xl font-bold">
                        {user.avatarInitials}
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
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors text-sm"
                    >
                      Upload Image
                    </button>
                    {profileImage && (
                      <button
                        onClick={() => setProfileImage(null)}
                        className="px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-white/10 dark:hover:bg-white/20 text-gray-700 dark:text-white rounded-lg font-medium transition-colors text-sm"
                      >
                        Use Initials
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Name */}
              <div>
                <label className="block text-sm font-semibold text-gray-900 dark:text-white mb-2">
                  Name
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
                  Title
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
                  Location
                </label>
                <input
                  type="text"
                  value={editedUser.location}
                  onChange={(e) =>
                    setEditedUser({ ...editedUser, location: e.target.value })
                  }
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Bio */}
              <div>
                <label className="block text-sm font-semibold text-gray-900 dark:text-white mb-2">
                  About Me
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

              {/* Skills */}
              <div>
                <label className="block text-sm font-semibold text-gray-900 dark:text-white mb-2">
                  Skills (comma-separated)
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
                  placeholder="C#, TypeScript, React, Next.js"
                />
              </div>

              {/* Desired Roles */}
              <div>
                <label className="block text-sm font-semibold text-gray-900 dark:text-white mb-2">
                  Desired Roles (comma-separated)
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
                  placeholder="Frontend Developer, Fullstack Developer"
                />
              </div>
            </div>

            {/* Modal Footer */}
            <div className="sticky bottom-0 bg-white dark:bg-[#1a1a1a] border-t border-gray-200 dark:border-white/5 p-6 flex items-center justify-end gap-3">
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="px-6 py-3 rounded-xl border border-gray-200 dark:border-white/10 text-gray-700 dark:text-white/70 hover:bg-gray-50 dark:hover:bg-white/5 font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveProfile}
                className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition-colors shadow-lg"
              >
                <Save className="w-4 h-4" />
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
