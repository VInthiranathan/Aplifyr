import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'next-i18next';
import { Briefcase, MapPin, Save } from 'lucide-react';
import type { User } from '../types/api';
import { locationPreferenceKeys, validateJobPreferences } from '../lib/jobPreferences';
import { Button } from './ui/button';

interface Props {
  profile: User | null | undefined;
  onSaved: (profile: Record<string, unknown>) => void;
}

export default function JobPreferences({ profile, onSaved }: Props) {
  const { t } = useTranslation('common');
  const [roles, setRoles] = useState(profile?.roles.join(', ') ?? '');
  const [location, setLocation] = useState(profile?.location ?? '');
  const [locations, setLocations] = useState(profile?.locationPreferences ?? []);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error' | 'invalid' | 'conflict'>('idle');
  const saving = useRef(false);
  const previousProfile = useRef(profile);
  const dirty = roles !== (profile?.roles.join(', ') ?? '') || location !== (profile?.location ?? '') ||
    JSON.stringify(locations) !== JSON.stringify(profile?.locationPreferences ?? []);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  function reset() {
    setRoles(profile?.roles.join(', ') ?? '');
    setLocation(profile?.location ?? '');
    setLocations(profile?.locationPreferences ?? []);
    setStatus('idle');
  }
  useEffect(() => {
    const previous = previousProfile.current;
    const hadDraft = roles !== (previous?.roles.join(', ') ?? '') || location !== (previous?.location ?? '') ||
      JSON.stringify(locations) !== JSON.stringify(previous?.locationPreferences ?? []);
    if (!hadDraft || previous?.id !== profile?.id) {
      setRoles(profile?.roles.join(', ') ?? '');
      setLocation(profile?.location ?? '');
      setLocations(profile?.locationPreferences ?? []);
    }
    previousProfile.current = profile;
  }, [profile]); // eslint-disable-line react-hooks/exhaustive-deps
  const inputClass = 'w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-purple-500 dark:border-white/10 dark:bg-white/5 dark:text-white';
  if (profile === undefined) return <p role="status">{t('preferences.loading')}</p>;
  if (!profile) return <p role="alert">{t('preferences.unavailable')}</p>;

  return <form className="space-y-6" onSubmit={async event => {
    event.preventDefault();
    if (saving.current) return;
    const input = validateJobPreferences({ roles: roles.split(',').map(role => role.trim()).filter(Boolean), location, locationPreferences: locations });
    if (!input) { setStatus('invalid'); return; }
    saving.current = true;
    setStatus('saving');
    try {
      const response = await fetch('/api/profile', { method: 'PATCH', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...input, updatedAt: profile.updatedAt ?? null }) });
      if (response.status === 409) { setStatus('conflict'); return; }
      if (!response.ok) throw new Error('save failed');
      const data = await response.json();
      if (!data.profile) throw new Error('missing profile');
      onSaved(data.profile);
      setRoles((data.profile.roles ?? []).join(', '));
      setLocation(data.profile.location ?? '');
      setLocations(data.profile.location_preferences ?? []);
      setStatus('saved');
    } catch { setStatus('error'); }
    finally { saving.current = false; }
  }}>
    <div className="app-page-header">
      <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{t('preferences.title')}</h2>
      <p className="app-page-subtitle">{t('preferences.intro')}</p>
    </div>
    <fieldset disabled={status === 'saving'} className="grid min-w-0 gap-6 lg:grid-cols-2">
      <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-white/5 dark:bg-[#1a1a1a]">
        <label htmlFor="preferred-roles" className="mb-4 flex items-center gap-3 text-xl font-bold text-gray-900 dark:text-white"><Briefcase aria-hidden="true" className="h-5 w-5" />{t('user.desiredRoles')}</label>
        <input id="preferred-roles" value={roles} onChange={e => { setRoles(e.target.value); setStatus('idle'); }} aria-describedby="roles-help" placeholder={t('user.rolesPlaceholder')} className={inputClass} />
        <p id="roles-help" className="mt-3 text-sm text-gray-500 dark:text-white/60">{t('preferences.rolesHelp')}</p>
        <p className="mt-4 text-sm text-gray-500 dark:text-white/60">{t('preferences.skillsHelp')}</p>
      </div>
      <div className="space-y-4 rounded-2xl border border-gray-200 bg-white p-6 dark:border-white/5 dark:bg-[#1a1a1a]">
        <label htmlFor="preferred-location" className="flex items-center gap-3 text-xl font-bold text-gray-900 dark:text-white"><MapPin aria-hidden="true" className="h-5 w-5" />{t('user.location')}</label>
        <input id="preferred-location" value={location} maxLength={200} onChange={e => { setLocation(e.target.value); setStatus('idle'); }} aria-describedby="location-help" className={inputClass} />
        <p id="location-help" className="text-sm text-gray-500 dark:text-white/60">{t('preferences.locationHelp')}</p>
        <fieldset>
          <legend className="mb-3 font-semibold text-gray-900 dark:text-white">{t('user.locationPreferences')}</legend>
          <div className="flex flex-wrap gap-3">{locationPreferenceKeys.map(key => <label key={key} className="app-hover-standard flex cursor-pointer items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 dark:border-white/10 dark:text-white">
            <input type="checkbox" checked={locations.includes(key)} onChange={e => { setLocations(previous => e.target.checked ? [...previous, key] : previous.filter(value => value !== key)); setStatus('idle'); }} className="h-4 w-4 accent-purple-600" />{t(`user.${key}`)}
          </label>)}</div>
          <p className="mt-3 text-sm text-gray-500 dark:text-white/60">{t('preferences.scopeHelp')}</p>
        </fieldset>
      </div>
    </fieldset>
    <div className="flex flex-wrap items-center gap-3">
      <Button type="submit" disabled={!dirty || status === 'saving'}><Save aria-hidden="true" className="h-4 w-4" />{t(status === 'saving' ? 'preferences.saving' : 'user.saveChanges')}</Button>
      <Button type="button" variant="secondary" disabled={!dirty || status === 'saving'} onClick={reset}>{t('preferences.reset')}</Button>
      {(status === 'error' || status === 'invalid' || status === 'conflict') ? <p role="alert" className="text-sm text-red-600 dark:text-red-400">{t(`preferences.${status}`)}</p> :
        <p role="status" className="text-sm text-gray-500 dark:text-white/60">{status === 'saved' ? t('preferences.saved') : dirty ? t('preferences.unsaved') : ''}</p>}
    </div>
  </form>;
}
