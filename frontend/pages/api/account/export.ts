import type { NextApiRequest, NextApiResponse } from 'next';
import { serverSupabase } from '../../../lib/serverSupabase';
import { readCareerEntries } from '../../../lib/readCareerEntries';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); res.status(405).json({ error: 'Method not allowed' }); return; }
  try {
    const supabase = serverSupabase(req, res);
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) { res.status(401).json({ error: 'Not authenticated' }); return; }
    const { data: profile, error: profileError } = await supabase.from('profiles')
      .select('id,full_name,title,location,bio,tech_stack,roles,location_preferences,created_at,updated_at').eq('id', user.id).maybeSingle();
    if (profileError) throw new Error('Profile unavailable');
    const career = await readCareerEntries(supabase, user.id,
      'id,kind,title,organization,location,qualification,start_month,end_month,is_current,description,achievements,learned,skills,strengths,created_at,updated_at');
    res.status(200).json({ exportedAt: new Date().toISOString(), account: { id: user.id, email: user.email, createdAt: user.created_at }, profile, career });
  } catch { res.status(503).json({ error: 'Export temporarily unavailable' }); }
}
