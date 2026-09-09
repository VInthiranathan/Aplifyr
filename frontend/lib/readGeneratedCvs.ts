import type { SupabaseClient } from '@supabase/supabase-js';
export async function readGeneratedCvs(client: SupabaseClient, owner: string) {
  const rows: Record<string, unknown>[] = [];
  let cursor = '';
  for (let page = 0; page <= 100; page++) {
    let query = client.from('generated_cvs').select('job_id,content,job_context,metadata,created_at,updated_at').eq('user_id', owner).order('job_id').limit(25);
    if (cursor) query = query.gt('job_id', cursor);
    const { data, error } = await query;
    if (error || !Array.isArray(data)) throw new Error('CV export unavailable');
    if (!data.length) return rows;
    const next = data[data.length - 1].job_id;
    if (typeof next !== 'string' || (cursor && next <= cursor)) throw new Error('Invalid CV cursor');
    rows.push(...data);
    if (rows.length > 100 || JSON.stringify(rows).length > 8 * 1024 * 1024) throw new Error('CV export too large');
    cursor = next;
  }
  throw new Error('CV export limit exceeded');
}
