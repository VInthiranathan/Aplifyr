import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'next-i18next';
import { Briefcase, GraduationCap, Plus, Save } from 'lucide-react';
import type { CareerEntry, CareerEntryInput, CareerKind } from '../types/api';
import { CareerValidationError, validateCareerEntry } from '../lib/careerValidation';
import { Button } from './ui/button';

const inputClass = 'w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-purple-500 dark:border-white/10 dark:bg-[#1a1a1a] dark:text-white';
const cardClass = 'rounded-2xl border border-gray-200 bg-white p-5 sm:p-6 dark:border-white/5 dark:bg-[#1a1a1a]';
const emptyEntry = (kind: CareerKind): CareerEntryInput => ({
  kind, title: '', organization: '', qualification: '', location: '',
  start_month: '', end_month: '', is_current: false, description: '',
  achievements: '', learned: '', skills: [], strengths: '',
});

export default function CareerHistory({ kind }: { kind: CareerKind }) {
  const { t, i18n } = useTranslation('common');
  const [entries, setEntries] = useState<CareerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [draft, setDraft] = useState<CareerEntryInput | null>(null);
  const [editing, setEditing] = useState<CareerEntry | null>(null);
  const [skillsText, setSkillsText] = useState('');
  const [busy, setBusy] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [discard, setDiscard] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  const mutationLock = useRef(false);
  const label = (field: string) => t(`career.${kind}.${field}`);
  const common = (key: string) => t(`career.${key}`);
  const Icon = kind === 'work' ? Briefcase : GraduationCap;

  const load = useCallback(async () => {
    setLoading(true); setLoadError('');
    try {
      const response = await fetch('/api/career', { credentials: 'same-origin' });
      if (!response.ok) { setLoadError(response.status === 401 ? 'unauthenticated' : 'loadError'); return; }
      const data = await response.json();
      setEntries(data.entries.filter((entry: CareerEntry) => entry.kind === kind));
    } catch { setLoadError('loadError'); }
    finally { setLoading(false); }
  }, [kind]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!draft) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [draft]);

  const begin = (entry?: CareerEntry) => {
    setEditing(entry ?? null); setDraft(entry ?? emptyEntry(kind));
    setSkillsText(entry?.skills.join(', ') ?? '');
    setError(''); setMessage(''); setDiscard(false); setDeleteId(null);
    setTimeout(() => formRef.current?.querySelector<HTMLInputElement>('input')?.focus(), 0);
  };
  const close = () => {
    setDraft(null); setEditing(null); setDiscard(false); setError('');
    setTimeout(() => addRef.current?.focus(), 0);
  };
  const update = (field: keyof CareerEntryInput, value: string | boolean) => {
    setDraft(previous => previous ? { ...previous, [field]: value } : previous);
    setDiscard(false); setError('');
  };
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft || mutationLock.current) return;
    setError(''); setMessage('');
    let entry: CareerEntryInput;
    try { entry = validateCareerEntry({ ...draft, skills: skillsText.split(',').map(s => s.trim()).filter(Boolean) }); }
    catch (err) {
      if (err instanceof CareerValidationError) {
        setError(t(`career.errors.${err.code}`));
        formRef.current?.querySelector<HTMLElement>(`[name="${err.field}"]`)?.focus();
      }
      return;
    }
    mutationLock.current = true; setBusy(true);
    try {
      const response = await fetch('/api/career', {
        method: editing ? 'PUT' : 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...entry, ...(editing ? { id: editing.id, updated_at: editing.updated_at } : {}) }),
      });
      const data = await response.json();
      if (!response.ok) {
        const key = response.status === 409 ? 'conflict' : response.status === 401 ? 'unauthenticated' : 'saveError';
        setError(t(`career.errors.${key}`)); return;
      }
      setEntries(previous => [...previous.filter(e => e.id !== data.entry.id), data.entry]);
      close(); setMessage(common('saved'));
    } catch { setError(t('career.errors.saveError')); }
    finally { mutationLock.current = false; setBusy(false); }
  };
  const remove = async (entry: CareerEntry) => {
    if (mutationLock.current) return;
    mutationLock.current = true; setBusy(true); setError(''); setMessage('');
    try {
      const response = await fetch('/api/career', {
        method: 'DELETE', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: entry.id, updated_at: entry.updated_at }),
      });
      if (!response.ok) { setError(t(`career.errors.${response.status === 409 ? 'conflict' : 'saveError'}`)); return; }
      setEntries(previous => previous.filter(e => e.id !== entry.id));
      setDeleteId(null); setMessage(common('deleted')); addRef.current?.focus();
    } catch { setError(t('career.errors.saveError')); }
    finally { mutationLock.current = false; setBusy(false); }
  };
  const formatMonth = (month: string) => new Intl.DateTimeFormat(i18n.language, { year: 'numeric', month: 'short', timeZone: 'UTC' })
    .format(new Date(`${month}-01T00:00:00Z`));
  const field = (name: 'title' | 'organization' | 'location' | 'qualification', required = false) => (
    <label className="block space-y-2 text-sm font-medium">
      <span>{label(name)}{required ? ' *' : ''}</span>
      <input name={name} required={required} maxLength={200} className={inputClass}
        value={draft?.[name] ?? ''} onChange={e => update(name, e.target.value)} />
    </label>
  );
  return (
    <div className="space-y-5 text-gray-900 dark:text-white">
      <div className={`${cardClass} flex flex-wrap items-start justify-between gap-4`}>
        <div className="max-w-2xl space-y-2">
          <h2 className="flex items-center gap-3 text-xl font-bold"><Icon aria-hidden="true" className="h-5 w-5" />{label('heading')}</h2>
          <p className="text-sm text-gray-500 dark:text-white/60">{label('intro')}</p>
        </div>
        <Button ref={addRef} onClick={() => begin()} disabled={loading || !!loadError || !!draft || busy}>
          <Plus aria-hidden="true" className="h-4 w-4" />{label('add')}
        </Button>
      </div>
      {loading && <p role="status">{common('loading')}</p>}
      {loadError && <div className={cardClass}><p role="alert">{t(`career.errors.${loadError}`)}</p><Button className="mt-3" variant="secondary" onClick={() => void load()}>{common('retry')}</Button></div>}
      {error && <p role="alert" className="rounded-xl border border-red-300 bg-red-50 p-4 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">{error}</p>}
      <p role="status" className="text-sm text-green-700 dark:text-green-300">{message}</p>
      {draft && (
        <form ref={formRef} onSubmit={save} className={`${cardClass} space-y-5`} aria-label={editing ? label('edit') : label('add')}>
          <h3 className="text-lg font-semibold">{editing ? label('edit') : label('add')}</h3>
          <p className="text-sm text-gray-500 dark:text-white/60">{common('requiredHint')}</p>
          <fieldset disabled={busy} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">{field('title', true)}{field('organization', true)}{field('location')}{kind === 'education' && field('qualification')}</div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block space-y-2 text-sm font-medium"><span>{common('startMonth')} *</span>
                <input name="start_month" type="month" required min="1900-01" max={new Date().toISOString().slice(0, 7)} className={inputClass} value={draft.start_month} onChange={e => update('start_month', e.target.value)} />
              </label>
              <label className="block space-y-2 text-sm font-medium"><span>{common('endMonth')}{!draft.is_current ? ' *' : ''}</span>
                <input name="end_month" type="month" required={!draft.is_current} disabled={draft.is_current} min={draft.start_month || '1900-01'} max={kind === 'work' ? new Date().toISOString().slice(0, 7) : undefined} className={`${inputClass} disabled:opacity-40`} value={draft.end_month ?? ''} onChange={e => update('end_month', e.target.value)} />
              </label>
            </div>
            <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={draft.is_current} onChange={e => setDraft({ ...draft, is_current: e.target.checked, end_month: e.target.checked ? null : '' })} />{label('current')}</label>
            {(['description', 'achievements', 'learned', 'strengths'] as const).map(name => (
              <label key={name} className="block space-y-2 text-sm font-medium"><span>{label(name)}</span>
                <p id={`${kind}-${name}-hint`} className="font-normal text-gray-500 dark:text-white/60">{label(`${name}Hint`)}</p>
                <textarea name={name} rows={3} maxLength={5000} aria-describedby={`${kind}-${name}-hint`} className={inputClass} value={draft[name]} onChange={e => update(name, e.target.value)} />
              </label>
            ))}
            <label className="block space-y-2 text-sm font-medium"><span>{common('skills')}</span>
              <p id={`${kind}-skills-hint`} className="font-normal text-gray-500 dark:text-white/60">{common('skillsHint')}</p>
              <input name="skills" aria-describedby={`${kind}-skills-hint`} className={inputClass} value={skillsText} onChange={e => { setSkillsText(e.target.value); setDiscard(false); }} />
            </label>
          </fieldset>
          <div className="flex flex-wrap gap-3">
            <Button type="submit" disabled={busy}><Save aria-hidden="true" className="h-4 w-4" />{busy ? common('saving') : common('save')}</Button>
            <Button type="button" variant="secondary" disabled={busy} onClick={() => setDiscard(true)}>{common('cancel')}</Button>
          </div>
          {discard && <div className="space-y-3 rounded-xl border border-gray-200 p-4 dark:border-white/10">
            <p>{common('discardConfirm')}</p><div className="flex flex-wrap gap-3"><Button type="button" variant="secondary" onClick={close}>{common('discard')}</Button><Button type="button" onClick={() => setDiscard(false)}>{common('keepEditing')}</Button></div>
          </div>}
        </form>
      )}
      {!loading && !loadError && !entries.length && !draft && <div className={`${cardClass} py-12 text-center`}>
        <Icon aria-hidden="true" className="mx-auto mb-4 h-9 w-9 text-gray-400" />
        <h3 className="font-semibold">{label('empty')}</h3><p className="mx-auto mt-2 max-w-xl text-sm text-gray-500 dark:text-white/60">{label('emptyHint')}</p>
      </div>}
      {[...entries].sort((a, b) => Number(b.is_current) - Number(a.is_current) || b.start_month.localeCompare(a.start_month) || a.id.localeCompare(b.id)).map(entry => (
        <article key={entry.id} className={`${cardClass} space-y-4 break-words`}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 space-y-1"><h3 className="text-lg font-semibold">{entry.title}</h3><p>{entry.organization}{entry.location ? ` · ${entry.location}` : ''}</p>
              <p className="text-sm text-gray-500 dark:text-white/60">{formatMonth(entry.start_month)} – {entry.is_current ? common('present') : entry.end_month ? formatMonth(entry.end_month) : ''}</p>
              {entry.qualification && <p className="text-sm">{entry.qualification}</p>}
            </div>
            <div className="flex gap-2"><Button variant="secondary" disabled={!!draft || busy} onClick={() => begin(entry)} aria-label={`${label('edit')}: ${entry.title}`}>{common('edit')}</Button>
              <Button variant="ghost" disabled={!!draft || busy} onClick={() => { setDeleteId(entry.id); setError(''); }} aria-label={`${common('delete')}: ${entry.title}`}>{common('delete')}</Button></div>
          </div>
          {(['description', 'achievements', 'learned', 'strengths'] as const).map(name => entry[name] && <div key={name}><h4 className="text-sm font-semibold">{label(name)}</h4><p className="mt-1 whitespace-pre-wrap text-sm text-gray-600 dark:text-white/70">{entry[name]}</p></div>)}
          {!!entry.skills.length && <div className="flex flex-wrap gap-2" aria-label={common('skills')}>{entry.skills.map(skill => <span key={skill} className="rounded-full bg-purple-50 px-3 py-1 text-sm text-purple-800 dark:bg-purple-500/10 dark:text-purple-200">{skill}</span>)}</div>}
          {deleteId === entry.id && <div className="space-y-3 border-t border-gray-200 pt-4 dark:border-white/10"><p>{t('career.deleteConfirm', { title: entry.title })}</p><div className="flex gap-3"><Button disabled={busy} onClick={() => void remove(entry)}>{common('confirmDelete')}</Button><Button variant="secondary" disabled={busy} onClick={() => setDeleteId(null)}>{common('cancel')}</Button></div></div>}
        </article>
      ))}
    </div>
  );
}
