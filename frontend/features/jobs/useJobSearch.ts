import { useTranslation } from 'next-i18next';
import { useCallback,useEffect,useRef,useState } from 'react';
import { getPublicBackendUrl } from '../../lib/backendUrl';
import type { AFSearchResult,ExternalJob } from '../../types/api';
const BACKEND = getPublicBackendUrl();
export interface Filters {
  q: string;
  municipalities: string[];
  regions: string[];
  occupationCodes: string[];
  remote: boolean;
  employmentType: string;
}

export type OccupationOption = {
  codes: string[];
  label: string;
  count: number;
};

type EmploymentOption = {
  value: string;
  label: string;
};

export function useJobSearch() {
  const {t} = useTranslation('common');
  const [filters, setFilters] = useState<Filters>({
    q: "",
    municipalities: [],
    regions: [],
    occupationCodes: [],
    remote: false,
    employmentType: "",
  });
  const [occupationOptions, setOccupationOptions] = useState<OccupationOption[]>([]);
  const [selectedOccupationLabel, setSelectedOccupationLabel] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [jobs, setJobs] = useState<ExternalJob[]>([]);
  const requestIdRef = useRef(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const LIMIT = 20;

  // Debounce search query 400ms
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedQ(filters.q);
      setOffset(0);
    }, 400);
    return () => clearTimeout(t);
  }, [filters.q]);

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    const reqId = ++requestIdRef.current;
    setError(null);
    try {
      const params = new URLSearchParams();
      if (debouncedQ) params.set("q", debouncedQ);
      // Send regions and municipalities (if any). Backend now supports
      // resolving multiple municipality params to AF codes, so always send
      // both when selected. This ensures AF does server-side filtering and
      // pagination is consistent (no empty pages before results).
      if (filters.regions?.length) {
        filters.regions.forEach((r) => params.append("region", r));
      }
      if (filters.municipalities?.length) {
        filters.municipalities.forEach((m) => params.append("municipality", m));
      }
      if (filters.remote) params.set("remote", "true");
      if (filters.employmentType) {
        params.set("employmentType", filters.employmentType);
      }
      if (filters.occupationCodes.length > 0) {
        filters.occupationCodes.forEach((occupationCode) =>
          params.append("occupation", occupationCode),
        );
      }
      params.set("limit", String(LIMIT));
      params.set("offset", String(offset));

      const requestUrl = `${BACKEND}/api/externaljobs?${params}`;
      const res = await fetch(requestUrl);
      const text = await res.text();
      // Ignore stale responses
      if (reqId !== requestIdRef.current) return;
      if (!res.ok) throw new Error(`${res.status}`);
      let data: AFSearchResult | any = null;
      try {
        data = JSON.parse(text);
      } catch {
        data = null;
      }
      const hits: ExternalJob[] = (data && (data.hits ?? data.jobs)) || [];
      const serverTotal = (data && (data.total?.value ?? data.total)) ?? hits.length;

      // If this response is stale (a newer request started), ignore it.
      if (reqId !== requestIdRef.current) return;

      // If the current offset is beyond the server-reported total, clamp to
      // the last available page and trigger a refetch. This prevents empty
      // pages when filters reduce the result set or when the user navigated
      // to a later page before applying filters.
      if (serverTotal > 0 && offset >= serverTotal) {
        const newOffset = Math.max(0, Math.floor((serverTotal - 1) / LIMIT) * LIMIT);
        setOffset(newOffset);
        // Do not clear loading here; the subsequent fetch will set loading.
        return;
      }

      setJobs(hits);
      setTotal(serverTotal);
    } catch (e) {
      // Only set error for the latest request
      if (requestIdRef.current === reqId) {
        setError(t("jobs.fetchError"));
        setJobs([]);
      }
    } finally {
      // Only update loading state for the latest request
      if (requestIdRef.current === reqId) setLoading(false);
    }
  }, [
    debouncedQ,
    filters.municipalities,
    filters.regions,
    filters.remote,
    filters.employmentType,
    filters.occupationCodes,
    offset,
    t,
  ]);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  useEffect(() => {
    let cancelled = false;

    const fetchOccupationOptions = async () => {
      try {
        const params = new URLSearchParams();
        if (debouncedQ) params.set("q", debouncedQ);
        if (filters.regions.length > 0) {
          filters.regions.forEach((region) => params.append("region", region));
        }
        if (filters.municipalities.length > 0) {
          filters.municipalities.forEach((municipality) =>
            params.append("municipality", municipality),
          );
        }
        if (filters.remote) params.set("remote", "true");
        if (filters.employmentType) {
          params.set("employmentType", filters.employmentType);
        }

        const response = await fetch(
          `${BACKEND}/api/externaljobs/occupations?${params}`,
        );

        if (!response.ok) {
          throw new Error(String(response.status));
        }

        const data = (await response.json()) as OccupationOption[];
        if (cancelled) return;

        setOccupationOptions(data);

        const selectedOption = data.find((option) =>
          option.codes.some((code) => filters.occupationCodes.includes(code)),
        );
        if (selectedOption) {
          setSelectedOccupationLabel(selectedOption.label);
        } else if (filters.occupationCodes.length === 0) {
          setSelectedOccupationLabel("");
        }
      } catch {
        if (!cancelled) {
          setOccupationOptions([]);
        }
      }
    };

    fetchOccupationOptions();

    return () => {
      cancelled = true;
    };
  }, [
    debouncedQ,
    filters.regions,
    filters.municipalities,
    filters.remote,
    filters.employmentType,
    filters.occupationCodes,
  ]);

  const update = (patch: Partial<Filters>) => {
    setFilters((f) => ({ ...f, ...patch }));
    setOffset(0);
    setJobs([]);
    setTotal(0);
  };

  const filteredJobs = jobs;
  const hasActiveFilters =
    filters.q.trim() !== "" ||
    filters.regions.length > 0 ||
    filters.municipalities.length > 0 ||
    filters.remote ||
    filters.employmentType !== "" ||
    filters.occupationCodes.length > 0;

  const totalPages = Math.ceil(total / LIMIT);
  const currentPage = Math.floor(offset / LIMIT) + 1;

  return {filters, occupationOptions, selectedOccupationLabel, setSelectedOccupationLabel, update,
    filteredJobs, total, loading, error, offset, setOffset, LIMIT, hasActiveFilters, totalPages, currentPage};
}
