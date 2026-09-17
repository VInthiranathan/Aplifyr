import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'next-i18next';
import AiConsent from './AiConsent';
import { Button } from './ui/button';
import { useDialogFocus } from '../lib/useDialogFocus';

type ConsentData={
  notices:Array<{provider:string;version:string;enabled:boolean;notice_sv:string;notice_en:string}>;
  consents:Array<{provider:string;notice_version:string;granted:boolean}>;
};

function hasCurrentConsent(data:ConsentData,provider:string):boolean {
  const notice=data.notices.find(item=>item.provider===provider&&item.enabled);
  return !!notice&&data.consents.some(item=>item.provider===provider&&item.granted&&item.notice_version===notice.version);
}

/** Silently accepts current saved consent; only opens the dialog when a choice is required. */
export default function AiGenerationConsent({ onClose, onConfirm }: { onClose: () => void; onConfirm: () => void }) {
  const { t } = useTranslation('common');
  const [ready, setReady] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [initialData, setInitialData] = useState<ConsentData>();
  const submitted = useRef(false);
  const confirmCallback = useRef(onConfirm); confirmCallback.current=onConfirm;
  const dialog = useDialogFocus(dialogOpen, onClose);
  useEffect(()=>{
    const controller=new AbortController();
    fetch('/api/account/consent',{signal:controller.signal,credentials:'same-origin'})
      .then(async response=>{if(!response.ok)throw Error();return response.json() as Promise<ConsentData>;})
      .then(data=>{
        if(controller.signal.aborted)return;
        if(hasCurrentConsent(data,'gemini')) {
          submitted.current=true;
          confirmCallback.current();
          return;
        }
        setInitialData(data);
        setDialogOpen(true);
      })
      .catch(()=>{if(!controller.signal.aborted)setDialogOpen(true);});
    return ()=>controller.abort();
  },[]);
  function confirm() {
    if (!ready || submitted.current) return;
    submitted.current = true;
    onConfirm();
  }
  if(!dialogOpen)return null;
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
    <div ref={dialog} role="dialog" aria-modal="true" aria-label={t('consent.title')} tabIndex={-1}
      className="app-card-base w-full max-w-xl max-h-[90dvh] overflow-y-auto bg-white dark:bg-[#111] p-4 space-y-4">
      <Button variant="secondary" onClick={onClose}>{t('consent.cancelGeneration')}</Button>
      <AiConsent providers={['gemini']} onReady={setReady} initialData={initialData} />
      <Button disabled={!ready} onClick={confirm}>{t('consent.continueGeneration')}</Button>
    </div>
  </div>;
}
