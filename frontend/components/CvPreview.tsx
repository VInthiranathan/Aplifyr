import { useTranslation } from 'next-i18next';
import { cvDocumentT } from '../lib/cvDocumentLanguage';
import { cvTemplate, type CvTemplateId } from '../lib/cvTemplates';
import type { CvContent, CvEntry } from '../types/api';

/** Plain, single-column semantic content; export and templates consume the same JSON. */
export default function CvPreview({ content, template = 'elegant' }: { content: CvContent; template?: CvTemplateId }) {
  const { t: uiT } = useTranslation('common');
  const t = cvDocumentT(content, uiT);
  const style = cvTemplate(template);
  const headingStyle = {
    color: style.accent,
    fontSize: `${style.headingSize}pt`,
    borderBottom: style.rule ? `1px solid ${style.accent}` : undefined,
    paddingBottom: '4px',
    letterSpacing: style.uppercaseHeadings ? '0.12em' : undefined,
    textTransform: style.uppercaseHeadings ? 'uppercase' as const : undefined,
  };
  const sectionStyle = { marginTop: `${style.sectionGap * 3}px` };
  function entries(title: string, rows: CvEntry[]) {
    if (!rows.length) return null;
    return <section style={sectionStyle} className={template === 'nordic' ? 'space-y-3' : 'space-y-5'}><h2 style={headingStyle} className="font-semibold">{title}</h2>
      {rows.map(entry => <section key={entry.sourceId} className="space-y-2 break-inside-avoid">
        <h3 className="font-semibold">{entry.title}</h3><p>{entry.organization}</p>
        {entry.qualification && <p>{entry.qualification}</p>}
        <p className="text-sm text-gray-600">{entry.startMonth} – {entry.isCurrent ? t('cv.present') : entry.endMonth}</p>
        {!!entry.bullets.length && <ul className="list-disc pl-5 space-y-1">{entry.bullets.map(f => <li key={`${f.sourceFactId}:${f.text}`}>{f.text}</li>)}</ul>}
      </section>)}
    </section>;
  }
  const isBand = style.header === 'band';
  const contact = content.contact;
  const contactItems = [
    contact?.email ? { value: contact.email, href: `mailto:${contact.email}` } : null,
    contact?.phone ? { value: contact.phone, href: `tel:${contact.phone.replace(/[^0-9+]/g, '')}` } : null,
    contact?.website ? { value: contact.website, href: contact.website } : null,
    contact?.linkedin ? { value: contact.linkedin, href: contact.linkedin } : null,
  ].filter((item): item is { value: string; href: string } => item !== null);
  return <article lang={content.language} aria-label={t('cv.preview')} data-template={template} style={{ fontSize: `${style.bodySize}pt`, lineHeight: style.lineHeight / 0.3528 }} className="relative mx-auto min-h-[70vh] w-full max-w-[210mm] overflow-hidden break-words rounded-xl border border-gray-200 bg-white text-gray-900 shadow-sm [overflow-wrap:anywhere] sm:rounded-none">
    {style.header === 'panel' ? <div aria-hidden="true" className="h-3" style={{ backgroundColor: style.accent }} /> : null}
    <header
      className={`space-y-2 ${style.headerAlign === 'center' ? 'text-center' : ''}`}
      style={{ backgroundColor: style.headerBackground ?? undefined, color: isBand ? '#ffffff' : undefined, padding: `clamp(20px, 5vw, ${style.margin}mm)` }}
    >
      {style.header === 'dots' ? <div className="flex gap-2" aria-hidden="true">
        {[style.accent, style.secondaryAccent, '#9a9a70'].map(color => <span key={color} className="h-4 w-4 rounded-full" style={{ backgroundColor: color }} />)}
      </div> : null}
      <h1 className="font-bold uppercase tracking-[0.08em]" style={{ color: isBand ? '#ffffff' : style.accent, fontSize: `${style.nameSize}pt` }}>{content.name}</h1>
      <p className={`text-lg ${isBand ? 'text-white/90' : ''}`}>{content.title}</p><p className={isBand ? 'text-white/75' : ''}>{content.location}</p>
      {!!contactItems.length && <address className={`flex flex-wrap justify-start gap-x-3 gap-y-1 text-sm not-italic ${style.headerAlign === 'center' ? 'justify-center' : ''} ${isBand ? 'text-white/80' : 'text-gray-600'}`}>
        {contactItems.map(item => <a key={item.href} className="break-all underline-offset-2 hover:underline" href={item.href} target={item.href.startsWith('https://') ? '_blank' : undefined} rel={item.href.startsWith('https://') ? 'noopener noreferrer' : undefined}>{item.value}</a>)}
      </address>}
    </header>
    <div style={{ padding: `0 clamp(20px, 5vw, ${style.margin}mm) clamp(20px, 5vw, ${style.margin}mm)` }}>
      {!!content.professionalSummary.length && <section style={sectionStyle} className="space-y-2"><h2 style={headingStyle} className="font-semibold">{t('cv.summary')}</h2>{content.professionalSummary.map(f => <p key={`${f.sourceFactId}:${f.text}`}>{f.text}</p>)}</section>}
      {!!content.skills.length && <section style={sectionStyle} className="space-y-2"><h2 style={headingStyle} className="font-semibold">{t('cv.skills')}</h2><p>{content.skills.join(' · ')}</p></section>}
      {entries(t('cv.experience'), content.experience)}{entries(t('cv.education'), content.education)}
    </div>
    {style.header === 'panel' ? <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-2" style={{ backgroundColor: style.accent }} /> : null}
  </article>;
}
