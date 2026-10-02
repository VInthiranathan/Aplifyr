import type { NextApiRequest, NextApiResponse } from "next";
import { serverSupabase } from "../../lib/serverSupabase";
import { readPreparedJobs } from "../../lib/readPreparedJobs";
import { activePreparation } from "../../lib/jobProgress";
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
    const rows = await readPreparedJobs(client, user.id);
    const jobs = rows.flatMap((row) => {
      const p = activePreparation(row);
      return p.hasCv || p.hasLetter
        ? [{ ...row, has_cv: p.hasCv, has_cover_letter: p.hasLetter }]
        : [];
    });
    return res.status(200).json({ jobs });
  } catch {
    return res.status(503).json({ code: "unavailable" });
  }
}
