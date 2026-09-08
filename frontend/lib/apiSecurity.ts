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
  return true;
}
