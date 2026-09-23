import { useCallback, useEffect, useState } from "react";
import type { ApplicationStatus } from "../types/api";

type ApplicationStatusMap = Record<string, ApplicationStatus>;

export function useApplicationStatuses() {
  const [applicationStatuses, setApplicationStatuses] = useState<ApplicationStatusMap>({});

  const loadApplicationStatuses = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch("/api/applications", { signal });
      if (!response.ok) return;

      const body = await response.json() as {
        applications?: Array<{ job_id: string; status: ApplicationStatus }>;
      };
      const next: ApplicationStatusMap = {};
      for (const application of body.applications ?? []) {
        next[application.job_id] = application.status;
      }
      if (!signal?.aborted) setApplicationStatuses(next);
    } catch (cause) {
      if (cause instanceof Error && cause.name === "AbortError") return;
      // Status badges are supplementary; job discovery must remain available.
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadApplicationStatuses(controller.signal);

    const refresh = () => void loadApplicationStatuses();
    window.addEventListener("focus", refresh);
    window.addEventListener("pageshow", refresh);
    return () => {
      controller.abort();
      window.removeEventListener("focus", refresh);
      window.removeEventListener("pageshow", refresh);
    };
  }, [loadApplicationStatuses]);

  return applicationStatuses;
}
