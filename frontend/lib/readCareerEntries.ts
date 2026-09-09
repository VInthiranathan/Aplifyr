import type { SupabaseClient } from '@supabase/supabase-js';

/** Keyset pagination avoids silently truncating career facts at the Data API row limit. */
export async function readCareerEntries(client: SupabaseClient, owner: string, columns: string) {
  const rows: Record<string, any>[] = [];
  let cursor: string | undefined;
  let characters = 0;
  for (let page = 0; page < 100; page++) {
    let query = client.from('profile_career_entries').select(columns).eq('user_id', owner).order('id').limit(100);
    if (cursor) query = query.gt('id', cursor);
    const { data, error } = await query;
    if (error || !Array.isArray(data)) throw new Error('Career read unavailable');
    if (data.length === 0) return rows;
    const pageRows = data.map((row: unknown) => {
      if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error('Invalid career row');
      return row as Record<string, any>;
    });
    const next = pageRows[pageRows.length - 1].id;
    if (typeof next !== 'string' || (cursor && next <= cursor)) throw new Error('Invalid career cursor');
    characters += JSON.stringify(pageRows).length;
    if (characters > 8 * 1024 * 1024) throw new Error('Career read exceeds safe export size');
    rows.push(...pageRows);
    cursor = next;
    // Always ask for the next page, even if hosted max_rows is lower than 100.
  }
  throw new Error('Career read exceeds safe export limit');
}
