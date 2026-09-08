import type { GetServerSideProps } from 'next'
import { serverSideTranslations } from 'next-i18next/serverSideTranslations'
import { useTranslation } from 'next-i18next'
import { useState } from 'react'
import { ChevronDown, Mail, MessageSquare, FileQuestion } from 'lucide-react'

export const getServerSideProps: GetServerSideProps = async ({ locale }) => ({
  props: { contact: /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(process.env.PRIVACY_CONTACT_EMAIL??'') ? process.env.PRIVACY_CONTACT_EMAIL : null,
    ...(await serverSideTranslations(locale ?? 'en', ['common'])) },
})

const faqs = [
  { q: 'support.faq1q', a: 'support.faq1a' },
  { q: 'support.faq2q', a: 'support.faq2a' },
  { q: 'support.faq3q', a: 'support.faq3a' },
  { q: 'support.faq4q', a: 'support.faq4a' },
]

function FaqItem({ q, a }: { q: string; a: string }) {
  const { t } = useTranslation('common')
  const [open, setOpen] = useState(false)

  return (
    <div className="border border-slate-200 dark:border-white/10 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="app-hover-standard w-full flex items-center justify-between px-5 py-4 text-left bg-white dark:bg-[#1a1a1a]"
      >
        <span className="font-medium text-slate-800 dark:text-white">{t(q)}</span>
        <ChevronDown
          className={`w-4 h-4 text-slate-400 dark:text-white/40 transition-transform duration-200 flex-shrink-0 ml-4 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div className="px-5 py-4 bg-slate-50 dark:bg-[#141414] text-slate-600 dark:text-white/60 text-sm leading-relaxed border-t border-slate-200 dark:border-white/10">
          {t(a)}
        </div>
      )}
    </div>
  )
}

export default function SupportPage({contact}:{contact:string|null}) {
  const { t } = useTranslation('common')

  return (
    <div className="app-page-shell max-w-3xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{t('support.title')}</h1>
        <p className="mt-1 text-slate-500 dark:text-white/50 text-sm">{t('support.subtitle')}</p>
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { icon: FileQuestion, label: 'support.cardFaq',     desc: 'support.cardFaqDesc' },
          { icon: MessageSquare, label: 'support.cardContact', desc: 'support.cardContactDesc' },
          { icon: Mail,          label: 'support.cardEmail',   desc: 'support.cardEmailDesc' },
        ].map(({ icon: Icon, label, desc }) => (
          <div
            key={label}
            className="app-card-base app-card-hover rounded-2xl p-5 flex flex-col gap-2"
          >
            <div className="w-9 h-9 rounded-xl bg-sky-500/10 flex items-center justify-center">
              <Icon className="w-5 h-5 text-sky-500" />
            </div>
            <p className="font-semibold text-slate-800 dark:text-white text-sm">{t(label)}</p>
            <p className="text-slate-500 dark:text-white/40 text-xs leading-relaxed">{t(desc)}</p>
          </div>
        ))}
      </div>

      {/* FAQ */}
      <div>
        <h2 className="text-lg font-semibold text-slate-800 dark:text-white mb-3">{t('support.faqTitle')}</h2>
        <div className="space-y-2">
          {faqs.map((f) => (
            <FaqItem key={f.q} q={f.q} a={f.a} />
          ))}
        </div>
      </div>

      <div className="app-card-base p-4 space-y-2">
        <h2 className="text-lg font-semibold">{t('support.formTitle')}</h2>
        {contact ? <><p>{t('consent.emailNote')}</p><a className="underline" href={`mailto:${encodeURIComponent(contact)}`}>{t('consent.email')}: {contact}</a></> : <p role="status">{t('privacy.contactPending')}</p>}
      </div>
    </div>
  )
}
