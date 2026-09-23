import type { ApplicationStatus, CvJobContext } from "../types/api";

export const APPLICATION_STATUSES: ApplicationStatus[] = [
  "applied",
  "screening",
  "interview",
  "offer",
  "accepted",
  "rejected",
  "withdrawn",
];

export class ApplicationValidationError extends Error {
  constructor(public field: string) {
    super(`Invalid ${field}`);
  }
}

const JOB_ID = /^[A-Za-z0-9_-]{1,100}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isJobId(value: unknown): value is string {
  return typeof value === "string" && JOB_ID.test(value);
}

export function isIsoDate(value: unknown, nullable = false): value is string | null {
  if (nullable && (value === null || value === "")) return true;
  if (typeof value !== "string" || !DATE.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

function boundedText(value: unknown, field: string, max: number, required = false): string {
  if (typeof value !== "string") throw new ApplicationValidationError(field);
  const normalized = value.trim();
  if ((required && !normalized) || normalized.length > max) throw new ApplicationValidationError(field);
  return normalized;
}

export function validateJobContext(value: unknown, jobId: string): CvJobContext {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ApplicationValidationError("jobContext");
  const context = value as Record<string, unknown>;
  if (context.id !== jobId) throw new ApplicationValidationError("jobContext");
  return {
    id: jobId,
    title: boundedText(context.title, "title", 200, true),
    company: boundedText(context.company ?? "", "company", 200),
    location: boundedText(context.location ?? "", "location", 200),
  };
}

export function validateApplicationUpdate(value: unknown) {
  const revision = validateApplicationRevision(value);
  const body = value as Record<string, unknown>;
  if (!APPLICATION_STATUSES.includes(body.status as ApplicationStatus)) throw new ApplicationValidationError("status");
  if (!isIsoDate(body.appliedAt)) throw new ApplicationValidationError("appliedAt");
  if (!isIsoDate(body.nextStepAt, true)) throw new ApplicationValidationError("nextStepAt");
  const nextStep = boundedText(body.nextStep ?? "", "nextStep", 500);
  return {
    ...revision,
    status: body.status as ApplicationStatus,
    appliedAt: body.appliedAt as string,
    nextStep: nextStep || null,
    nextStepAt: body.nextStepAt ? body.nextStepAt as string : null,
    notes: boundedText(body.notes ?? "", "notes", 5000),
  };
}

export function validateApplicationRevision(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ApplicationValidationError("body");
  const body = value as Record<string, unknown>;
  if (!isJobId(body.jobId)) throw new ApplicationValidationError("jobId");
  if (typeof body.updatedAt !== "string" || !Number.isFinite(Date.parse(body.updatedAt))) {
    throw new ApplicationValidationError("updatedAt");
  }
  return { jobId: body.jobId, updatedAt: body.updatedAt };
}
