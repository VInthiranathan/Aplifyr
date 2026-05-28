import type { NextApiRequest, NextApiResponse } from "next";
import {
  createServerClient,
  parseCookieHeader,
  serializeCookieHeader,
} from "@supabase/auth-helpers-nextjs";

function appendSetCookie(res: NextApiResponse, values: string[]) {
  const existing = res.getHeader("Set-Cookie");
  const existingArray =
    typeof existing === "string"
      ? [existing]
      : Array.isArray(existing)
        ? existing
        : [];

  res.setHeader("Set-Cookie", [...existingArray, ...values]);
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const cookieHeader = req.headers.cookie ?? "";
  const parsed = parseCookieHeader(cookieHeader);

  if (!supabaseUrl || !supabaseAnonKey) {
    return res.status(500).json({ error: "Supabase not configured" });
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return parsed.map((c) => ({ name: c.name, value: c.value ?? "" }));
      },
      setAll(cookies) {
        const setCookie = cookies.map(({ name, value, options }) =>
          serializeCookieHeader(name, value, options),
        );
        appendSetCookie(res, setCookie);
      },
    },
  });

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("cv_storage_path")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    return res.status(500).json({ error: profileError.message });
  }

  if (profile?.cv_storage_path) {
    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from("cvs")
      .createSignedUrl(profile.cv_storage_path, 60);

    if (signedUrlError || !signedUrlData?.signedUrl) {
      return res.status(500).json({
        error: signedUrlError?.message ?? "Could not create signed CV URL",
      });
    }

    res.writeHead(302, { Location: signedUrlData.signedUrl });
    res.end();
    return;
  }

  return res.status(404).json({ error: "CV not found" });
}