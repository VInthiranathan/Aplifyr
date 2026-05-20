import { useRouter } from "next/router";
import type { GetServerSideProps } from "next";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Briefcase, MapPin, Wifi, Loader2, Bookmark } from "lucide-react";
import { formatLocation } from "../../lib/utils";
import CoverLetterModal from "../../components/CoverLetterModal";
import { getSupabaseBrowserClient } from "../../lib/supabaseClient";
import { useFavorites } from "../../lib/useFavorites";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:5000";

function decodeJob(encoded?: string) {
  if (!encoded) return null;
  try {
    const json = decodeURIComponent(atob(decodeURIComponent(encoded)));
    return JSON.parse(json);
  } catch {
    try {
      const json2 = decodeURIComponent(encoded);
      return JSON.parse(json2);
    } catch {
      return null;
    }
  }
}

export default function JobDetailPage() {
  const router = useRouter();
  const { id, data } = router.query;
  const { toggleFavorite, isFavorite } = useFavorites();
  
  const [job, setJob] = useState<any | null>(null);
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [rawResponse, setRawResponse] = useState<any | null>(null);
  const [jobHtml, setJobHtml] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [letter, setLetter] = useState<string | null>(null);
  const [showDebug, setShowDebug] = useState(false);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    // If `data` param exists (old behavior) prefer it, else fetch by id from backend
    if (data) {
      const decoded = Array.isArray(data) ? data[0] : data;
      const j = decodeJob(decoded as string);
      if (j) {
        setJob(j);
        return;
      }
    }

    if (!id) return;
    const fetchJob = async () => {
      setFetching(true);
      setFetchError(null);
      setRawResponse(null);
      try {
        const res = await fetch(`${BACKEND}/api/externaljobs/${id}`);
        const text = await res.text();
        setRawResponse(text);
        if (!res.ok) {
          setFetchError(`Status ${res.status}: ${text}`);
          console.error("Job fetch failed", res.status, text);
          return;
        }
        let data: any = null;
        try {
          data = JSON.parse(text);
        } catch (err) {
          data = text;
        }
        // If backend returned a structured error (e.g. Arbetsförmedlingen API provided
        // { cause: { code: '404', ... } }) treat as not-found and surface a message
        if (
          data &&
          typeof data === "object" &&
          data.cause &&
          data.cause.code === "404"
        ) {
          setFetchError(`Annons hittades inte (id=${id})`);
          setJob(null);
          setJobHtml(null);
          return;
        }

        // If backend returned a non-API error shape, surface it
        if (
          data &&
          typeof data === "object" &&
          (data.error || data.tracking_id)
        ) {
          setFetchError(JSON.stringify(data));
          setJob(null);
          setJobHtml(null);
          return;
        }

        // If backend returned a html fallback: { html: '...' }
        if (data && typeof data === "object" && typeof data.html === "string") {
          setJobHtml(data.html);
          setJob(null);
        }
        // API might return object with 'hits' or the job directly
        else if (
          data &&
          data.hits &&
          Array.isArray(data.hits) &&
          data.hits.length > 0
        )
          setJob(data.hits[0]);
        else if (data && data.result != null) setJob(data.result);
        else setJob(data);
      } catch (e) {
        console.error("Could not fetch job", e);
        setFetchError((e as Error).message);
      } finally {
        setFetching(false);
      }
    };

    fetchJob();
  }, [data, id]);

  const generate = async () => {
    if (!job) return;
    setGenerating(true);
    setLetter(null);
    try {
      // Get user profile for personalized letter
      const supabase = getSupabaseBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      let userProfile = null;
      if (session) {
        try {
          const profileRes = await fetch("/api/profile", {
            credentials: "same-origin",
          });
          if (profileRes.ok) {
            const profileData = await profileRes.json();
            if (profileData.profile) {
              userProfile = {
                name: profileData.profile.full_name,
                title: profileData.profile.title,
                location: profileData.profile.location,
                bio: profileData.profile.bio,
                tech_stack: profileData.profile.tech_stack,
                roles: profileData.profile.roles,
                cv_url: profileData.profile.cv_url,
              };
            }
          }
        } catch (e) {
          console.error("Failed to fetch user profile:", e);
        }
      }

      const res = await fetch(`${BACKEND}/api/coverletters/generate-all`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jobs: [job],
          user: userProfile,
        }),
      });
      const data = await res.json();
      if (Array.isArray(data) && data[0]?.coverLetter) {
        setLetter(data[0].coverLetter);
        setShowModal(true);
      } else if (Array.isArray(data) && data[0]?.error) {
        setLetter(`Fel: ${data[0].error}`);
        setShowModal(true);
      } else {
        setLetter("Ingen data mottagen");
        setShowModal(true);
      }
    } catch (e) {
      setLetter((e as Error).message);
      setShowModal(true);
    } finally {
      setGenerating(false);
    }
  };

  const getApplicationUrl = () => {
    if (!job) return undefined;
    const app = job.application_details || {};
    return (
      app.url ||
      app.application_url ||
      job.application_url ||
      job.webpage_url ||
      undefined
    );
  };

  if (!job && !jobHtml) {
    return (
      <div className="p-6">
        {fetching ? (
          <p className="text-sm text-slate-400">Hämtar annons…</p>
        ) : (
          <p className="text-sm text-slate-400">
            Ingen job-data hittad. Gå tillbaka till listan.
          </p>
        )}
        {fetchError && (
          <div className="mt-2 text-red-500 text-sm">Error: {fetchError}</div>
        )}
        <div className="mt-4">
          <Link href="/jobs" className="text-purple-600">
            ← Tillbaka till jobb
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={() => setShowDebug((s) => !s)}
          className="px-3 py-1 rounded-md bg-gray-200 dark:bg-white/5 text-sm"
        >
          {showDebug ? "Dölj API-logg" : "Visa API-logg"}
        </button>
        <div className="text-sm text-slate-500">
          (Visar rått svar från backend och parsed JSON för felsökning)
        </div>
      </div>
      {showDebug && (
        <div className="mb-4">
          {rawResponse && (
            <div className="mb-2">
              <div className="text-xs font-medium mb-1">
                Rått API-svar (text/html eller json):
              </div>
              <pre className="max-h-72 overflow-auto text-xs bg-slate-100 dark:bg-[#0b0b0b] p-3 rounded">
                {rawResponse}
              </pre>
            </div>
          )}
          {job && (
            <div>
              <div className="text-xs font-medium mb-1">
                Parsed jobb (JSON):
              </div>
              <pre className="max-h-72 overflow-auto text-xs bg-slate-100 dark:bg-[#0b0b0b] p-3 rounded">
                {JSON.stringify(job, null, 2)}
              </pre>
            </div>
          )}
          {jobHtml && (
            <div className="mt-2">
              <div className="text-xs font-medium mb-1">
                Jobb HTML (om backend returnerade html):
              </div>
              <pre className="max-h-72 overflow-auto text-xs bg-slate-100 dark:bg-[#0b0b0b] p-3 rounded">
                {jobHtml}
              </pre>
            </div>
          )}
        </div>
      )}
      {jobHtml ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-bold">Annons</h1>
            <div className="flex gap-2">
              <a
                href={`https://arbetsformedlingen.se/platsbanken/annonser/${id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-2 rounded-xl bg-white dark:bg-[#111] border text-sm"
              >
                Öppna original
              </a>
              <Link
                href="/jobs"
                className="px-3 py-2 rounded-xl bg-white dark:bg-[#111] border text-sm"
              >
                Tillbaka
              </Link>
            </div>
          </div>

          <div className="prose max-w-none text-sm text-slate-700 dark:text-white bg-white dark:bg-[#111] p-4 rounded-lg">
            <div dangerouslySetInnerHTML={{ __html: jobHtml ?? "" }} />
          </div>
        </div>
      ) : (
        <>
          <div className="max-w-6xl mx-auto">
            <div className="flex items-start gap-4">
              <div className="w-16 h-16 rounded-lg bg-slate-100 dark:bg-white/5 flex items-center justify-center">
                {job.logo_url ? (
                  <img
                    src={job.logo_url}
                    alt=""
                    className="w-full h-full object-contain p-1"
                  />
                ) : (
                  <Briefcase />
                )}
              </div>
              <div className="flex-1">
                <div className="flex items-start justify-between gap-4">
                  <h1 className="text-3xl font-semibold leading-tight">
                    {job.headline ?? job.title ?? "Jobb"}
                  </h1>
                  <button
                    onClick={() => {
                      toggleFavorite({
                        id: job.id,
                        title: job.headline ?? job.title,
                        company: job.employer?.name,
                        location: formatLocation(job.workplace_address),
                        matchGrade: job.matchGrade,
                      });
                    }}
                    className={`flex-shrink-0 p-2 transition-colors ${
                      isFavorite(job.id)
                        ? "text-purple-500 dark:text-purple-400"
                        : "text-slate-300 dark:text-white/20 hover:text-purple-500 dark:hover:text-purple-400"
                    }`}
                    title={
                      isFavorite(job.id)
                        ? "Ta bort från favoriter"
                        : "Lägg till i favoriter"
                    }
                  >
                    <Bookmark
                      size={24}
                      fill={isFavorite(job.id) ? "currentColor" : "none"}
                    />
                  </button>
                </div>
                <div className="text-sm text-slate-500 mt-1">
                  {job.employer?.name}
                </div>
                <div className="mt-3 text-sm text-slate-500 flex items-center gap-4">
                  {(job.workplace_address?.municipality ||
                    job.workplace_address?.region) && (
                    <span className="flex items-center gap-1">
                      <MapPin size={14} />
                      {formatLocation(job.workplace_address)}
                    </span>
                  )}
                  {job.remote && (
                    <span className="flex items-center gap-1 text-purple-500">
                      <Wifi size={14} />
                      Remote
                    </span>
                  )}
                </div>
                <div className="mt-3 text-sm text-slate-500">
                  {job.employment_type?.label && (
                    <span className="mr-4">{job.employment_type.label}</span>
                  )}
                  {job.working_hours_type?.label && (
                    <span className="mr-4">{job.working_hours_type.label}</span>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="col-span-2 space-y-6">
                <section className="bg-white dark:bg-[#111] p-6 rounded-lg">
                  <h2 className="text-2xl font-semibold mb-4">Om jobbet</h2>
                  <div className="prose max-w-none text-sm text-slate-700 dark:text-white">
                    {renderAFDescription(job)}
                  </div>
                </section>

                {/* Qualifications & Other information sections (Arbetsförmedlingen often provides these fields) */}

                {renderQualifications(job)}
                {renderOtherInformation(job)}
              </div>

              <aside className="col-span-1">
                <div className="bg-gray-50 dark:bg-[#0b0b0b] border border-gray-200 dark:border-white/5 rounded-lg p-6">
                  <h3 className="font-semibold mb-2">Sök jobbet</h3>
                  <p className="text-sm text-slate-500 mb-3">
                    {renderApplicationDeadline(job)}
                  </p>
                  <div className="flex flex-col gap-2 text-sm text-slate-700 dark:text-white">
                    {(() => {
                      const app = job.application_details || {};
                      const hasEmail = !!app.email;
                      const externalUrl =
                        app.url ||
                        app.application_url ||
                        job.application_url ||
                        job.application_details?.application_url ||
                        job.application_details?.external_url;

                      if (hasEmail) {
                        return (
                          <div className="space-y-1">
                            <div>
                              Ansök via mail:{" "}
                              <a
                                href={`mailto:${app.email}`}
                                className="text-purple-600"
                              >
                                {app.email}
                              </a>
                            </div>
                            {app.reference && (
                              <div>
                                Ange referens: <strong>{app.reference}</strong>
                              </div>
                            )}
                          </div>
                        );
                      }

                      if (externalUrl) {
                        return (
                          <a
                            href={externalUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-4 py-2 rounded-md bg-[#082c5b] hover:bg-[#063053] text-white text-sm text-center"
                          >
                            Ansök via extern webbplats
                          </a>
                        );
                      }

                      // Fallback: show generic instructions and AF page link
                      return (
                        <>
                          {renderApplicationInstructions(job)}
                          <a
                            href={getAfUrl(job)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-4 py-2 rounded-md bg-[#082c5b] hover:bg-[#063053] text-white text-sm text-center"
                          >
                            Öppna annons på Arbetsförmedlingen
                          </a>
                        </>
                      );
                    })()}
                  </div>
                </div>

                <div className="mt-4">
                  <button
                    onClick={generate}
                    disabled={generating}
                    className="w-full px-3 py-2 rounded-xl bg-purple-600 text-white text-sm"
                  >
                    {generating ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      "Generera personligt brev"
                    )}
                  </button>
                  <Link
                    href="/jobs"
                    className="block text-center mt-2 px-3 py-2 rounded-xl bg-white dark:bg-[#111] border text-sm"
                  >
                    Tillbaka
                  </Link>
                </div>
              </aside>
            </div>
          </div>
        </>
      )}

      {/* Cover Letter Modal */}
      {letter && (
        <CoverLetterModal
          isOpen={showModal}
          onClose={() => setShowModal(false)}
          letter={letter}
          jobTitle={job?.headline || job?.title || "Jobb"}
          company={job?.employer?.name || job?.advertiser || ""}
          applicationUrl={getApplicationUrl()}
          onRegenerate={generate}
          isRegenerating={generating}
        />
      )}
    </div>
  );
}

function unescapeHtml(input: string) {
  if (!input) return input;
  return input
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function escapeHtml(str: string) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function convertDescriptionText(input: string) {
  if (!input) return "";
  // Input is expected to have normalized newlines ("\n").
  const lines = input.split("\n");
  let out = "";
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trim();
    if (line === "") {
      // preserve blank lines as an extra <br/>
      out += "<br/>";
      continue;
    }

    const idx = line.indexOf(":");
    if (idx !== -1) {
      const head = line.slice(0, idx).trim();
      const rest = line.slice(idx + 1).trim();
      out += `<h2 class="text-xl font-semibold mt-4 mb-2">${escapeHtml(head)}</h2>`;
      if (rest) out += `${escapeHtml(rest)}`;
    } else {
      out += escapeHtml(line);
    }

    // ensure a newline after each original line
    out += "<br/>";
  }
  return out;
}

function getApplyUrl(job: any) {
  return (
    job.application_details?.application_url ||
    job.application_details?.external_url ||
    job.webpage_url ||
    job.application_url ||
    "#"
  );
}

function getAfUrl(job: any) {
  // Prefer Arbetsförmedlingen public ad page so users land on the AF announcement
  return (
    job.webpage_url ||
    job.application_details?.url ||
    job.application_details?.application_url ||
    job.application_url ||
    "#"
  );
}

function renderApplicationInstructions(job: any) {
  // If there is an email specified, show mail instruction + reference if present
  const app = job.application_details || {};
  if (app.email) {
    return (
      <div className="space-y-1">
        <div>
          Ansök via mail:{" "}
          <a href={`mailto:${app.email}`} className="text-purple-600">
            {app.email}
          </a>
        </div>
        {app.reference && (
          <div>
            Ange referens: <strong>{app.reference}</strong>
          </div>
        )}
      </div>
    );
  }

  // If there are application contacts, list first email/contact
  if (
    Array.isArray(job.application_contacts) &&
    job.application_contacts.length > 0
  ) {
    const c = job.application_contacts[0];
    if (c.email)
      return (
        <div>
          Kontakt:{" "}
          <a href={`mailto:${c.email}`} className="text-purple-600">
            {c.email}
          </a>
        </div>
      );
  }

  // Fallback: if external url exists let user know they should go to AF-annons (button)
  if (app.url) {
    return (
      <div>
        Ansök via extern webbplats enligt annons (öppna annonsen på
        Arbetsförmedlingen nedan).
      </div>
    );
  }

  // Generic fallback
  return (
    <div>Ansökningsinstruktioner finns i annonsen. Öppna annonsen nedan.</div>
  );
}

function renderApplicationDeadline(job: any) {
  const deadline =
    job.application_deadline ||
    job.application_details?.last_application_date ||
    job.last_application_date;
  if (!deadline) return "Sista ansökningsdag: Okänt";
  try {
    const d = new Date(deadline);
    return `Sista ansökningsdag: ${d.toLocaleDateString("sv-SE")}`;
  } catch {
    return `Sista ansökningsdag: ${deadline}`;
  }
}

function renderAFDescription(job: any) {
  // Prefer server-provided formatted HTML/text, but if the API returns
  // plain text with newlines (\n) we should convert those to paragraphs
  // and <br/> so they are visible in the browser.
  const html =
    job.text_formatted ||
    job.description?.text_formatted ||
    job.description_html ||
    job.description?.html;
  const text = job.text || job.description?.text || job.summary;

  const containsHtml = (s: string) => /<\/?[a-z][\s\S]*>/i.test(s);

  if (typeof html === "string" && html.trim().length > 0) {
    // Unescape any HTML entities and normalize literal "\\n" sequences
    const normalized = unescapeHtml(html)
      .replace(/\\n/g, "\n")
      .replace(/\r\n/g, "\n");
    // If server already provided HTML markup, render it verbatim.
    if (containsHtml(normalized))
      return <div dangerouslySetInnerHTML={{ __html: normalized }} />;

    // Preserve newlines exactly: convert each newline to a <br/>,
    // so double newlines become two <br/> (visual blank line) instead
    // of being collapsed into a single paragraph.
    const converted = convertDescriptionText(normalized);
    return <div dangerouslySetInnerHTML={{ __html: converted }} />;
  }

  if (typeof text === "string" && text.trim().length > 0) {
    const normalized = unescapeHtml(text)
      .replace(/\\n/g, "\n")
      .replace(/\r\n/g, "\n");
    const converted = convertDescriptionText(normalized);
    return <div dangerouslySetInnerHTML={{ __html: converted }} />;
  }

  if (
    typeof job.description === "object" &&
    typeof job.description.text === "string"
  ) {
    const normalized = unescapeHtml(job.description.text)
      .replace(/\\n/g, "\n")
      .replace(/\r\n/g, "\n");
    const converted = convertDescriptionText(normalized);
    return <div dangerouslySetInnerHTML={{ __html: converted }} />;
  }

  return <div>Ingen beskrivning tillgänglig</div>;
}

function renderQualifications(job: any) {
  // Arbetsförmedlingen may provide qualifications under several keys.
  const html =
    job.qualifications_html ||
    job.qualifications?.html ||
    job.qualifications?.text_formatted ||
    job.qualifications_formatted ||
    job.requirements_html ||
    job.requirements?.html;
  const text =
    (typeof job.qualifications === "string" && job.qualifications) ||
    job.qualifications?.text ||
    job.requirements ||
    job.requirements?.text ||
    job.skills ||
    job.qualification;

  const containsHtml = (s: string) => /<\/?[a-z][\s\S]*>/i.test(s);

  if (typeof html === "string" && html.trim().length > 0) {
    const normalized = unescapeHtml(html)
      .replace(/\\n/g, "\n")
      .replace(/\r\n/g, "\n");
    if (containsHtml(normalized))
      return (
        <section className="bg-white dark:bg-[#111] p-6 rounded-lg">
          <h2 className="text-2xl font-semibold mb-4">Kvalifikationer</h2>
          <div
            className="prose max-w-none text-sm text-slate-700 dark:text-white"
            dangerouslySetInnerHTML={{ __html: normalized }}
          />
        </section>
      );
    const converted = convertDescriptionText(normalized);
    return (
      <section className="bg-white dark:bg-[#111] p-6 rounded-lg">
        <h2 className="text-2xl font-semibold mb-4">Kvalifikationer</h2>
        <div
          className="prose max-w-none text-sm text-slate-700 dark:text-white"
          dangerouslySetInnerHTML={{ __html: converted }}
        />
      </section>
    );
  }

  if (typeof text === "string" && text.trim().length > 0) {
    const normalized = unescapeHtml(text)
      .replace(/\\n/g, "\n")
      .replace(/\r\n/g, "\n");
    const converted = convertDescriptionText(normalized);
    return (
      <section className="bg-white dark:bg-[#111] p-6 rounded-lg">
        <h2 className="text-2xl font-semibold mb-4">Kvalifikationer</h2>
        <div
          className="prose max-w-none text-sm text-slate-700 dark:text-white"
          dangerouslySetInnerHTML={{ __html: converted }}
        />
      </section>
    );
  }

  if (
    typeof job.qualifications === "object" &&
    typeof job.qualifications.text === "string"
  ) {
    const normalized = unescapeHtml(job.qualifications.text)
      .replace(/\\n/g, "\n")
      .replace(/\r\n/g, "\n");
    const converted = convertDescriptionText(normalized);
    return (
      <section className="bg-white dark:bg-[#111] p-6 rounded-lg">
        <h2 className="text-2xl font-semibold mb-4">Kvalifikationer</h2>
        <div
          className="prose max-w-none text-sm text-slate-700 dark:text-white"
          dangerouslySetInnerHTML={{ __html: converted }}
        />
      </section>
    );
  }

  return null;
}

function renderOtherInformation(job: any) {
  // Arbetsförmedlingen sometimes exposes additional info under different keys
  const html =
    job.other_information_html ||
    job.otherInformation?.html ||
    job.additional_information_html ||
    job.additionalInformation?.html;
  const text =
    job.other_information ||
    job.otherInformation ||
    job.additional_information ||
    job.additionalInformation ||
    job.otherInfo;

  const containsHtml = (s: string) => /<\/?[a-z][\s\S]*>/i.test(s);

  if (typeof html === "string" && html.trim().length > 0) {
    const normalized = unescapeHtml(html)
      .replace(/\\n/g, "\n")
      .replace(/\r\n/g, "\n");
    if (containsHtml(normalized))
      return (
        <section className="bg-white dark:bg-[#111] p-6 rounded-lg">
          <h2 className="text-2xl font-semibold mb-4">Övrig information</h2>
          <div
            className="prose max-w-none text-sm text-slate-700 dark:text-white"
            dangerouslySetInnerHTML={{ __html: normalized }}
          />
        </section>
      );
    const converted = convertDescriptionText(normalized);
    return (
      <section className="bg-white dark:bg-[#111] p-6 rounded-lg">
        <h2 className="text-2xl font-semibold mb-4">Övrig information</h2>
        <div
          className="prose max-w-none text-sm text-slate-700 dark:text-white"
          dangerouslySetInnerHTML={{ __html: converted }}
        />
      </section>
    );
  }

  if (typeof text === "string" && text.trim().length > 0) {
    const normalized = unescapeHtml(text)
      .replace(/\\n/g, "\n")
      .replace(/\r\n/g, "\n");
    const converted = convertDescriptionText(normalized);
    return (
      <section className="bg-white dark:bg-[#111] p-6 rounded-lg">
        <h2 className="text-2xl font-semibold mb-4">Övrig information</h2>
        <div
          className="prose max-w-none text-sm text-slate-700 dark:text-white"
          dangerouslySetInnerHTML={{ __html: converted }}
        />
      </section>
    );
  }

  if (
    typeof job.additionalInformation === "object" &&
    typeof job.additionalInformation.text === "string"
  ) {
    const normalized = unescapeHtml(job.additionalInformation.text)
      .replace(/\\n/g, "\n")
      .replace(/\r\n/g, "\n");
    const converted = convertDescriptionText(normalized);
    return (
      <section className="bg-white dark:bg-[#111] p-6 rounded-lg">
        <h2 className="text-2xl font-semibold mb-4">Övrig information</h2>
        <div
          className="prose max-w-none text-sm text-slate-700 dark:text-white"
          dangerouslySetInnerHTML={{ __html: converted }}
        />
      </section>
    );
  }

  return null;
}

export const getServerSideProps: GetServerSideProps = async ({ locale }) => {
  return {
    props: {
      ...(await serverSideTranslations(locale ?? "en", ["common"])),
    },
  };
};
