import { safeExternalUrl } from "../lib/safeHtml";
import { X, Copy, RefreshCw, Edit2, Send, Check } from "lucide-react";
import { useState, useEffect } from "react";
import { useTranslation } from "next-i18next";
import { Button } from "./ui/button";

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
    const url = safeExternalUrl(applicationUrl);
    if (url) {
      handleCopy();
      setTimeout(() => {
        window.open(url, "_blank", "noopener,noreferrer");
      }, 500);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-0 sm:p-4">
      <div className="relative w-full sm:max-w-3xl bg-gray-50 dark:bg-[#0d0d0d] border border-gray-200 dark:border-white/10 rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden max-h-[92dvh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between p-4 sm:p-6 border-b border-gray-200 dark:border-white/10">
          <div>
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">
              {t("coverLetter.title")}
            </h2>
            <p className="text-sm text-gray-500 dark:text-white/60 mt-1">
              {jobTitle} {company && `• ${company}`}
            </p>
          </div>
          <Button
            onClick={onClose}
            variant="ghost"
            size="icon"
            className="text-gray-500 dark:text-white/60"
          >
            <X size={20} className="text-gray-500 dark:text-white/60" />
          </Button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6 max-h-[55vh] overflow-y-auto flex-1">
          {isEditing ? (
            <textarea
              value={editedLetter}
              onChange={(e) => setEditedLetter(e.target.value)}
              className="w-full min-h-[400px] p-4 bg-white dark:bg-[#1a1a1a] border border-gray-300 dark:border-white/10 rounded-xl text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-slate-400 resize-none"
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
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-6 border-t border-gray-200 dark:border-white/10 bg-white dark:bg-[#0a0a0a]">
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => setIsEditing(!isEditing)}
              variant="secondary"
              className="h-auto px-4 py-2"
            >
              <Edit2 size={16} />
              {isEditing ? t("coverLetter.save") : t("coverLetter.edit")}
            </Button>
            <Button
              onClick={handleCopy}
              variant="secondary"
              className="h-auto px-4 py-2"
            >
              {copied ? <Check size={16} /> : <Copy size={16} />}
              {copied ? t("coverLetter.copied") : t("coverLetter.copy")}
            </Button>
            <Button
              onClick={onRegenerate}
              disabled={isRegenerating}
              variant="secondary"
              className="h-auto px-4 py-2"
            >
              <RefreshCw
                size={16}
                className={isRegenerating ? "animate-spin" : ""}
              />
              {t("coverLetter.regenerate")}
            </Button>
          </div>
          {applicationUrl && (
            <Button
              onClick={handleApply}
              variant="external"
              className="h-auto px-6 py-2.5"
            >
              <Send size={16} />
              {t("coverLetter.sendApplication")}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
