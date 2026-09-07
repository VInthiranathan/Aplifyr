import { useTranslation } from 'next-i18next';
import { Briefcase, GraduationCap, ArrowUpRight } from 'lucide-react';
import type { CareerKind } from '../types/api';
import { useCareerEntries } from '../lib/CareerEntriesContext';
import { Button } from './ui/button';

export default function CareerOverview({ onManage }: { onManage: (kind: CareerKind) => void }) {
  const { t, i18n } = useTranslation('common');
  const { entries, loading, loadError, load } = useCareerEntries();
  const month = (value: string) => new Intl.DateTimeFormat(i18n.language, {
    month: 'short', year: 'numeric', timeZone: 'UTC',
  }).format(new Date(`${value}-01T00:00:00Z`));

  return <>
    {(['work', 'education'] as const).map(kind => {
      const Icon = kind === 'work' ? Briefcase : GraduationCap;
      const history = entries.filter(entry => entry.kind === kind).sort((a, b) =>
        Number(b.is_current) - Number(a.is_current) || b.start_month.localeCompare(a.start_month) || a.id.localeCompare(b.id));
      return <section key={kind} aria-labelledby={`overview-${kind}`} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-white/5 dark:bg-[#1a1a1a] sm:p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-purple-100 text-purple-700 dark:bg-purple-500/10 dark:text-purple-300"><Icon aria-hidden="true" className="h-5 w-5" /></span>
            <h2 id={`overview-${kind}`} className="text-lg font-bold text-gray-900 dark:text-white">{t(`career.${kind}.heading`)}</h2>
            {!loading && !loadError && <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-600 dark:bg-white/5 dark:text-white/60">{history.length}</span>}
          </div>
          <Button variant="secondary" className="h-auto px-3 py-2" onClick={() => onManage(kind)} aria-label={t('career.overview.manageLabel', { section: t(`career.${kind}.heading`) })}>
            {t('career.overview.manage')}<ArrowUpRight aria-hidden="true" className="h-4 w-4" />
          </Button>
        </div>
        {loading ? <p role="status" className="animate-pulse py-6 text-sm text-gray-500 dark:text-white/60">{t('career.loading')}</p>
          : loadError ? <div><p role="alert" className="text-sm text-red-700 dark:text-red-300">{t(`career.errors.${loadError}`)}</p><Button variant="secondary" className="mt-3" onClick={() => void load()}>{t('career.retry')}</Button></div>
          : history.length === 0 ? <div className="rounded-xl border border-dashed border-gray-200 p-5 dark:border-white/10">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{t(`career.${kind}.empty`)}</h3>
            <p className="mt-2 text-sm leading-relaxed text-gray-500 dark:text-white/60">{t(`career.${kind}.emptyHint`)}</p>
          </div> : <ol className="space-y-6">
            {history.map(entry => <li key={entry.id} className="relative min-w-0 border-l-2 border-purple-100 pl-5 dark:border-purple-500/20">
              <span aria-hidden="true" className="absolute -left-[5px] top-2 h-2 w-2 rounded-full bg-purple-500" />
              <article className="space-y-3 break-words [overflow-wrap:anywhere]">
                <div className="space-y-1">
                  <h3 className="font-semibold text-gray-900 dark:text-white">{entry.title}</h3>
                  <p className="text-sm text-gray-700 dark:text-white/80">{entry.organization}{entry.location ? ` · ${entry.location}` : ''}</p>
                  <p className="text-xs text-gray-500 dark:text-white/60"><time dateTime={entry.start_month}>{month(entry.start_month)}</time> – {entry.is_current ? <span className="font-medium text-purple-700 dark:text-purple-300">{t('career.present')}</span> : entry.end_month && <time dateTime={entry.end_month}>{month(entry.end_month)}</time>}</p>
                  {entry.qualification && <p className="text-sm text-gray-600 dark:text-white/70">{entry.qualification}</p>}
                </div>
                {(['description', 'achievements', 'learned', 'strengths'] as const).map(field => entry[field] && <div key={field}>
                  <h4 className="text-xs font-semibold text-gray-700 dark:text-white/80">{t(`career.${kind}.${field}`)}</h4>
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-gray-600 dark:text-white/60">{entry[field]}</p>
                </div>)}
                {!!entry.skills.length && <ul aria-label={t('career.skills')} className="flex flex-wrap gap-2">{entry.skills.map(skill => <li key={skill} className="rounded-lg bg-purple-50 px-2.5 py-1 text-xs font-medium text-purple-800 dark:bg-purple-500/10 dark:text-purple-200">{skill}</li>)}</ul>}
              </article>
            </li>)}
          </ol>}
      </section>;
    })}
  </>;
}
