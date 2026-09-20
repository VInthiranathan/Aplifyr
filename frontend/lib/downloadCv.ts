import { jsPDF } from 'jspdf';
import { cvDocumentT } from './cvDocumentLanguage';
import { cvTemplate, type CvTemplateId } from './cvTemplates';
import type { CvContent, CvEntry } from '../types/api';

export function cvFilename(name: string, company: string, sequence: number): string {
  const part = (value: string, fallback: string) => value.normalize('NFC').replace(/[^\p{L}\p{N}-]+/gu, '_').replace(/^_+|_+$/g, '').slice(0, 70) || fallback;
  return `${part(name, 'CV')}_${part(company, 'company')}_${Number.isSafeInteger(sequence) && sequence > 0 ? sequence : 1}.pdf`;
}

/** Text-based PDF; no HTML interpretation, tracking images, or external rendering service. */
export function buildCvPdf(content: CvContent, font: string, t: (key: string) => string, template: CvTemplateId = 'elegant'): jsPDF {
  t = cvDocumentT(content, t);
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  pdf.addFileToVFS('DejaVuSans.ttf', font);
  pdf.addFont('DejaVuSans.ttf', 'CV', 'normal');
  pdf.setFont('CV', 'normal');
  const style = cvTemplate(template);
  const margin = style.margin, bottom = 297 - margin, width = 210 - margin * 2;
  let y = margin + 3;
  function room(height: number) { if (y + height > bottom) { pdf.addPage(); y = margin + 3; } }
  function text(value: string, size: number = style.bodySize, indent = 0, align: 'left' | 'center' = 'left') {
    // Render plain text and normalize control characters; all wrapping uses embedded font metrics.
    const clean = value.replace(/[\x00-\x08\x0b-\x1f\x7f]/g, ' ').trim();
    if (!clean) return;
    pdf.setFontSize(size);
    const lines: string[] = pdf.splitTextToSize(clean, width - indent * 2);
    const lineHeight = size * style.lineHeight;
    for (const line of lines) {
      room(lineHeight);
      pdf.text(line, align === 'center' ? 105 : margin + indent, y, align === 'center' ? { align: 'center' } : undefined);
      y += lineHeight;
    }
    y += style.gap;
  }
  function heading(label: string) {
    room(24); y += style.sectionGap;
    pdf.setTextColor(style.accent); text(label, style.headingSize); pdf.setTextColor('#111827');
    if (style.rule) { pdf.setDrawColor(style.accent); pdf.setLineWidth(0.2); pdf.line(margin, y - 1, 210 - margin, y - 1); y += 2; }
  }
  function entries(label: string, rows: CvEntry[]) {
    if (!rows.length) return;
    heading(label);
    for (const row of rows) {
      room(26); text(row.title, 11); text(row.organization);
      if (row.qualification) text(row.qualification);
      text(`${row.startMonth} - ${row.isCurrent ? t('cv.present') : row.endMonth}`, 9);
      for (const bullet of row.bullets) text(`• ${bullet.text}`, style.bodySize, 3);
      y += 3;
    }
  }
  if (style.header === 'panel') {
    pdf.setFillColor(style.accent); pdf.rect(0, 0, 210, 4, 'F');
    pdf.setFillColor(style.headerBackground ?? '#f3f1f1'); pdf.rect(margin, 10, width, 32, 'F');
    y = 20;
  } else if (style.header === 'band') {
    pdf.setFillColor(style.accent); pdf.rect(0, 0, 210, 40, 'F');
    y = 15;
  } else if (style.header === 'dots') {
    [style.accent, style.secondaryAccent, '#9a9a70'].forEach((color, index) => {
      pdf.setFillColor(color); pdf.circle(margin + index * 5, y - 2, 1.8, 'F');
    });
    y += 7;
  }
  const headerAlign = style.headerAlign;
  pdf.setTextColor(style.header === 'band' ? '#ffffff' : style.accent); text(content.name, style.nameSize, 0, headerAlign);
  pdf.setTextColor(style.header === 'band' ? '#ffffff' : '#111827'); text(content.title, 12, 0, headerAlign); text(content.location, 10, 0, headerAlign);
  pdf.setTextColor('#111827');
  if (style.header === 'band' && y < 46) y = 46;
  if (style.header === 'panel' && y < 48) y = 48;
  if (content.professionalSummary.length) { heading(t('cv.summary')); content.professionalSummary.forEach(f => text(f.text)); }
  if (content.skills.length) { heading(t('cv.skills')); text(content.skills.join(' · ')); }
  entries(t('cv.experience'), content.experience); entries(t('cv.education'), content.education);
  if (style.header === 'panel') { pdf.setFillColor(style.accent); pdf.rect(0, 293, 210, 4, 'F'); }
  return pdf;
}

export async function downloadCv(content: CvContent, company: string, sequence: number, t: (key: string) => string, signal?: AbortSignal, template: CvTemplateId = 'elegant') {
  const response = await fetch('/fonts/DejaVuSans.ttf', { signal });
  if (!response.ok) throw new Error('Font unavailable');
  const bytes = new Uint8Array(await response.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  const pdf = buildCvPdf(content, btoa(binary), t, template);
  if (signal?.aborted) return;
  pdf.save(cvFilename(content.name, company, sequence));
}
