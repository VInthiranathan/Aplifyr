import type { GetServerSideProps } from 'next'
import { serverSideTranslations } from 'next-i18next/serverSideTranslations'
import { useTranslation } from 'next-i18next'
import { useState } from 'react'
import { ChevronDown, Mail, MessageSquare, FileQuestion } from 'lucide-react'

export const getServerSideProps: GetServerSideProps = async ({ locale }) => ({
  props: { ...(await serverSideTranslations(locale ?? 'en', ['common'])) },
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
        className="w-full flex items-center justify-between px-5 py-4 text-left bg-white dark:bg-[#1a1a1a] hover:bg-slate-50 dark:hover:bg-[#222] transition-colors"
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

export default function SupportPage() {
  const { t } = useTranslation('common')
  const [sent, setSent] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', message: '' })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setSent(true)
  }

  return (
    <div className="p-6 space-y-8 max-w-3xl">
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
            className="bg-white dark:bg-[#1a1a1a] rounded-2xl p-5 border border-slate-200 dark:border-white/5 shadow-sm dark:shadow-none flex flex-col gap-2"
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

      {/* Contact form */}
      <div className="bg-white dark:bg-[#1a1a1a] rounded-2xl p-6 border border-slate-200 dark:border-white/5 shadow-sm dark:shadow-none">
        <h2 className="text-lg font-semibold text-slate-800 dark:text-white mb-4">{t('support.formTitle')}</h2>
        {sent ? (
          <div className="text-center py-8 space-y-2">
            <p className="text-2xl">✅</p>
            <p className="font-medium text-slate-800 dark:text-white">{t('support.formSuccess')}</p>
            <p className="text-sm text-slate-500 dark:text-white/40">{t('support.formSuccessDesc')}</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-slate-500 dark:text-white/50">{t('support.formName')}</label>
                <input
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#111] text-slate-800 dark:text-white text-sm px-3 py-2 outline-none focus:ring-2 focus:ring-sky-500/50 transition"
                  placeholder={t('support.formNamePlaceholder')}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-slate-500 dark:text-white/50">{t('support.formEmail')}</label>
                <input
                  required
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#111] text-slate-800 dark:text-white text-sm px-3 py-2 outline-none focus:ring-2 focus:ring-sky-500/50 transition"
                  placeholder="namn@exempel.se"
                />
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-500 dark:text-white/50">{t('support.formMessage')}</label>
              <textarea
                required
                rows={4}
                value={form.message}
                onChange={(e) => setForm({ ...form, message: e.target.value })}
                className="rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#111] text-slate-800 dark:text-white text-sm px-3 py-2 outline-none focus:ring-2 focus:ring-sky-500/50 transition resize-none"
                placeholder={t('support.formMessagePlaceholder')}
              />
            </div>
            <button
              type="submit"
              className="px-6 py-2 rounded-lg bg-sky-500 hover:bg-sky-600 text-white text-sm font-semibold transition-colors"
            >
              {t('support.formSubmit')}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
