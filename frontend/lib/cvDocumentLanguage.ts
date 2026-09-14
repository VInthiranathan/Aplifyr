import en from '../public/locales/en/common.json';
import sv from '../public/locales/sv/common.json';
import type { CvContent } from '../types/api';

/** Document labels must not depend on the current UI locale or asynchronously loaded resources. */
export function cvDocumentT(content: Pick<CvContent, 'language'>, fallback: (key: string) => string) {
  const labels = content.language === 'en' ? en.cv : content.language === 'sv' ? sv.cv : null;
  return (key: string): string => {
    const value = labels && key.startsWith('cv.') ? labels[key.slice(3) as keyof typeof labels] : null;
    return typeof value === 'string' ? value : fallback(key);
  };
}
