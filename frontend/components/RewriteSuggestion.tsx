import { useEffect, useRef, useState } from "react";
import { useTranslation } from "next-i18next";
import { Button } from "./ui/button";
import AiGenerationConsent from "./AiGenerationConsent";
import { getPublicBackendUrl } from "../lib/backendUrl";
import { getSupabaseBrowserClient } from "../lib/supabaseClient";
export interface RewriteTarget {
  kind: "cv" | "letter";
  section: string;
  entry: number;
  index: number;
}
export default function RewriteSuggestion({
  jobId,
  revision,
  text,
  target,
  onAccept,
  disabled = false,
  onConsentChange,
}: {
  jobId: string;
  revision: string;
  text: string;
  target: RewriteTarget;
  onAccept: (text: string) => void;
  disabled?: boolean;
  onConsentChange?: (open: boolean) => void;
}) {
  const { t } = useTranslation("common");
  const [mode, setMode] = useState("improve");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [proposal, setProposal] = useState("");
  const [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);
  const original = useRef(text);
  original.current = text;
  useEffect(() => {
    setProposal("");
    setError("");
    setConsent(false);
    setBusy(false);
    return () => request.current?.abort();
  }, [jobId, revision, text]);
  async function suggest() {
    if (busy) return;
    onConsentChange?.(false);
    setConsent(false);
    setBusy(true);
    setProposal("");
    setError("");
    const controller = new AbortController();
    request.current = controller;
    const before = text;
    try {
      const {
        data: { session },
      } = await getSupabaseBrowserClient().auth.getSession();
      if (!session) throw Error("authentication");
      const res = await fetch(
        `${getPublicBackendUrl()}/api/documentrewrites/${encodeURIComponent(jobId)}`,
        {
          method: "POST",
          signal: controller.signal,
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            ...target,
            text: before,
            updatedAt: revision,
            mode,
          }),
        },
      );
      const body = await res.json();
      if (!res.ok) throw Error(body.error ?? "unavailable");
      if (
        !controller.signal.aborted &&
        original.current === before &&
        body.original === before &&
        body.updatedAt === revision
      )
        setProposal(body.text);
    } catch (e) {
      if (!controller.signal.aborted)
        setError(
          t(`cv.errors.${e instanceof Error ? e.message : "unavailable"}`, {
            defaultValue: t("cv.errors.unavailable"),
          }),
        );
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <label
          className="sr-only"
          htmlFor={`rewrite-${target.section}-${target.entry}-${target.index}`}
        >
          {t("workspace.rewrite.mode")}
        </label>
        <select
          id={`rewrite-${target.section}-${target.entry}-${target.index}`}
          value={mode}
          disabled={disabled || busy}
          onChange={(e) => {
            setMode(e.target.value);
            setProposal("");
          }}
          className="max-w-full rounded-lg border border-slate-200 bg-white p-2 text-sm dark:border-white/10 dark:bg-[#111]"
        >
          {["improve", "shorter", "technical", "tailor"].map((value) => (
            <option key={value} value={value}>
              {t(`workspace.rewrite.${value}`)}
            </option>
          ))}
        </select>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={disabled || busy || !text.trim()}
          onClick={() => {
            onConsentChange?.(true);
            setConsent(true);
          }}
        >
          {t(busy ? "workspace.rewrite.busy" : "workspace.rewrite.suggest")}
        </Button>
      </div>
      {disabled && (
        <p className="text-xs text-slate-500 dark:text-white/60">
          {t("workspace.rewrite.saveFirst")}
        </p>
      )}
      {proposal && (
        <div className="space-y-2 rounded-xl border border-sky-200 bg-sky-50 p-3 dark:border-sky-500/20 dark:bg-sky-500/10">
          <p className="text-xs font-semibold">
            {t("workspace.rewrite.review")}
          </p>
          <p className="whitespace-pre-wrap text-sm">{proposal}</p>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => {
                onAccept(proposal);
                setProposal("");
              }}
            >
              {t("workspace.rewrite.accept")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => setProposal("")}
            >
              {t("workspace.rewrite.discard")}
            </Button>
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm">
          {error}
        </p>
      )}
      {consent && (
        <AiGenerationConsent
          onClose={() => {
            onConsentChange?.(false);
            setConsent(false);
          }}
          onConfirm={() => void suggest()}
        />
      )}
    </div>
  );
}
