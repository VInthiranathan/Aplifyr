import {useEffect,useState} from 'react';
import {useRouter} from 'next/router';
import {useTranslation} from 'next-i18next';
import Link from 'next/link';
type Notice={provider:string;version:string;notice_sv:string;notice_en:string;enabled:boolean};
type Consent={provider:string;notice_version:string;granted:boolean};
export default function AiConsent({providers=['gemini','groq']}: {providers?: string[]}) {
 const {t}=useTranslation('common');const {locale}=useRouter();
 const [data,setData]=useState<{notices:Notice[];consents:Consent[]}|null>(null);
 const [busy,setBusy]=useState(true);const [error,setError]=useState('');
 useEffect(()=>{const controller=new AbortController();
  fetch('/api/account/consent',{signal:controller.signal}).then(async r=>{if(!r.ok)throw Error();return r.json();}).then(setData).catch(()=>{if(!controller.signal.aborted)setError(t('consent.error'));}).finally(()=>{if(!controller.signal.aborted)setBusy(false);});
  return ()=>controller.abort();
 },[t]);
 async function change(provider:string,version:string,granted:boolean) {
  if(busy)return;setBusy(true);setError('');
  try {const r=await fetch('/api/account/consent',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({provider,version,granted})});if(!r.ok)throw Error();setData(await r.json());}
  catch {setError(t('consent.error'));}finally{setBusy(false);}
 }
 return <section className="app-card-base p-4 space-y-3" aria-busy={busy}>
  <h2 className="text-lg font-semibold">{t('consent.title')}</h2>
  <p>{t('consent.explanation')}</p><Link href="/privacy" className="underline">{t('privacy.title')}</Link>
  {error && <p role="alert">{error}</p>}
  {data && providers.map(provider=>{
   const saved=data.consents.find(c=>c.provider===provider);
   const notice=data.notices.find(n=>n.provider===provider&&n.enabled);
   const current=!!saved?.granted;
   const effective=current && saved?.notice_version===notice?.version;
   return <div key={provider} className="border-t pt-3 space-y-2">
    <h3 className="font-semibold">{provider==='gemini'?'Google Gemini':'Groq'}</h3>
    <p className="whitespace-pre-wrap">{notice ? (locale==='sv'?notice.notice_sv:notice.notice_en) : t('consent.unavailable')}</p>
    {current && !effective && <p>{t('consent.changed')}</p>}
    <label className="flex gap-2 items-start"><input type="checkbox" checked={effective} disabled={busy||!notice}
      onChange={e=>change(provider,notice?.version??saved?.notice_version??'',e.target.checked)}/>{t('consent.allow')}</label>
    {current && <button type="button" className="app-secondary-button" disabled={busy} onClick={()=>change(provider,saved!.notice_version,false)}>{t('consent.withdraw')}</button>}
   </div>;
  })}
 </section>;
}
