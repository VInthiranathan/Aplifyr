import { safeExternalUrl } from "../lib/safeHtml";
import {useDialogFocus} from '../lib/useDialogFocus';
import { X, Copy, RefreshCw, Edit2, Send, Check, Trash2, Loader2, Download } from "lucide-react";
import { useState, useEffect, useRef } from "react";
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
  expiresAt: string | null;
  onDelete: () => void;
  isDeleting?: boolean;
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
  expiresAt,
  onDelete,
  isDeleting = false,
}: CoverLetterModalProps) {
  const { t, i18n } = useTranslation("common");
  const dialog=useDialogFocus(isOpen,onClose);
  const [isEditing, setIsEditing] = useState(false);
  const [editedLetter, setEditedLetter] = useState(letter);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState(false);
  const downloadRequest = useRef<AbortController | null>(null);
  useEffect(() => {
    setDownloadError(false); setDownloading(false);
    return () => { downloadRequest.current?.abort(); downloadRequest.current = null; };
  }, [isOpen, letter]);
  async function exportPdf() {
    if (downloadRequest.current) return;
    const controller = new AbortController(); downloadRequest.current = controller;
    setDownloading(true); setDownloadError(false);
    try {
      const { downloadCoverLetter } = await import('../lib/downloadCoverLetter.js');
      await downloadCoverLetter(editedLetter, jobTitle, company, controller.signal);
    } catch { if (!controller.signal.aborted) setDownloadError(true); }
    finally { if (downloadRequest.current === controller) { downloadRequest.current = null; setDownloading(false); } }
  }
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
      <div ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-label={t('coverLetter.title')} className="relative w-full sm:max-w-3xl bg-gray-50 dark:bg-[#0d0d0d] border border-gray-200 dark:border-white/10 rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden max-h-[92dvh] flex flex-col">
        {/* Header */}
        <div className="flex min-w-0 items-start justify-between gap-3 border-b border-gray-200 p-4 dark:border-white/10 sm:p-6">
          <div className="min-w-0">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white sm:text-2xl">
              {t("coverLetter.title")}
            </h2>
            <p className="mt-1 break-words text-sm text-gray-500 dark:text-white/60 [overflow-wrap:anywhere]">
              {jobTitle} {company && `• ${company}`}
            </p>
            {expiresAt && <p className="text-xs text-gray-500 dark:text-white/50 mt-1">{t('coverLetter.savedUntil', { date: new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' }).format(new Date(expiresAt)) })}</p>}
          </div>
          <Button
            onClick={onClose}
            aria-label={t('privacy.close')}
            variant="ghost"
            size="icon"
            className="text-gray-500 dark:text-white/60"
          >
            <X size={20} className="text-gray-500 dark:text-white/60" />
          </Button>
        </div>

        {/* Content */}
        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
          {isEditing ? (
            <textarea
              value={editedLetter}
              onChange={(e) => setEditedLetter(e.target.value)}
              className="min-h-[45dvh] w-full resize-none rounded-xl border border-gray-300 bg-white p-4 text-gray-900 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:border-white/10 dark:bg-[#1a1a1a] dark:text-white sm:min-h-[400px]"
              placeholder={t("coverLetter.editPlaceholder")}
            />
          ) : (
            <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-white/5 dark:bg-[#1a1a1a] sm:p-6">
              <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-gray-900 dark:text-white [overflow-wrap:anywhere]">
                {editedLetter}
              </pre>
            </div>
          )}
        </div>

        {downloadError && <p role="alert" className="px-4 py-2">{t('coverLetter.downloadError')}</p>}
        {/* Footer Actions */}
        <div className="grid gap-3 border-t border-gray-200 bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] dark:border-white/10 dark:bg-[#0a0a0a] sm:flex sm:flex-wrap sm:items-center sm:justify-between sm:p-6">
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            <Button onClick={exportPdf} disabled={downloading || isRegenerating || isDeleting || !editedLetter.trim()} variant="secondary" className="h-auto min-w-0 whitespace-normal px-3 py-2 sm:px-4">
              {downloading ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
              {t(downloading ? 'coverLetter.downloading' : 'coverLetter.download')}
            </Button>
            <Button
              onClick={() => setIsEditing(!isEditing)}
              variant="secondary"
              className="h-auto min-w-0 px-3 py-2 sm:px-4"
            >
              <Edit2 size={16} />
              {isEditing ? t("coverLetter.save") : t("coverLetter.edit")}
            </Button>
            <Button
              onClick={handleCopy}
              variant="secondary"
              className="h-auto min-w-0 px-3 py-2 sm:px-4"
            >
              {copied ? <Check size={16} /> : <Copy size={16} />}
              {copied ? t("coverLetter.copied") : t("coverLetter.copy")}
            </Button>
            <Button
              onClick={onRegenerate}
              disabled={isRegenerating}
              variant="secondary"
              className="h-auto min-w-0 px-3 py-2 sm:px-4"
            >
              <RefreshCw
                size={16}
                className={isRegenerating ? "animate-spin" : ""}
              />
              {t("coverLetter.regenerate")}
            </Button>
            <Button
              onClick={onDelete}
              disabled={isDeleting || isRegenerating}
              variant="secondary"
              className="h-auto min-w-0 px-3 py-2 sm:px-4"
            >
              {isDeleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
              {t(isDeleting ? "coverLetter.deleting" : "coverLetter.delete")}
            </Button>
          </div>
          {applicationUrl && (
            <Button
              onClick={handleApply}
              variant="external"
              className="h-auto w-full px-6 py-2.5 sm:w-auto"
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
