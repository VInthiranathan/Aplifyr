import type { NextApiRequest, NextApiResponse } from "next";
import {
  createServerClient,
  parseCookieHeader,
  serializeCookieHeader,
} from "@supabase/auth-helpers-nextjs";
import formidable from "formidable";
import fs from "fs";

// Disable default body parser
export const config = {
  api: {
    bodyParser: false,
  },
};

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
  if (req.method !== "POST") {
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

  try {
    const form = formidable({ maxFileSize: 5 * 1024 * 1024 }); // 5MB max

    const [fields, files] = await form.parse(req);

    const fileArray = files.file;
    if (!fileArray || fileArray.length === 0) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const file = fileArray[0];
    const fileName = `${user.id}/cv-${Date.now()}.pdf`;

    // Read file content
    const fileBuffer = fs.readFileSync(file.filepath);

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("cvs")
      .upload(fileName, fileBuffer, {
        contentType: file.mimetype || "application/pdf",
        upsert: false,
      });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      return res.status(500).json({ error: uploadError.message });
    }

    // Get public URL
    const {
      data: { publicUrl },
    } = supabase.storage.from("cvs").getPublicUrl(fileName);

    // Update profile with CV URL
    const { error: updateError } = await supabase
      .from("profiles")
      .update({ cv_url: publicUrl })
      .eq("id", user.id);

    if (updateError) {
      console.error("Profile update error:", updateError);
      return res.status(500).json({ error: updateError.message });
    }

    // Clean up temp file
    fs.unlinkSync(file.filepath);

    return res.status(200).json({ cv_url: publicUrl });
  } catch (e) {
    console.error("Upload handler error:", e);
    const message = e instanceof Error ? e.message : String(e);
    return res.status(500).json({ error: message });
  }
}
