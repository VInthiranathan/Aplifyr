import { readPreparedJobs } from "../../lib/readPreparedJobs";
import type { NextApiRequest, NextApiResponse } from "next";
import { serverSupabase } from "../../lib/serverSupabase";
import { readApplicationStatuses } from "../../lib/readApplications";
import { readJobNotes } from "../../lib/readJobNotes";
import { activePreparation, type JobProgress } from "../../lib/jobProgress";
import type { PreparedJob } from "../../types/api";
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  res.setHeader("Cache-Control", "private, no-store");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ code: "methodNotAllowed" });
  }
  try {
    const client = serverSupabase(req, res);
    const {
      data: { user },
      error,
    } = await client.auth.getUser();
    if (error || !user)
      return res.status(401).json({ code: "unauthenticated" });
    const [applications, notes, prepared] = await Promise.all([
      readApplicationStatuses(client, user.id),
      readJobNotes(client, user.id, true),
      readPreparedJobs(client, user.id),
    ]);
    const progress: Record<string, JobProgress> = {};
    for (const row of prepared)
      progress[row.job_id] = activePreparation(row as PreparedJob);
    for (const row of notes)
      progress[row.job_id] = {
        ...(progress[row.job_id] ?? { hasCv: false, hasLetter: false }),
        hasNotes: true,
      };
    for (const row of applications)
      progress[row.job_id] = {
        ...(progress[row.job_id] ?? { hasCv: false, hasLetter: false }),
        status: row.status,
      };
    return res.status(200).json({ owner: user.id, progress });
  } catch {
    return res.status(503).json({ code: "unavailable" });
  }
}
