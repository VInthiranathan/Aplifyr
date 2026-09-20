import { useTranslation } from 'next-i18next';
import { cvDocumentT } from '../lib/cvDocumentLanguage';
import type { CvContent, CvFact } from '../types/api';

export default function CvEditor({ content, onChange, disabled }: {
  content: CvContent; onChange: (content: CvContent) => void; disabled: boolean;
}) {
  const { t: uiT } = useTranslation('common');
  const t = cvDocumentT(content, uiT);
  function fields(rows: CvFact[], label: string, change: (rows: CvFact[]) => void) {
    return rows.map((row, index) => <label key={index} className="block space-y-1">
      <span className="text-sm font-medium">{label} · {index + 1}</span>
      <textarea value={row.text} maxLength={600} rows={3} disabled={disabled}
        onChange={event => change(rows.map((value, i) => i === index ? { ...value, text: event.target.value } : value))}
        className="w-full min-w-0 resize-y rounded-xl border border-gray-300 bg-white p-3 text-base text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-700 dark:border-white/20 dark:bg-[#161616] dark:text-white" />
    </label>);
  }
  return <section className="app-card-base min-w-0 space-y-5 rounded-2xl p-4 sm:p-6" aria-label={uiT('cv.edit')}>
    <p>{uiT('cv.editHelp')}</p>
    {fields(content.professionalSummary, t('cv.summary'), professionalSummary => onChange({ ...content, professionalSummary }))}
    {(['experience', 'education'] as const).map(section => <div key={section} className="space-y-4">
      {!!content[section].length && <h2 className="text-lg font-semibold">{t(`cv.${section}`)}</h2>}
      {content[section].map((entry, index) => <section key={entry.sourceId} className="space-y-2">
        <h3 className="font-medium break-words">{entry.title} · {entry.organization}</h3>
        {fields(entry.bullets, entry.title, bullets => onChange({ ...content,
          [section]: content[section].map((value, i) => i === index ? { ...value, bullets } : value) }))}
      </section>)}
    </div>)}
  </section>;
}
