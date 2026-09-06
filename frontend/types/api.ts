export type CareerKind = 'work' | 'education';

/** Verified profile facts; keep separate from generated, job-specific CV wording. */
export interface CareerEntryInput {
  kind: CareerKind;
  title: string;
  organization: string;
  location: string;
  qualification: string;
  start_month: string;
  end_month: string | null;
  is_current: boolean;
  description: string;
  achievements: string;
  learned: string;
  skills: string[];
  strengths: string;
}

export interface CareerEntry extends CareerEntryInput {
  id: string;
  updated_at: string;
}

export interface Job {
  id: number;
  isNew: boolean;
  badge: string | null;
  title: string;
  company: string;
  location: string;
  type: string;
  perks: string[];
  grade: "A" | "B" | "C";
}

export interface Progression {
  applied: number;
  readyToApply: number;
  readyToGenerate: number;
}

export interface JobsData {
  jobs: Job[];
  progression: Progression;
}

export interface User {
  id: string;
  name: string;
  title: string;
  location: string;
  locationPreferences: string[];
  bio: string;
  tags: string[];
  roles: string[];
  avatarInitials: string;
}

// Arbetsförmedlingen external job
export interface ExternalJob {
  id: string;
  headline: string;
  employer: { name: string; workplace: string };
  workplace_address: {
    municipality: string;
    municipality_code?: string;
    region: string;
    country: string;
  };
  employment_type: { concept_id?: string; label: string } | null;
  working_hours_type: { label: string } | null;
  occupation: { concept_id?: string; label: string } | null;
  occupation_group?: { concept_id?: string; label: string } | null;
  scope_of_work: { min: number; max: number } | null;
  application_deadline: string | null;
  webpage_url: string | null;
  logo_url: string | null;
  description?: { text: string } | null;
  remote: boolean;
  matchGrade?: "A" | "B" | "C";
}

export interface AFSearchResult {
  total: { value: number };
  hits: ExternalJob[];
}

// ── Personalized matching types ──────────────────────────────────────────────

export interface MatchDebug {
  locationScore: number;
  locationTier:
    | 'same_municipality'
    | 'same_region'
    | 'same_region_nearby'
    | 'same_region_strict'
    | 'remote'
    | 'country'
    | 'out_of_region'
    | 'no_preference';
  techBoost: number;
  matchedTechTerms: string[];
  totalScore: number;
  /** Human-readable score breakdown, e.g. "location(3) + tech(1) = 4" */
  scoreBreakdown: string;
  roleMatchedOn: string;
  roleMatchedValue: string;
  /** Ordered explanation lines shown in the ?debug=1 helper */
  reasons: string[];
}

export interface MatchedJob extends ExternalJob {
  matchGrade: 'A' | 'B' | 'C'; // required — overrides optional in ExternalJob
  matchDebug: MatchDebug;
}

export interface MatchedJobsResponse {
  matched: MatchedJob[];
  /**
   * How many jobs were fetched from AF, passed the role filter, and the cap applied.
   * If `totalMatched <= limit`, the filter was the bottleneck. If `totalMatched > limit`,
   * the cap was.
   */
  stats: {
    returned: number;
    totalMatched: number;
    limit: number;
    fetchComplete: boolean;
    totalAfJobs: number;
  };
  /**
   * Grade band descriptions + location/tech scoring reference table.
   * Intended for developer use (visible at ?debug=1 and in raw JSON responses).
   */
  thresholds: {
    A: string;
    B: string;
    C: string;
    scoringKey: {
      same_municipality: number;
      same_region: number;
      remote: number;
      out_of_region: number;
      no_preference: number;
      tech_boost: string;
    };
  };
  profileUsed: {
    roles: string[];
    title: string | null;
    tags: string[];
    location: string | null;
    locationPreferences: string[];
    desiredRolesSource: 'roles' | 'title_fallback' | 'none';
  };
}

export interface MatchProfileRequest {
  roles?: string[];
  title?: string;
  tags?: string[];
  location?: string;
  locationPreferences?: string[];
}
