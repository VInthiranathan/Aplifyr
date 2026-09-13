import { jsPDF } from 'jspdf';
import type { CvContent, CvEntry } from '../types/api';

export function cvFilename(name: string, company: string, sequence: number): string {
  const part = (value: string, fallback: string) => value.normalize('NFC').replace(/[^\p{L}\p{N}-]+/gu, '_').replace(/^_+|_+$/g, '').slice(0, 70) || fallback;
  return `${part(name, 'CV')}_${part(company, 'company')}_${Number.isSafeInteger(sequence) && sequence > 0 ? sequence : 1}.pdf`;
}

/** Text-based PDF; no HTML interpretation, tracking images, or external rendering service. */
export function buildCvPdf(content: CvContent, font: string, t: (key: string) => string): jsPDF {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  pdf.addFileToVFS('DejaVuSans.ttf', font);
  pdf.addFont('DejaVuSans.ttf', 'CV', 'normal');
  pdf.setFont('CV', 'normal');
  let y = 22;
  const margin = 20, bottom = 275, width = 170;
  function room(height: number) { if (y + height > bottom) { pdf.addPage(); y = 22; } }
  function text(value: string, size = 10, indent = 0) {
    // Render plain text and normalize control characters; all wrapping uses embedded font metrics.
    const clean = value.replace(/[\x00-\x08\x0b-\x1f\x7f]/g, ' ').trim();
    if (!clean) return;
    pdf.setFontSize(size);
    const lines: string[] = pdf.splitTextToSize(clean, width - indent);
    const lineHeight = size * 0.48;
    for (const line of lines) { room(lineHeight); pdf.text(line, margin + indent, y); y += lineHeight; }
    y += 2;
  }
  function heading(label: string) { room(20); y += 4; text(label, 13); }
  function entries(label: string, rows: CvEntry[]) {
    if (!rows.length) return;
    heading(label);
    for (const row of rows) {
      room(26); text(row.title, 11); text(row.organization);
      if (row.qualification) text(row.qualification);
      text(`${row.startMonth} - ${row.isCurrent ? t('cv.present') : row.endMonth}`, 9);
      for (const bullet of row.bullets) text(`• ${bullet.text}`, 10, 3);
      y += 3;
    }
  }
  text(content.name, 22); text(content.title, 12); text(content.location, 10);
  if (content.professionalSummary.length) { heading(t('cv.summary')); content.professionalSummary.forEach(f => text(f.text)); }
  if (content.skills.length) { heading(t('cv.skills')); text(content.skills.join(' · ')); }
  entries(t('cv.experience'), content.experience); entries(t('cv.education'), content.education);
  return pdf;
}

export async function downloadCv(content: CvContent, company: string, sequence: number, t: (key: string) => string, signal?: AbortSignal) {
  const response = await fetch('/fonts/DejaVuSans.ttf', { signal });
  if (!response.ok) throw new Error('Font unavailable');
  const bytes = new Uint8Array(await response.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  const pdf = buildCvPdf(content, btoa(binary), t);
  if (signal?.aborted) return;
  pdf.save(cvFilename(content.name, company, sequence));
}
