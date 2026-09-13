import { useRef, useState } from 'react';
import { useTranslation } from 'next-i18next';
import AiConsent from './AiConsent';
import { Button } from './ui/button';
import { useDialogFocus } from '../lib/useDialogFocus';

/** Mounted fresh for each generation attempt. Server reservations remain authoritative. */
export default function AiGenerationConsent({ onClose, onConfirm }: { onClose: () => void; onConfirm: () => void }) {
  const { t } = useTranslation('common');
  const [ready, setReady] = useState(false);
  const submitted = useRef(false);
  const dialog = useDialogFocus(true, onClose);
  function confirm() {
    if (!ready || submitted.current) return;
    submitted.current = true;
    onConfirm();
  }
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
    <div ref={dialog} role="dialog" aria-modal="true" aria-label={t('consent.title')} tabIndex={-1}
      className="app-card-base w-full max-w-xl max-h-[90dvh] overflow-y-auto bg-white dark:bg-[#111] p-4 space-y-4">
      <Button variant="secondary" onClick={onClose}>{t('consent.cancelGeneration')}</Button>
      <AiConsent providers={['gemini']} onReady={setReady} />
      <Button disabled={!ready} onClick={confirm}>{t('consent.continueGeneration')}</Button>
    </div>
  </div>;
}
