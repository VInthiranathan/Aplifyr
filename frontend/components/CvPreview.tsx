import { useTranslation } from 'next-i18next';
import type { CvContent, CvEntry } from '../types/api';

/** Plain, single-column semantic content; export and future templates consume the same JSON. */
export default function CvPreview({ content }: { content: CvContent }) {
  const { t } = useTranslation('common');
  function entries(title: string, rows: CvEntry[]) {
    if (!rows.length) return null;
    return <section className="space-y-5"><h2 className="border-b border-gray-300 pb-2 text-lg font-semibold">{title}</h2>
      {rows.map(entry => <section key={entry.sourceId} className="space-y-2 break-inside-avoid">
        <h3 className="font-semibold">{entry.title}</h3><p>{entry.organization}</p>
        {entry.qualification && <p>{entry.qualification}</p>}
        <p className="text-sm text-gray-600">{entry.startMonth} – {entry.isCurrent ? t('cv.present') : entry.endMonth}</p>
        {!!entry.bullets.length && <ul className="list-disc pl-5 space-y-1">{entry.bullets.map(f => <li key={`${f.sourceFactId}:${f.text}`}>{f.text}</li>)}</ul>}
      </section>)}
    </section>;
  }
  return <article aria-label={t('cv.preview')} className="mx-auto max-w-[210mm] min-h-[70vh] bg-white text-gray-900 shadow-sm border border-gray-200 p-6 sm:p-12 space-y-7 break-words">
    <header className="space-y-2"><h1 className="text-3xl font-bold">{content.name}</h1><p className="text-lg">{content.title}</p><p>{content.location}</p></header>
    {!!content.professionalSummary.length && <section className="space-y-2"><h2 className="border-b border-gray-300 pb-2 text-lg font-semibold">{t('cv.summary')}</h2>{content.professionalSummary.map(f => <p key={`${f.sourceFactId}:${f.text}`}>{f.text}</p>)}</section>}
    {!!content.skills.length && <section className="space-y-2"><h2 className="border-b border-gray-300 pb-2 text-lg font-semibold">{t('cv.skills')}</h2><p>{content.skills.join(' · ')}</p></section>}
    {entries(t('cv.experience'), content.experience)}{entries(t('cv.education'), content.education)}
  </article>;
}
