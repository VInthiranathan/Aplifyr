import type { GetServerSideProps } from 'next';
import AiConsent from '../components/AiConsent';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { useTranslation } from 'next-i18next';
import { useState } from 'react';
import Link from 'next/link';
import { Button } from '../components/ui/button';

type Props = { notice: string; contact: string | null };
export const getServerSideProps: GetServerSideProps<Props> = async ({ locale, res }) => {
  res.setHeader('Cache-Control', 'private, no-store');
  const email = process.env.PRIVACY_CONTACT_EMAIL ?? '';
  return { props: { notice: (locale === 'sv' ? process.env.PRIVACY_NOTICE_SV : process.env.PRIVACY_NOTICE_EN) ?? '',
    contact: /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email) ? email : null,
    ...(await serverSideTranslations(locale ?? 'en', ['common'])) } };
};

export default function PrivacyPage({ notice, contact }: Props) {
  const { t } = useTranslation('common');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function download() {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/account/export', { credentials: 'same-origin' });
      if (!response.ok) throw new Error('Export failed');
      const data = await response.json();
      let favorites: unknown = null;
      try { favorites = JSON.parse(localStorage.getItem(`aplifyr_favorites:${data.account.id}`) ?? '[]'); } catch { /* Mark unavailable, never silently claim empty. */ }
      const blob = new Blob([JSON.stringify({ ...data, localFavorites: favorites }, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a'); link.href = url; link.download = 'aplifyr-personuppgifter.json'; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { setError(t('privacy.exportError')); } finally { setBusy(false); }
  }
  return <main className="app-page-shell max-w-3xl mx-auto">
    <h1 className="app-page-title">{t('privacy.title')}</h1>
    <p className="whitespace-pre-wrap">{notice || t('privacy.pending')}</p>
    <p>{t('privacy.exportScope')}</p>
    <Button onClick={download} disabled={busy}>{t('privacy.export')}</Button>
    {error && <p role="alert">{error}</p>}
    <h2 className="text-xl font-semibold">{t('privacy.rights')}</h2>
    <AiConsent />
    <p>{t('privacy.rightsDetails')}</p>
    {contact ? <a className="underline" href={`mailto:${encodeURIComponent(contact)}`}>{contact}</a> : <p role="status">{t('privacy.contactPending')}</p>}
    <Link href="/auth" className="underline">{t('auth.backToSignIn')}</Link>
  </main>;
}
