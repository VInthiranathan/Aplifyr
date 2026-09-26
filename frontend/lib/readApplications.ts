import type { SupabaseClient } from '@supabase/supabase-js';
import type { ApplicationStatus, JobApplication } from '../types/api';

export const APPLICATION_COLUMNS = 'job_id,job_context,status,applied_at,next_step,next_step_at,notes,created_at,updated_at';
type StatusRow = { job_id: string; status: ApplicationStatus };

/** Immutable job-id cursor; a short page is not proof that the server has no more rows. */
async function readRows<T extends StatusRow>(client: SupabaseClient, owner: string, columns: string): Promise<T[]> {
  const rows: T[] = [];
  let cursor = '';
  let bytes = 0;
  for (let page = 0; page < 1001; page++) {
    let query = client.from('job_applications').select(columns).eq('user_id', owner).order('job_id').limit(100);
    if (cursor) query = query.gt('job_id', cursor);
    const { data, error } = await query;
    if (error || !Array.isArray(data)) throw new Error('Applications unavailable');
    if (!data.length) return rows;
    const pageRows = data as unknown as T[];
    // Do not compare strings using JS collation: PostgreSQL defines the cursor ordering.
    const next = pageRows[pageRows.length - 1].job_id;
    if (typeof next !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(next) || next === cursor)
      throw new Error('Invalid application cursor');
    bytes += new TextEncoder().encode(JSON.stringify(pageRows)).length;
    if (rows.length + pageRows.length > 10000 || bytes > 16 * 1024 * 1024)
      throw new Error('Applications exceed safe export size');
    rows.push(...pageRows);
    cursor = next;
  }
  throw new Error('Applications exceed safe export pages');
}

export const readApplicationStatuses = (client: SupabaseClient, owner: string) =>
  readRows<StatusRow>(client, owner, 'job_id,status');

export async function readApplications(client: SupabaseClient, owner: string): Promise<JobApplication[]> {
  const rows = await readRows<JobApplication>(client, owner, APPLICATION_COLUMNS);
  return rows.sort((a, b) => b.updated_at.localeCompare(a.updated_at) || a.job_id.localeCompare(b.job_id));
}
