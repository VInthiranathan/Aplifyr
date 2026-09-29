import type { NextApiRequest, NextApiResponse } from 'next';
import { readCareerEntries } from '../../lib/readCareerEntries';
import { serverSupabase } from '../../lib/serverSupabase';
import { isSafeMutation } from '../../lib/apiSecurity';
import { CareerValidationError, isCareerId, validateCareerEntry } from '../../lib/careerValidation';

const columns = 'id,kind,title,organization,location,qualification,start_month,end_month,is_current,description,achievements,learned,skills,strengths,updated_at';
export const config = { api: { bodyParser: { sizeLimit: '64kb' } } };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (!['GET', 'POST', 'PUT', 'DELETE'].includes(req.method ?? '')) {
    res.setHeader('Allow', 'GET, POST, PUT, DELETE');
    return res.status(405).json({ code: 'methodNotAllowed' });
  }
  if (req.method !== 'GET' && !isSafeMutation(req)) return res.status(403).json({ code: 'forbidden' });
  try {
    const supabase = serverSupabase(req, res);
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
    return res.status(503).json({ code: 'saveError' });
  }
}
