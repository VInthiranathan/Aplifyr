import { useTranslation } from 'next-i18next';
import { cvDocumentT } from '../lib/cvDocumentLanguage';
import { cvTemplate, type CvTemplateId } from '../lib/cvTemplates';
import type { CvContent, CvEntry } from '../types/api';

/** Plain, single-column semantic content; export and future templates consume the same JSON. */
export default function CvPreview({ content, template = 'classic' }: { content: CvContent; template?: CvTemplateId }) {
  const { t: uiT } = useTranslation('common');
  const t = cvDocumentT(content, uiT);
  const style = cvTemplate(template);
  const headingStyle = { color: style.accent, fontSize: `${style.headingSize}pt`, borderBottom: style.rule ? `1px solid ${style.accent}` : undefined, paddingBottom: '4px' };
  const sectionStyle = { marginTop: `${style.sectionGap * 3}px` };
  function entries(title: string, rows: CvEntry[]) {
    if (!rows.length) return null;
    return <section style={sectionStyle} className={template === 'compact' ? 'space-y-3' : 'space-y-5'}><h2 style={headingStyle} className="font-semibold">{title}</h2>
      {rows.map(entry => <section key={entry.sourceId} className="space-y-2 break-inside-avoid">
        <h3 className="font-semibold">{entry.title}</h3><p>{entry.organization}</p>
        {entry.qualification && <p>{entry.qualification}</p>}
        <p className="text-sm text-gray-600">{entry.startMonth} – {entry.isCurrent ? t('cv.present') : entry.endMonth}</p>
        {!!entry.bullets.length && <ul className="list-disc pl-5 space-y-1">{entry.bullets.map(f => <li key={`${f.sourceFactId}:${f.text}`}>{f.text}</li>)}</ul>}
      </section>)}
    </section>;
  }
  return <article lang={content.language} aria-label={t('cv.preview')} data-template={template} style={{ fontSize: `${style.bodySize}pt`, lineHeight: style.lineHeight / 0.3528, padding: `clamp(20px, 5vw, ${style.margin}mm)` }} className="mx-auto max-w-[210mm] min-h-[70vh] bg-white text-gray-900 shadow-sm border border-gray-200 break-words">
    <header className="space-y-2" style={{ borderTop: template === 'modern' ? `4px solid ${style.accent}` : undefined, paddingTop: template === 'modern' ? '16px' : undefined }}><h1 className="font-bold" style={{ color: style.accent, fontSize: `${style.nameSize}pt` }}>{content.name}</h1><p className="text-lg">{content.title}</p><p>{content.location}</p></header>
    {!!content.professionalSummary.length && <section style={sectionStyle} className="space-y-2"><h2 style={headingStyle} className="font-semibold">{t('cv.summary')}</h2>{content.professionalSummary.map(f => <p key={`${f.sourceFactId}:${f.text}`}>{f.text}</p>)}</section>}
    {!!content.skills.length && <section style={sectionStyle} className="space-y-2"><h2 style={headingStyle} className="font-semibold">{t('cv.skills')}</h2><p>{content.skills.join(' · ')}</p></section>}
    {entries(t('cv.experience'), content.experience)}{entries(t('cv.education'), content.education)}
  </article>;
}
