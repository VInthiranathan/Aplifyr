import sanitizeHtml from 'sanitize-html';

/** Sanitize after decoding/formatting, immediately before each HTML sink. */
export function safeHtml(value: unknown): string {
  if (typeof value !== 'string') return '';
  return sanitizeHtml(value, {
    allowedTags: ['p', 'br', 'div', 'span', 'strong', 'b', 'em', 'i', 'u', 'ul', 'ol', 'li', 'h2', 'h3', 'h4', 'blockquote', 'a'],
    allowedAttributes: { a: ['href', 'title'] },
    allowedSchemes: ['https', 'http', 'mailto'],
    allowProtocolRelative: false,
    disallowedTagsMode: 'discard',
  });
}

export function safeExternalUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : undefined;
  } catch { return undefined; }
}
