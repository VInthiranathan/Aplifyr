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
    region: string;
    country: string;
  };
  employment_type: { label: string } | null;
  working_hours_type: { label: string } | null;
  scope_of_work: { min: number; max: number } | null;
  application_deadline: string | null;
  webpage_url: string | null;
  logo_url: string | null;
  description: { text: string } | null;
  remote: boolean;
  matchGrade?: "A" | "B" | "C";
}

export interface AFSearchResult {
  total: { value: number };
  hits: ExternalJob[];
}
