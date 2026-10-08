import { useEffect, useRef } from 'react';
import Router from 'next/router';
import { useTranslation } from 'next-i18next';

/** Keep drafts on cancelled navigation; drafts remain in memory only. */
export function useUnsavedChanges(dirty: boolean) {
  const { t } = useTranslation('common');
  const state = useRef({ dirty, message: t('workspace.unsavedChanges') });
  state.current = { dirty, message: t('workspace.unsavedChanges') };
  const confirmDiscard = () => !state.current.dirty || window.confirm(state.current.message);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const unload = (event: BeforeUnloadEvent) => {
      if (!state.current.dirty) return;
      event.preventDefault();
      event.returnValue = '';
    };
    const navigate = (url: string, options: { shallow: boolean }) => {
      if (confirmDiscard()) return;
      const error = Object.assign(new Error('Navigation cancelled'), { cancelled: true });
      Router.events.emit('routeChangeError', error, url, options);
      throw error;
    };
    window.addEventListener('beforeunload', unload);
    Router.events?.on('routeChangeStart', navigate);
    return () => {
      window.removeEventListener('beforeunload', unload);
      Router.events?.off('routeChangeStart', navigate);
    };
  }, []);
  return confirmDiscard;
}
