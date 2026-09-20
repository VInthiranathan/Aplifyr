export const cvTemplateIds = ['elegant', 'nordic', 'professional', 'accent'] as const;
export type CvTemplateId = typeof cvTemplateIds[number];

export type CvTemplateStyle = {
  accent: string;
  secondaryAccent: string;
  headerBackground: string | null;
  header: 'panel' | 'band' | 'minimal' | 'dots';
  headerAlign: 'left' | 'center';
  nameSize: number;
  headingSize: number;
  bodySize: number;
  margin: number;
  gap: number;
  sectionGap: number;
  lineHeight: number;
  rule: boolean;
  uppercaseHeadings: boolean;
};

/** Shared presentation only: no content changes, columns, images or reordered sections. */
export const cvTemplates = {
  elegant: {
    accent: '#8a1538', secondaryAccent: '#f3f1f1', headerBackground: '#f3f1f1', header: 'panel', headerAlign: 'left',
    nameSize: 25, headingSize: 13, bodySize: 10.5, margin: 18, gap: 2.2, sectionGap: 5, lineHeight: 0.50, rule: true, uppercaseHeadings: true,
  },
  nordic: {
    accent: '#334155', secondaryAccent: '#e2e8f0', headerBackground: '#334155', header: 'band', headerAlign: 'center',
    nameSize: 22, headingSize: 12.5, bodySize: 10, margin: 17, gap: 1.8, sectionGap: 4, lineHeight: 0.49, rule: true, uppercaseHeadings: true,
  },
  professional: {
    accent: '#111827', secondaryAccent: '#e5e7eb', headerBackground: null, header: 'minimal', headerAlign: 'left',
    nameSize: 23, headingSize: 12.5, bodySize: 10.5, margin: 19, gap: 2, sectionGap: 4.5, lineHeight: 0.50, rule: true, uppercaseHeadings: true,
  },
  accent: {
    accent: '#255c6e', secondaryAccent: '#d97757', headerBackground: null, header: 'dots', headerAlign: 'left',
    nameSize: 22, headingSize: 12.5, bodySize: 10.5, margin: 20, gap: 2.2, sectionGap: 5, lineHeight: 0.51, rule: false, uppercaseHeadings: true,
  },
} satisfies Record<CvTemplateId, CvTemplateStyle>;

export function cvTemplate(id: string): CvTemplateStyle {
  return cvTemplates[id as CvTemplateId] ?? cvTemplates.elegant;
}
