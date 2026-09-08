import type { NextApiRequest, NextApiResponse } from 'next';
import { createServerClient, parseCookieHeader, serializeCookieHeader } from '@supabase/auth-helpers-nextjs';

export function serverSupabase(req: NextApiRequest, res: NextApiResponse) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Authentication unavailable');
  return createServerClient(url, key, { cookies: {
    getAll: () => parseCookieHeader(req.headers.cookie ?? '').map(c => ({ name: c.name, value: c.value ?? '' })),
    setAll(cookies) {
      const existing = res.getHeader('Set-Cookie');
      res.setHeader('Set-Cookie', [
        ...(typeof existing === 'string' ? [existing] : Array.isArray(existing) ? existing : []),
        ...cookies.map(({ name, value, options }) => serializeCookieHeader(name, value, options)),
      ]);
    },
  } });
}
