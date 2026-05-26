import { X, Copy, RefreshCw, Edit2, Send, Check } from "lucide-react";
import { useState, useEffect } from "react";
import { useTranslation } from "next-i18next";

interface CoverLetterModalProps {
  isOpen: boolean;
  onClose: () => void;
  letter: string;
  jobTitle: string;
  company: string;
  applicationUrl?: string;
  onRegenerate: () => void;
  isRegenerating?: boolean;
}

export default function CoverLetterModal({
  isOpen,
  onClose,
  letter,
  jobTitle,
  company,
  applicationUrl,
  onRegenerate,
  isRegenerating = false,
}: CoverLetterModalProps) {
  const { t } = useTranslation("common");
  const [isEditing, setIsEditing] = useState(false);
  const [editedLetter, setEditedLetter] = useState(letter);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setEditedLetter(letter);
    setIsEditing(false);
  }, [letter]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(editedLetter);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const handleApply = () => {
    if (applicationUrl) {
      handleCopy();
      setTimeout(() => {
        window.open(applicationUrl, "_blank");
      }, 500);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-3xl bg-gray-50 dark:bg-[#0d0d0d] border border-gray-200 dark:border-white/10 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-gray-200 dark:border-white/10">
          <div>
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">
              {t("coverLetter.title")}
            </h2>
            <p className="text-sm text-gray-500 dark:text-white/60 mt-1">
              {jobTitle} {company && `• ${company}`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-white/5 transition-colors"
          >
            <X size={20} className="text-gray-500 dark:text-white/60" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 max-h-[60vh] overflow-y-auto">
          {isEditing ? (
            <textarea
              value={editedLetter}
              onChange={(e) => setEditedLetter(e.target.value)}
              className="w-full min-h-[400px] p-4 bg-white dark:bg-[#1a1a1a] border border-gray-300 dark:border-white/10 rounded-xl text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
              placeholder={t("coverLetter.editPlaceholder")}
            />
          ) : (
            <div className="bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-white/5 rounded-xl p-6">
              <pre className="whitespace-pre-wrap text-sm leading-relaxed text-gray-900 dark:text-white font-sans">
                {editedLetter}
              </pre>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between gap-3 p-6 border-t border-gray-200 dark:border-white/10 bg-white dark:bg-[#0a0a0a]">
          <div className="flex gap-2">
            <button
              onClick={() => setIsEditing(!isEditing)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-100 dark:bg-white/5 hover:bg-gray-200 dark:hover:bg-white/10 text-gray-900 dark:text-white text-sm transition-colors"
            >
              <Edit2 size={16} />
              {isEditing ? t("coverLetter.save") : t("coverLetter.edit")}
            </button>
            <button
              onClick={handleCopy}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-100 dark:bg-white/5 hover:bg-gray-200 dark:hover:bg-white/10 text-gray-900 dark:text-white text-sm transition-colors"
            >
              {copied ? <Check size={16} /> : <Copy size={16} />}
              {copied ? t("coverLetter.copied") : t("coverLetter.copy")}
            </button>
            <button
              onClick={onRegenerate}
              disabled={isRegenerating}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-100 dark:bg-white/5 hover:bg-gray-200 dark:hover:bg-white/10 text-gray-900 dark:text-white text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCw
                size={16}
                className={isRegenerating ? "animate-spin" : ""}
              />
              {t("coverLetter.regenerate")}
            </button>
          </div>
          {applicationUrl && (
            <button
              onClick={handleApply}
              className="flex items-center gap-2 px-6 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium transition-colors"
            >
              <Send size={16} />
              {t("coverLetter.sendApplication")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
