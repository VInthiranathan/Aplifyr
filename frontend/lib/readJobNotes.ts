import type { SupabaseClient } from "@supabase/supabase-js";
export interface JobNote {
  job_id: string;
  notes: string;
  updated_at: string;
}
export async function readJobNotes(
  client: SupabaseClient,
  owner: string,
  summaries = false,
): Promise<JobNote[]> {
  const rows: JobNote[] = [];
  let cursor = "";
  let bytes = 0;
  for (let page = 0; page < 1001; page++) {
    let query = client
      .from("job_notes")
      .select(summaries ? "job_id,updated_at" : "job_id,notes,updated_at")
      .eq("user_id", owner)
      .order("job_id")
      .limit(100);
    if (cursor) query = query.gt("job_id", cursor);
    const { data, error } = await query;
    if (error || !Array.isArray(data)) throw new Error("Notes unavailable");
    if (!data.length) return rows;
    const pageRows = data as unknown as JobNote[];
    const next = pageRows[pageRows.length - 1].job_id;
    bytes += new TextEncoder().encode(JSON.stringify(data)).length;
    if (
      typeof next !== "string" ||
      !/^[A-Za-z0-9_-]{1,100}$/.test(next) ||
      next === cursor ||
      rows.length + data.length > 1000 ||
      bytes > 16 * 1024 * 1024
    )
      throw new Error("Notes exceed bounds");
    rows.push(...(data as unknown as JobNote[]));
    cursor = next;
  }
  throw new Error("Notes exceed pages");
}
