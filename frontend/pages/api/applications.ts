import type { NextApiRequest, NextApiResponse } from "next";
import { serverSupabase } from "../../lib/serverSupabase";
import { isSafeMutation } from "../../lib/apiSecurity";
import {
  ApplicationValidationError,
  isIsoDate,
  isJobId,
  validateApplicationRevision,
  validateApplicationUpdate,
  validateJobContext,
} from "../../lib/applicationValidation";

const columns = "job_id,job_context,status,applied_at,next_step,next_step_at,notes,created_at,updated_at";
export const config = { api: { bodyParser: { sizeLimit: "16kb" } } };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader("Cache-Control", "private, no-store");
  if (!["GET", "POST", "PUT", "DELETE"].includes(req.method ?? "")) {
    res.setHeader("Allow", "GET, POST, PUT, DELETE");
    return res.status(405).json({ code: "methodNotAllowed" });
  }
  if (req.method !== "GET" && !isSafeMutation(req)) return res.status(403).json({ code: "forbidden" });

  try {
    const supabase = serverSupabase(req, res);
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return res.status(401).json({ code: "unauthenticated" });
    const table = () => supabase.from("job_applications");

    if (req.method === "GET") {
      const jobId = Array.isArray(req.query.jobId) ? req.query.jobId[0] : req.query.jobId;
      if (!isJobId(jobId)) return res.status(400).json({ field: "jobId", code: "invalid" });
      const { data, error } = await table().select(columns).eq("user_id", user.id).eq("job_id", jobId).maybeSingle();
      if (error) return res.status(503).json({ code: "loadError" });
      return res.status(200).json({ application: data });
    }

    if (req.method === "POST") {
      const body = req.body as Record<string, unknown>;
      if (!isJobId(body?.jobId)) throw new ApplicationValidationError("jobId");
      if (!isIsoDate(body.appliedAt)) throw new ApplicationValidationError("appliedAt");
      const jobContext = validateJobContext(body.jobContext, body.jobId);
      const { error } = await table().upsert({
        user_id: user.id,
        job_id: body.jobId,
        job_context: jobContext,
        applied_at: body.appliedAt,
      }, { onConflict: "user_id,job_id", ignoreDuplicates: true });
      if (error) return res.status(503).json({ code: "saveError" });
      const result = await table().select(columns).eq("user_id", user.id).eq("job_id", body.jobId).single();
      if (result.error) return res.status(503).json({ code: "saveError" });
      return res.status(201).json({ application: result.data });
    }

    if (req.method === "DELETE") {
      const revision = validateApplicationRevision(req.body);
      const { data, error } = await table().delete().eq("user_id", user.id).eq("job_id", revision.jobId)
        .eq("updated_at", revision.updatedAt).select("job_id").maybeSingle();
      if (error) return res.status(503).json({ code: "saveError" });
      if (!data) return res.status(409).json({ code: "conflict" });
      return res.status(200).json({ jobId: data.job_id });
    }

    const update = validateApplicationUpdate(req.body);
    if (req.method === "PUT") {
      const { data, error } = await table().update({
        status: update.status,
        applied_at: update.appliedAt,
        next_step: update.nextStep,
        next_step_at: update.nextStepAt,
        notes: update.notes,
      }).eq("user_id", user.id).eq("job_id", update.jobId).eq("updated_at", update.updatedAt)
        .select(columns).maybeSingle();
      if (error) return res.status(503).json({ code: "saveError" });
      if (!data) return res.status(409).json({ code: "conflict" });
      return res.status(200).json({ application: data });
    }

    return res.status(405).json({ code: "methodNotAllowed" });
  } catch (error) {
    if (error instanceof ApplicationValidationError) return res.status(400).json({ field: error.field, code: "invalid" });
    return res.status(503).json({ code: "unavailable" });
  }
}
