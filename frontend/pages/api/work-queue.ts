import type { NextApiRequest, NextApiResponse } from "next";
import { serverSupabase } from "../../lib/serverSupabase";
import { readApplicationQueue } from "../../lib/readApplications";
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
    return res
      .status(200)
      .json({ applications: await readApplicationQueue(client, user.id) });
  } catch {
    return res.status(503).json({ code: "unavailable" });
  }
}
