import type { ApplicationStatus, PreparedJob } from "../types/api";
export type JobStage = ApplicationStatus | "new" | "preparing" | "ready";
export interface JobProgress {
  status?: ApplicationStatus;
  hasCv: boolean;
  hasLetter: boolean;
  hasNotes?: boolean;
}
export function activePreparation(
  job: PreparedJob,
  now = Date.now(),
): JobProgress {
  return {
    hasCv:
      job.has_cv && !!job.cv_expires_at && Date.parse(job.cv_expires_at) > now,
    hasLetter:
      job.has_cover_letter &&
      !!job.cover_letter_expires_at &&
      Date.parse(job.cover_letter_expires_at) > now,
  };
}
export function jobStage(progress?: JobProgress): JobStage {
  if (progress?.status) return progress.status;
  if (progress?.hasCv && progress?.hasLetter) return "ready";
  if (progress?.hasCv || progress?.hasLetter || progress?.hasNotes)
    return "preparing";
  return "new";
}
export function localDay(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
export function needsFollowUp(
  status: ApplicationStatus,
  date: string | null,
  today: string,
): boolean {
  return (
    ["applied", "screening", "interview", "offer"].includes(status) &&
    !!date &&
    date <= today
  );
}
