import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useTranslation } from "next-i18next";
import { WorkspaceNav, type WorkspaceTab } from "./WorkspaceNav";
import { ApplicationPanel } from "./ApplicationPanel";
import { JobNotes } from "./JobNotes";
import { LetterFacts } from "./LetterFacts";
import CoverLetterModal from "../../components/CoverLetterModal";
import JobProgressBadge from "../../components/JobProgressBadge";
import { Button } from "../../components/ui/button";
import {
  useJobProgress,
  useJobProgressReady,
} from "../../lib/JobProgressContext";
import { signInHref } from "../../lib/guestAccess";
import type { useCoverLetter } from "./useCoverLetter";
import type { useJobApplication } from "./useJobApplication";
interface Props {
  jobAvailable?: boolean;
  jobId: string;
  active: WorkspaceTab;
  userId: string | null;
  job: { headline?: string; title?: string; employer?: { name?: string } };
  letterModel: ReturnType<typeof useCoverLetter>;
  applicationModel: ReturnType<typeof useJobApplication>;
}
export function JobWorkspace({
  jobId,
  jobAvailable = true,
  active,
  userId,
  job,
  letterModel: l,
  applicationModel: a,
}: Props) {
  const { t } = useTranslation("common");
  const router = useRouter();
  const progress = useJobProgress();
  const ready = useJobProgressReady();
  useEffect(() => {
    if (active === "letter") l.setShowModal(false);
  }, [active, l.letter]);
  const guest = (
    <p>
      {t("guest.description")}{" "}
      <Link className="underline" href={signInHref(`/jobs/${jobId}`)}>
        {t("auth.signIn")}
      </Link>
    </p>
  );
  const hasCv = !!progress[jobId]?.hasCv;
  const hasLetter = !!progress[jobId]?.hasLetter;
  const facts = (
    <LetterFacts
      loaded={l.careerLoaded}
      entries={l.career}
      selected={l.selectedCareer}
      setSelected={l.setSelectedCareer}
      error={l.careerError}
      busy={l.generating}
      onLoad={() => void l.loadCareer()}
    />
  );
  return (
    <div className="mt-6 space-y-4">
      <WorkspaceNav jobId={jobId} active={active} />
      {!jobAvailable && <p role="status">{t("workspace.adUnavailable")}</p>}
      {jobAvailable && userId && ready && !l.loadingLetter && !a.applicationLoading && (
        <section className="app-card-base space-y-3 rounded-2xl p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-semibold">{t("workspace.title")}</h2>
            <JobProgressBadge
              progress={{
                ...progress[jobId],
                hasCv,
                hasLetter,
                status: a.application?.status,
              }}
            />
          </div>
          <p>
            {t("workspace.preparations", {
              count:
                Number(hasCv) + Number(hasLetter) + Number(!!a.application),
            })}
          </p>
          <ul className="grid gap-2 text-sm sm:grid-cols-3">
            <li>
              {hasCv ? "✓" : "○"} {t("home.cvReady")}
            </li>
            <li>
              {hasLetter ? "✓" : "○"} {t("home.coverLetterReady")}
            </li>
            <li>
              {a.application ? "✓" : "○"}{" "}
              {t(
                a.application ? "workspace.submitted" : "workspace.notApplied",
              )}
            </li>
          </ul>
          {!hasCv ? (
            <Link
              className="inline-flex min-h-10 items-center text-sm text-sky-700 underline dark:text-sky-300"
              href={`/jobs/${jobId}/cv`}
            >
              {t("workspace.nextCv")}
            </Link>
          ) : !hasLetter ? (
            <Link
              className="inline-flex min-h-10 items-center text-sm text-sky-700 underline dark:text-sky-300"
              href={`/jobs/${jobId}?tab=letter`}
            >
              {t("workspace.nextLetter")}
            </Link>
          ) : !a.application ? (
            <Link
              className="inline-flex min-h-10 items-center text-sm text-sky-700 underline dark:text-sky-300"
              href={`/jobs/${jobId}?tab=application`}
            >
              {t("workspace.nextApply")}
            </Link>
          ) : null}
        </section>
      )}
      {active === "notes" &&
        (userId ? <JobNotes key={userId + jobId} jobId={jobId} /> : guest)}
      {active === "application" &&
        (userId ? (
          !jobAvailable && !a.application && !a.applicationLoading ? <p>{t("workspace.adUnavailable")}</p> : <ApplicationPanel
            key={userId + jobId}
            application={a.application}
            loading={a.applicationLoading}
            marking={a.applicationSaving}
            onMark={() => void a.markAsApplied()}
            onSaved={a.setApplication}
          />
        ) : (
          guest
        ))}
      {active === "letter" &&
        (!l.letter ? (
          <section className="app-card-base space-y-3 rounded-2xl p-4">
            <h2 className="text-lg font-semibold">
              {t("workspace.tabs.letter")}
            </h2>
            <p>{t("workspace.letterHelp")}</p>
            {userId ? facts : guest}
            <Button
              disabled={!jobAvailable || l.generating || l.loadingLetter}
              onClick={() =>
                !userId
                  ? router.push(signInHref(`/jobs/${jobId}`))
                  : l.requestGeneration()
              }
            >
              {t("jobDetail.generateCoverLetter")}
            </Button>
          </section>
        ) : (
          <CoverLetterModal
            inline
            canGenerate={jobAvailable}
            jobId={jobId}
            revision={l.letterRevision}
            onSave={l.saveLetter}
            isSaving={l.savingLetter}
            isOpen
            onClose={() => void router.push(`/jobs/${jobId}`)}
            letter={l.letter}
            jobTitle={
              job.headline ?? job.title ?? t("jobDetail.defaultJobTitle")
            }
            company={job.employer?.name ?? ""}
            expiresAt={l.letterExpiresAt}
            onRegenerate={l.requestGeneration}
            isRegenerating={l.generating}
            onDelete={() => void l.deleteCoverLetter()}
            isDeleting={l.deletingLetter}
          />
        ))}
    </div>
  );
}
