export const cvTemplateIds = ['classic', 'modern', 'compact'] as const;
export type CvTemplateId = typeof cvTemplateIds[number];
/** Shared presentation only: no content changes, columns, images or reordered sections. */
export const cvTemplates = {
  classic: { accent: '#111827', nameSize: 22, headingSize: 13, bodySize: 10.5, margin: 20, gap: 2, sectionGap: 5, lineHeight: 0.50, rule: true },
  modern: { accent: '#164e63', nameSize: 26, headingSize: 13, bodySize: 10.5, margin: 20, gap: 2.5, sectionGap: 6, lineHeight: 0.51, rule: true },
  compact: { accent: '#111827', nameSize: 20, headingSize: 12, bodySize: 10, margin: 17, gap: 1.5, sectionGap: 3, lineHeight: 0.48, rule: false },
} as const;
export function cvTemplate(id: string) { return cvTemplates[id as CvTemplateId] ?? cvTemplates.classic; }
