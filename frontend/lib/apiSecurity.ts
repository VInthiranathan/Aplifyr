import type { NextApiRequest } from 'next';

/** JSON is not a CORS-safelisted media type. Cross-origin preflights are not allowed. */
export function isSafeMutation(req: NextApiRequest): boolean {
  const site = req.headers['sec-fetch-site'];
  return (site === undefined || site === 'same-origin' || site === 'none') &&
    req.headers['content-type']?.split(';')[0].trim().toLowerCase() === 'application/json';
}

export function validProfile(body: unknown): body is Record<string, unknown> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return false;
  const value = body as Record<string, unknown>;
  for (const [key, max] of Object.entries({ name: 200, title: 200, location: 200, bio: 5000 })) {
    if (value[key] != null && (typeof value[key] !== 'string' || (value[key] as string).length > max)) return false;
  }
  for (const key of ['tags', 'roles', 'locationPreferences']) {
    const list = value[key];
    if (list != null && (!Array.isArray(list) || list.length > 50 ||
      list.some(item => typeof item !== 'string' || item.length > 100))) return false;
  }
  for (const [key, max] of Object.entries({ contactEmail: 254, phone: 32, websiteUrl: 2048, linkedinUrl: 2048 })) {
    const item = value[key];
    if (item != null && (typeof item !== 'string' || item.length > max || /[\u0000-\u001f\u007f]/.test(item))) return false;
  }
  const email = typeof value.contactEmail === 'string' ? value.contactEmail.trim() : '';
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return false;
  const phone = typeof value.phone === 'string' ? value.phone.trim() : '';
  if (phone && (phone.length < 3 || !/^[0-9+(). /-]+$/.test(phone))) return false;
  for (const key of ['websiteUrl', 'linkedinUrl']) {
    const raw = typeof value[key] === 'string' ? value[key].trim() : '';
    if (!raw) continue;
    try {
      const url = new URL(raw);
      if (url.protocol !== 'https:' || url.username || url.password) return false;
      if (key === 'linkedinUrl' && (!/(^|\.)linkedin\.com$/i.test(url.hostname) || url.pathname === '/')) return false;
    } catch { return false; }
  }
  return true;
}
