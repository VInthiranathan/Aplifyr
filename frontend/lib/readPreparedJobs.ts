import type { SupabaseClient } from "@supabase/supabase-js";
import type { PreparedJob } from "../types/api";
export async function readPreparedJobs(
  client: SupabaseClient,
  owner: string,
): Promise<PreparedJob[]> {
  const result: PreparedJob[] = [];
  let cursor = "";
  for (let page = 0; page < 201; page++) {
    let query = client
      .from("prepared_jobs")
      .select(
        "job_id,job_context,has_cv,cv_expires_at,has_cover_letter,cover_letter_expires_at,updated_at",
      )
      .eq("user_id", owner)
      .order("job_id")
      .limit(100);
    if (cursor) query = query.gt("job_id", cursor);
    const { data, error } = await query;
    if (error || !Array.isArray(data)) throw Error("Prepared jobs unavailable");
    if (!data.length) return result;
    const next = data[data.length - 1].job_id;
    if (
      typeof next !== "string" ||
      !/^[A-Za-z0-9_-]{1,100}$/.test(next) ||
      next === cursor ||
      result.length + data.length > 200
    )
      throw Error("Prepared jobs exceed bounds");
    result.push(...(data as PreparedJob[]));
    cursor = next;
  }
  throw Error("Prepared jobs exceed pages");
}
