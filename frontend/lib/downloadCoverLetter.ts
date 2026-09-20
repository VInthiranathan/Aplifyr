import { jsPDF } from 'jspdf';
import { cvFilename, loadPdfFont } from './downloadCv';

/** Local, selectable text PDF including edits in the open modal. */
export function buildCoverLetterPdf(letter: string, jobTitle: string, company: string, font: string): jsPDF {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  pdf.addFileToVFS('DejaVuSans.ttf', font);
  pdf.addFont('DejaVuSans.ttf', 'Letter', 'normal');
  pdf.setFont('Letter', 'normal');
  let y = 24;
  function write(value: string, size: number) {
    pdf.setFontSize(size);
    const clean = value.replace(/[\x00-\x08\x0b-\x1f\x7f]/g, ' ');
    for (const paragraph of clean.split(/\r?\n/)) {
      const lines: string[] = pdf.splitTextToSize(paragraph, 162);
      for (const line of lines.length ? lines : ['']) {
        if (y + 6 > 273) { pdf.addPage(); y = 24; }
        pdf.text(line, 24, y); y += 6;
      }
    }
    y += 5;
  }
  write(jobTitle, 14);
  if (company) write(company, 11);
  write(letter, 11);
  return pdf;
}
export async function downloadCoverLetter(letter: string, jobTitle: string, company: string, signal?: AbortSignal) {
  const font = await loadPdfFont(signal);
  if (signal?.aborted) return;
  const pdf = buildCoverLetterPdf(letter, jobTitle, company, font);
  if (!signal?.aborted) pdf.save(`Letter_${cvFilename(jobTitle, company, 1)}`);
}
