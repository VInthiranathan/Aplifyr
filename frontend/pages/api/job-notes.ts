import type { NextApiRequest, NextApiResponse } from "next";
import { serverSupabase } from "../../lib/serverSupabase";
import { isSafeMutation } from "../../lib/apiSecurity";
import { isJobId } from "../../lib/applicationValidation";
export const config = { api: { bodyParser: { sizeLimit: "24kb" } } };
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  res.setHeader("Cache-Control", "private, no-store");
  if (!["GET", "PUT", "DELETE"].includes(req.method ?? "")) {
    res.setHeader("Allow", "GET, PUT, DELETE");
    return res.status(405).json({ code: "methodNotAllowed" });
  }
  if (req.method !== "GET" && !isSafeMutation(req))
    return res.status(403).json({ code: "forbidden" });
  const jobId = req.method === "GET" ? req.query.jobId : req.body?.jobId;
  if (!isJobId(jobId)) return res.status(400).json({ code: "invalid" });
  try {
    const client = serverSupabase(req, res);
    const {
      data: { user },
      error,
    } = await client.auth.getUser();
    if (error || !user)
      return res.status(401).json({ code: "unauthenticated" });
    const table = () => client.from("job_notes");
    if (req.method === "GET") {
      const { data, error } = await table()
        .select("job_id,notes,updated_at")
        .eq("user_id", user.id)
        .eq("job_id", jobId)
        .maybeSingle();
      return error
        ? res.status(503).json({ code: "unavailable" })
        : res.status(200).json({ note: data });
    }
    const revision = req.body?.updatedAt;
    if (
      revision !== null &&
      (typeof revision !== "string" || !Number.isFinite(Date.parse(revision)))
    )
      return res.status(400).json({ code: "invalid" });
    if (req.method === "DELETE") {
      if (!revision) return res.status(400).json({ code: "invalid" });
      const { data, error } = await table()
        .delete()
        .eq("user_id", user.id)
        .eq("job_id", jobId)
        .eq("updated_at", revision)
        .select("job_id")
        .maybeSingle();
      return error
        ? res.status(503).json({ code: "unavailable" })
        : !data
          ? res.status(409).json({ code: "conflict" })
          : res.status(200).json({ deleted: true });
    }
    if (
      typeof req.body?.notes !== "string" ||
      req.body.notes.length > 5000 ||
      !req.body.notes.trim() ||
      /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(req.body.notes)
    )
      return res.status(400).json({ code: "invalid" });
    const query =
      revision === null
        ? table().insert({
            user_id: user.id,
            job_id: jobId,
            notes: req.body.notes,
          })
        : table()
            .update({ notes: req.body.notes })
            .eq("user_id", user.id)
            .eq("job_id", jobId)
            .eq("updated_at", revision);
    const { data, error: writeError } = await query
      .select("job_id,notes,updated_at")
      .maybeSingle();
    if (writeError)
      return res
        .status(["23505", "54000"].includes(writeError.code) ? 409 : 503)
        .json({
          code:
            writeError.code === "54000"
              ? "capacity"
              : writeError.code === "23505"
                ? "conflict"
                : "unavailable",
        });
    if (!data) return res.status(409).json({ code: "conflict" });
    return res.status(200).json({ note: data });
  } catch {
    return res.status(503).json({ code: "unavailable" });
  }
}
