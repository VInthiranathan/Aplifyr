import type { NextApiRequest, NextApiResponse } from 'next';
import { readCareerEntries } from '../../lib/readCareerEntries';
import { createServerClient, parseCookieHeader, serializeCookieHeader } from '@supabase/auth-helpers-nextjs';
import { CareerValidationError, isCareerId, validateCareerEntry } from '../../lib/careerValidation';

const columns = 'id,kind,title,organization,location,qualification,start_month,end_month,is_current,description,achievements,learned,skills,strengths,updated_at';
export const config = { api: { bodyParser: { sizeLimit: '64kb' } } };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (!['GET', 'POST', 'PUT', 'DELETE'].includes(req.method ?? '')) {
    res.setHeader('Allow', 'GET, POST, PUT, DELETE');
    return res.status(405).json({ code: 'methodNotAllowed' });
  }
  // Mutations require JSON and reject cross-site browser requests.
  if (req.method !== 'GET' && (req.headers['sec-fetch-site'] === 'cross-site' ||
      !req.headers['content-type']?.startsWith('application/json'))) {
    return res.status(403).json({ code: 'forbidden' });
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return res.status(503).json({ code: 'unavailable' });
  try {
    const supabase = createServerClient(url, key, { cookies: {
      getAll: () => parseCookieHeader(req.headers.cookie ?? '').map(c => ({ name: c.name, value: c.value ?? '' })),
      setAll(cookies) {
        const existing = res.getHeader('Set-Cookie');
        res.setHeader('Set-Cookie', [
          ...(typeof existing === 'string' ? [existing] : Array.isArray(existing) ? existing : []),
          ...cookies.map(({ name, value, options }) => serializeCookieHeader(name, value, options)),
        ]);
      },
    } });
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return res.status(401).json({ code: 'unauthenticated' });
    const table = () => supabase.from('profile_career_entries');
    if (req.method === 'GET') {
      try {
        const entries = await readCareerEntries(supabase, user.id, columns);
        entries.sort((a, b) => Number(b.is_current) - Number(a.is_current) || b.start_month.localeCompare(a.start_month) || a.id.localeCompare(b.id));
        return res.status(200).json({ entries });
      } catch { return res.status(503).json({ code: 'loadError' }); }
    }
    const body = req.body;
    if (req.method === 'POST') {
      const entry = validateCareerEntry(body);
      const { data, error } = await table().insert({ ...entry, user_id: user.id }).select(columns).single();
      if (error) return res.status(503).json({ code: 'saveError' });
      return res.status(201).json({ entry: data });
    }
    if (!isCareerId(body?.id)) return res.status(400).json({ field: 'id', code: 'invalid' });
    // Optimistic concurrency prevents one browser tab from overwriting another's changes.
    if (typeof body.updated_at !== 'string' || !Number.isFinite(Date.parse(body.updated_at))) {
      return res.status(400).json({ field: 'updated_at', code: 'invalid' });
    }
    const query = req.method === 'PUT' ? table().update(validateCareerEntry(body)) : table().delete();
    const { data, error } = await query.eq('id', body.id).eq('user_id', user.id)
      .eq('updated_at', body.updated_at).select(columns).maybeSingle();
    if (error) return res.status(503).json({ code: 'saveError' });
    if (!data) return res.status(409).json({ code: 'conflict' });
    return res.status(200).json(req.method === 'DELETE' ? { id: data.id } : { entry: data });
  } catch (error) {
    if (error instanceof CareerValidationError) return res.status(400).json({ field: error.field, code: error.code });
    return res.status(500).json({ code: 'saveError' });
  }
}
