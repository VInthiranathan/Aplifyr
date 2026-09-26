import { safeHtml } from "../lib/safeHtml";
export function unescapeHtml(input: string) {
  if (!input) return input;
  return input
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

export function escapeHtml(str: string) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function convertDescriptionText(input: string) {
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

export function getApplyUrl(job: any) {
  return (
    job.application_details?.application_url ||
    job.application_details?.external_url ||
    job.webpage_url ||
    job.application_url ||
    "#"
  );
}

export function getAfUrl(job: any) {
  // Prefer Arbetsförmedlingen public ad page so users land on the AF announcement
  return (
    job.webpage_url ||
    job.application_details?.url ||
    job.application_details?.application_url ||
    job.application_url ||
    "#"
  );
}

export function renderApplicationInstructions(job: any, t: (key: string, options?: Record<string, unknown>) => string) {
  // If there is an email specified, show mail instruction + reference if present
  const app = job.application_details || {};
  if (app.email) {
    return (
      <div className="space-y-1">
        <div>
          {t("jobDetail.applyByEmail")} {" "}
          <a href={`mailto:${app.email}`} className="text-purple-600">
            {app.email}
          </a>
        </div>
        {app.reference && (
          <div>
            {t("jobDetail.reference")} <strong>{app.reference}</strong>
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
          {t("jobDetail.contact")} {" "}
          <a href={`mailto:${c.email}`} className="text-purple-600">
            {c.email}
          </a>
        </div>
      );
  }

  // Fallback: if external url exists let user know they should go to AF-annons (button)
  if (app.url) {
    return <div>{t("jobDetail.externalInstructions")}</div>;
  }

  // Generic fallback
  return <div>{t("jobDetail.genericInstructions")}</div>;
}

export function renderApplicationDeadline(
  job: any,
  t: (key: string, options?: Record<string, unknown>) => string,
  localeTag: string,
) {
  const deadline =
    job.application_deadline ||
    job.application_details?.last_application_date ||
    job.last_application_date;
  if (!deadline) return t("jobDetail.applyDeadlineUnknown");
  try {
    const d = new Date(deadline);
    return t("jobDetail.deadlineLabel", {
      date: d.toLocaleDateString(localeTag),
    });
  } catch {
    return t("jobDetail.deadlineLabel", { date: String(deadline) });
  }
}

export function renderAFDescription(
  job: any,
  t: (key: string, options?: Record<string, unknown>) => string,
) {
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
    // Sanitize formatted HTML immediately before rendering.
    if (containsHtml(normalized))
      return <div dangerouslySetInnerHTML={{ __html: safeHtml(normalized) }} />;

    // Preserve newlines exactly: convert each newline to a <br/>,
    // so double newlines become two <br/> (visual blank line) instead
    // of being collapsed into a single paragraph.
    const converted = convertDescriptionText(normalized);
    return <div dangerouslySetInnerHTML={{ __html: safeHtml(converted) }} />;
  }

  if (typeof text === "string" && text.trim().length > 0) {
    const normalized = unescapeHtml(text)
      .replace(/\\n/g, "\n")
      .replace(/\r\n/g, "\n");
    const converted = convertDescriptionText(normalized);
    return <div dangerouslySetInnerHTML={{ __html: safeHtml(converted) }} />;
  }

  if (
    typeof job.description === "object" &&
    typeof job.description?.text === "string"
  ) {
    const normalized = unescapeHtml(job.description.text)
      .replace(/\\n/g, "\n")
      .replace(/\r\n/g, "\n");
    const converted = convertDescriptionText(normalized);
    return <div dangerouslySetInnerHTML={{ __html: safeHtml(converted) }} />;
  }

  return <div>{t("jobDetail.noDescription")}</div>;
}

export function renderQualifications(
  job: any,
  t: (key: string, options?: Record<string, unknown>) => string,
) {
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
          <h2 className="text-2xl font-semibold mb-4">{t("jobDetail.qualifications")}</h2>
          <div
            className="prose max-w-none text-sm text-slate-700 dark:text-white"
            dangerouslySetInnerHTML={{ __html: safeHtml(normalized) }}
          />
        </section>
      );
    const converted = convertDescriptionText(normalized);
    return (
      <section className="bg-white dark:bg-[#111] p-6 rounded-lg">
        <h2 className="text-2xl font-semibold mb-4">{t("jobDetail.qualifications")}</h2>
        <div
          className="prose max-w-none text-sm text-slate-700 dark:text-white"
          dangerouslySetInnerHTML={{ __html: safeHtml(converted) }}
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
        <h2 className="text-2xl font-semibold mb-4">{t("jobDetail.qualifications")}</h2>
        <div
          className="prose max-w-none text-sm text-slate-700 dark:text-white"
          dangerouslySetInnerHTML={{ __html: safeHtml(converted) }}
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
        <h2 className="text-2xl font-semibold mb-4">{t("jobDetail.qualifications")}</h2>
        <div
          className="prose max-w-none text-sm text-slate-700 dark:text-white"
          dangerouslySetInnerHTML={{ __html: safeHtml(converted) }}
        />
      </section>
    );
  }

  return null;
}

export function renderOtherInformation(
  job: any,
  t: (key: string, options?: Record<string, unknown>) => string,
) {
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
          <h2 className="text-2xl font-semibold mb-4">{t("jobDetail.otherInformation")}</h2>
          <div
            className="prose max-w-none text-sm text-slate-700 dark:text-white"
            dangerouslySetInnerHTML={{ __html: safeHtml(normalized) }}
          />
        </section>
      );
    const converted = convertDescriptionText(normalized);
    return (
      <section className="bg-white dark:bg-[#111] p-6 rounded-lg">
        <h2 className="text-2xl font-semibold mb-4">{t("jobDetail.otherInformation")}</h2>
        <div
          className="prose max-w-none text-sm text-slate-700 dark:text-white"
          dangerouslySetInnerHTML={{ __html: safeHtml(converted) }}
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
        <h2 className="text-2xl font-semibold mb-4">{t("jobDetail.otherInformation")}</h2>
        <div
          className="prose max-w-none text-sm text-slate-700 dark:text-white"
          dangerouslySetInnerHTML={{ __html: safeHtml(converted) }}
        />
      </section>
    );
  }

  if (
    typeof job.additionalInformation === "object" &&
    typeof job.additionalInformation?.text === "string"
  ) {
    const normalized = unescapeHtml(job.additionalInformation.text)
      .replace(/\\n/g, "\n")
      .replace(/\r\n/g, "\n");
    const converted = convertDescriptionText(normalized);
    return (
      <section className="bg-white dark:bg-[#111] p-6 rounded-lg">
        <h2 className="text-2xl font-semibold mb-4">{t('jobDetail.otherInformation')}</h2>
        <div
          className="prose max-w-none text-sm text-slate-700 dark:text-white"
          dangerouslySetInnerHTML={{ __html: safeHtml(converted) }}
        />
      </section>
    );
  }

  return null;
}
